import { db } from '../../_lib/redis.js';
import { createSession, normEmail, clientIp, rateLimit, TOO_MANY } from '../../_lib/auth.js';
import { getUserByEmail } from '../../_lib/model.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const redis = db();
  const { token, email: rawEmail, code } = req.body || {};

  let email = null;

  if (token) {
    // Magic-link tokens are 40 hex chars — not guessable — so only a loose per-IP cap here.
    if (!(await rateLimit(`verify:ip:${clientIp(req)}`, 30, 15 * 60))) return res.status(429).json(TOO_MANY);
    const raw = await redis.get(`login:token:${token}`);
    if (!raw) return res.status(400).json({ error: 'That login link expired. Request a new one.' });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    email = data.email;
    await redis.del(`login:token:${token}`);
  } else if (rawEmail && code) {
    email = normEmail(rawEmail);
    // 6-digit codes are guessable given enough tries, so cap attempts per email
    // per window. 5 wrong guesses = wait 15 minutes (or request a fresh code, which
    // is itself rate limited). Makes brute force a non-starter.
    const okEmail = await rateLimit(`verify:email:${email}`, 5, 15 * 60);
    const okIp = await rateLimit(`verify:ip:${clientIp(req)}`, 30, 15 * 60);
    if (!okEmail || !okIp) return res.status(429).json(TOO_MANY);

    const tokenKey = `login:code:${email}:${String(code).trim()}`;
    const linkedToken = await redis.get(tokenKey);
    if (!linkedToken) return res.status(400).json({ error: 'That code is invalid or expired.' });
    await redis.del(tokenKey);
    await redis.del(`login:token:${linkedToken}`);
  } else {
    return res.status(400).json({ error: 'Missing token or code.' });
  }

  const user = await getUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  // Code's been used; clear the admin-lookup copy and the attempt counter.
  await redis.del(`login:pending:${email}`);
  await redis.del(`rl:verify:email:${email}`);

  const sessionToken = await createSession(email);
  return res.status(200).json({ sessionToken, user });
}
