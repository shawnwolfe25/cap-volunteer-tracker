import { db } from '../../_lib/redis.js';
import { randomToken, randomCode, normEmail, clientIp, rateLimit, TOO_MANY } from '../../_lib/auth.js';
import { getUserByEmail, getCadet } from '../../_lib/model.js';
import { sendLoginEmail } from '../../_lib/email.js';

const CODE_TTL_SECONDS = 60 * 15; // 15 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = normEmail(req.body?.email);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  // Stops someone burning the EmailJS quota or spamming a member's inbox.
  const ip = clientIp(req);
  const okIp = await rateLimit(`reqcode:ip:${ip}`, 20, 60 * 60);
  const okEmail = await rateLimit(`reqcode:email:${email}`, 5, 15 * 60);
  if (!okIp || !okEmail) return res.status(429).json(TOO_MANY);

  const user = await getUserByEmail(email);
  if (!user) {
    // Do not reveal whether the account exists beyond this generic message.
    return res.status(404).json({
      error: 'That email isn’t set up yet. Ask your squadron admin to add you before logging in.',
    });
  }
  if (user.role === 'cadet' && user.cadetId) {
    const cadet = await getCadet(user.cadetId);
    if (cadet?.archived) {
      return res.status(403).json({ error: 'This cadet account has been archived. Ask your squadron admin if that’s a mistake.' });
    }
  }

  const token = randomToken(20);
  const code = randomCode();
  const redis = db();
  await redis.set(`login:token:${token}`, JSON.stringify({ email, code }), { ex: CODE_TTL_SECONDS });
  // also index by email+code so typing the 6-digit code works without the link
  await redis.set(`login:code:${email}:${code}`, token, { ex: CODE_TTL_SECONDS });
  // Admin-lookup copy: lets an admin read/text the code to someone whose email never
  // arrives (gov mail filtering, etc.) without weakening the check itself — the code
  // is still the real secret, just hand-delivered. Set before the send attempt so
  // lookup works even if EmailJS reports a failure (or a false success).
  await redis.set(
    `login:pending:${email}`,
    JSON.stringify({ code, requestedAt: new Date().toISOString() }),
    { ex: CODE_TTL_SECONDS }
  );

  const base = process.env.APP_BASE_URL || 'http://localhost:5173';
  const magicLink = `${base}/verify?token=${token}`;

  try {
    await sendLoginEmail({ toEmail: email, toName: user.name, code, magicLink });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not send the login email. Try again in a minute.' });
  }

  return res.status(200).json({ ok: true });
}
