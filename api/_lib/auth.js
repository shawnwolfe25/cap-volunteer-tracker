import { db } from './redis.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
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

export function canVerifyFor(user, cadet) {
  if (!user || !cadet) return false;
  if (user.role === 'admin' || user.role === 'senior') return true;
  if (user.role === 'parent' && Array.isArray(user.linkedCadetIds)) {
    return user.linkedCadetIds.includes(cadet.id);
  }
  return false;
}

export function canEditEntry(user, cadet, entry) {
  if (!user || !cadet || !entry) return false;
  if (user.role === 'admin' || user.role === 'senior') return true;
  // Cadets cannot edit or delete any entry once submitted — integrity control.
  // They may only add new entries; a senior/parent/admin corrects or removes a bad one.
  if (user.role === 'parent' && Array.isArray(user.linkedCadetIds) && user.linkedCadetIds.includes(cadet.id)) return true;
  return false;
}

// CAPID doubles as a temporary login credential (see /api/auth/login-capid), so it's
// only shown to the cadet it belongs to, plus admin/senior/parent who need it for
// recordkeeping and CAPF 2a submission. Other cadets never see a peer's CAPID.
export function canSeeCapid(user, cadet) {
  if (!user || !cadet) return false;
  if (user.role !== 'cadet') return true;
  return user.cadetId === cadet.id;
}

export function sendJson(res, status, body) {
  res.status(status).json(body);
}
