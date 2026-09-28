import { db } from './redis.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 6-digit login code from the crypto RNG (Math.random isn't unpredictable enough
// for a secret). Rejection sampling keeps every code 000000-999999 equally likely.
export function randomCode() {
  const arr = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  do {
    crypto.getRandomValues(arr);
  } while (arr[0] >= limit);
  return String(arr[0] % 1000000).padStart(6, '0');
}

export function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Best-effort client IP behind Vercel's proxy. Good enough for rate limiting;
// not treated as an identity anywhere.
export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  const first = Array.isArray(xf) ? xf[0] : typeof xf === 'string' ? xf.split(',')[0] : '';
  return (first || req.socket?.remoteAddress || 'unknown').trim();
}

// Fixed-window rate limiter on Redis. Returns true when the call is allowed.
// key: what to throttle (e.g. "capid:ip:1.2.3.4"), limit: max hits per window.
export async function rateLimit(key, limit, windowSeconds) {
  const redis = db();
  const k = `rl:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSeconds);
  return count <= limit;
}

export const TOO_MANY = { error: 'Too many attempts. Wait 15 minutes and try again.' };

export async function createSession(email) {
  const redis = db();
  const token = randomToken(24);
  await redis.set(`session:${token}`, JSON.stringify({ email }), { ex: SESSION_TTL_SECONDS });
  return token;
}

export async function getSessionUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return null;
  const redis = db();
  const raw = await redis.get(`session:${token}`);
  if (!raw) return null;
  const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const userRaw = await redis.get(`users:${session.email}`);
  if (!userRaw) return null;
  const user = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
  return user;
}

export function requireRole(user, roles) {
  if (!user) return false;
  return roles.includes(user.role);
}

const isSeniorLike = (user) => user.role === 'admin' || user.role === 'senior';

// The member record this login belongs to, if any: cadets via cadetId, senior members
// (and admins who are also on the senior roster) via memberId.
export function ownMemberId(user) {
  if (!user) return null;
  return user.role === 'cadet' ? user.cadetId || null : user.memberId || null;
}

// Who can add a new hour entry to a roster record. Cadets: seniors/admins, the cadet
// themself, or a linked parent. Senior members: any senior/admin, including their own.
export function canLogFor(user, member) {
  if (!user || !member || member.archived) return false;
  if (isSeniorLike(user)) return true;
  if (member.type === 'senior') return false;
  if (user.role === 'cadet') return user.cadetId === member.id;
  if (user.role === 'parent') return (user.linkedCadetIds || []).includes(member.id);
  return false;
}

export function canVerifyFor(user, member) {
  if (!user || !member) return false;
  // Nobody verifies, edits, or deletes hours on their own record.
  if (ownMemberId(user) === member.id) return false;
  if (isSeniorLike(user)) return true;
  if (member.type === 'senior') return false;
  if (user.role === 'parent' && Array.isArray(user.linkedCadetIds)) {
    return user.linkedCadetIds.includes(member.id);
  }
  return false;
}

// Cadets cannot edit or delete any entry once submitted — integrity control. They may
// only add new entries; a senior/parent/admin corrects or removes a bad one. Same rule
// for a senior member's own record: another senior or admin fixes it.
export function canEditEntry(user, member, entry) {
  if (!entry) return false;
  return canVerifyFor(user, member);
}

export function sendJson(res, status, body) {
  res.status(status).json(body);
}
