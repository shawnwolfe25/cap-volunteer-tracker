import { db } from './redis.js';

export const RIBBON_THRESHOLD = 60; // hours for base ribbon, and each bronze clasp after that

// CAP rule: the Community Service Ribbon is earned at 60 verified hours; a bronze
// clasp is added to it for each additional 60 hours after that (120, 180, 240...).
export function ribbonProgress(verifiedHours) {
  const hours = Math.max(0, verifiedHours || 0);
  const tier = Math.floor(hours / RIBBON_THRESHOLD); // 0 = not yet earned, 1 = ribbon, 2 = ribbon+1 clasp...
  const earned = tier >= 1;
  const clasps = earned ? tier - 1 : 0;
  const currentTierFloor = tier * RIBBON_THRESHOLD;
  const nextGoal = currentTierFloor + RIBBON_THRESHOLD;
  const hoursIntoTier = hours - currentTierFloor;
  return {
    hours,
    earned,
    clasps,
    nextGoal,
    hoursIntoTier,
    percentToNext: Math.min(100, Math.round((hoursIntoTier / RIBBON_THRESHOLD) * 100)),
  };
}

export async function getCadet(id) {
  const redis = db();
  const raw = await redis.get(`cadets:${id}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Many cadets in one pipeline round trip. Returns a Map of id -> cadet; ids that
// don't exist are simply missing from it.
export async function getCadetsByIds(ids) {
  const unique = [...new Set(ids)];
  const out = new Map();
  if (unique.length === 0) return out;
  const pipeline = db().pipeline();
  unique.forEach((id) => pipeline.get(`cadets:${id}`));
  const results = await pipeline.exec();
  results.forEach((r, i) => {
    const c = typeof r === 'string' ? JSON.parse(r) : r;
    if (c) out.set(unique[i], c);
  });
  return out;
}

export async function getAllCadets() {
  const redis = db();
  const ids = await redis.smembers('cadets:index');
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.get(`cadets:${id}`));
  const results = await pipeline.exec();
  return results
    .map((r) => (typeof r === 'string' ? JSON.parse(r) : r))
    .filter(Boolean)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function getEntriesForCadet(cadetId) {
  const redis = db();
  const ids = await redis.zrange(`cadet:${cadetId}:entries`, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.get(`entries:${id}`));
  const results = await pipeline.exec();
  return results.map((r) => (typeof r === 'string' ? JSON.parse(r) : r)).filter(Boolean);
}

// Entries for many cadets in two round trips instead of two per cadet. The roster
// page calls this; with 19 cadets it's the difference between ~40 Upstash REST calls
// and 2. Returns { [cadetId]: entries[] } with an entry for every id requested.
export async function getEntriesForCadets(cadetIds) {
  const out = Object.fromEntries(cadetIds.map((id) => [id, []]));
  if (cadetIds.length === 0) return out;
  const redis = db();

  const p1 = redis.pipeline();
  cadetIds.forEach((id) => p1.zrange(`cadet:${id}:entries`, 0, -1, { rev: true }));
  const idLists = await p1.exec();

  const flat = [];
  idLists.forEach((ids, i) => (ids || []).forEach((eid) => flat.push([cadetIds[i], eid])));
  if (flat.length === 0) return out;

  const p2 = redis.pipeline();
  flat.forEach(([, eid]) => p2.get(`entries:${eid}`));
  const raws = await p2.exec();
  raws.forEach((r, i) => {
    const e = typeof r === 'string' ? JSON.parse(r) : r;
    if (e) out[flat[i][0]].push(e);
  });
  return out;
}

export function summarizeHours(entries) {
  const verified = entries.filter((e) => e.status === 'verified');
  const pending = entries.filter((e) => e.status === 'pending');
  const totalVerified = round1(verified.reduce((sum, e) => sum + Number(e.hours || 0), 0));
  const totalPending = round1(pending.reduce((sum, e) => sum + Number(e.hours || 0), 0));
  const byYear = {};
  verified.forEach((e) => {
    const year = String(e.date || '').slice(0, 4) || 'unknown';
    byYear[year] = round1((byYear[year] || 0) + Number(e.hours || 0));
  });
  return { totalVerified, totalPending, byYear };
}

const EARLIEST_ENTRY_DATE = '2000-01-01';

// Entry dates must be a real YYYY-MM-DD calendar date, not in the future. "Today" is
// judged one day ahead of UTC so an evening entry from Central time (already tomorrow
// in UTC) isn't rejected. Returns an error message, or null when the date is fine.
export function entryDateError(date) {
  const s = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Enter the date as YYYY-MM-DD.';
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return 'That date doesn’t exist.';
  if (s < EARLIEST_ENTRY_DATE) return 'That date is too far in the past.';
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (s > latest) return 'Hours can’t be logged for a future date.';
  return null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export async function getEntry(id) {
  const redis = db();
  const raw = await redis.get(`entries:${id}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function saveEntry(entry) {
  const redis = db();
  await redis.set(`entries:${entry.id}`, JSON.stringify(entry));
  const ts = new Date(entry.date).getTime() || Date.now();
  await redis.zadd(`cadet:${entry.cadetId}:entries`, { score: ts, member: entry.id });
  if (entry.status === 'pending') {
    await redis.sadd('entries:pending', entry.id);
  } else {
    await redis.srem('entries:pending', entry.id);
  }
}

// Same as saveEntry for many entries, but one pipeline round trip instead of
// three sequential calls per entry. Used by the group-activity form.
export async function saveEntries(entries) {
  if (entries.length === 0) return;
  const redis = db();
  const p = redis.pipeline();
  for (const entry of entries) {
    p.set(`entries:${entry.id}`, JSON.stringify(entry));
    const ts = new Date(entry.date).getTime() || Date.now();
    p.zadd(`cadet:${entry.cadetId}:entries`, { score: ts, member: entry.id });
    if (entry.status === 'pending') p.sadd('entries:pending', entry.id);
    else p.srem('entries:pending', entry.id);
  }
  await p.exec();
}

export async function deleteEntry(entry) {
  const redis = db();
  await redis.del(`entries:${entry.id}`);
  await redis.zrem(`cadet:${entry.cadetId}:entries`, entry.id);
  await redis.srem('entries:pending', entry.id);
}

export async function getPendingEntries() {
  const redis = db();
  const ids = await redis.smembers('entries:pending');
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.get(`entries:${id}`));
  const results = await pipeline.exec();
  return results.map((r) => (typeof r === 'string' ? JSON.parse(r) : r)).filter(Boolean);
}

export async function getUserByEmail(email) {
  const redis = db();
  const raw = await redis.get(`users:${email}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function saveUser(user) {
  const redis = db();
  await redis.set(`users:${user.email}`, JSON.stringify(user));
  await redis.sadd('users:index', user.email);
}

export async function getAllUsers() {
  const redis = db();
  const emails = await redis.smembers('users:index');
  if (!emails || emails.length === 0) return [];
  const pipeline = redis.pipeline();
  emails.forEach((e) => pipeline.get(`users:${e}`));
  const results = await pipeline.exec();
  return results.map((r) => (typeof r === 'string' ? JSON.parse(r) : r)).filter(Boolean);
}
