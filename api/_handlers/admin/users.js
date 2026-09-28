import { getSessionUser, normEmail } from '../../_lib/auth.js';
import { getUserByEmail } from '../../_lib/model.js';
import { db } from '../../_lib/redis.js';

// Admin-only login-code lookup. Adding and editing accounts lives in people.js.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });

  if (req.method === 'GET') {
    // ?loginCode=email@example.com looks up a pending 6-digit login code (see
    // /api/auth/request-code) so the admin can read/text it to someone whose email
    // never lands (gov mail filtering, etc.) instead of weakening the login check
    // itself. Folded into this endpoint rather than its own file to stay under
    // Vercel's Hobby-plan 12-serverless-function-per-deployment limit.
    if (req.query?.loginCode) {
      const email = normEmail(req.query.loginCode);
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      const lookupUser = await getUserByEmail(email);
      if (!lookupUser) return res.status(404).json({ error: 'No account with that email.' });

      const redis = db();
      const raw = await redis.get(`login:pending:${email}`);
      if (!raw) {
        return res.status(404).json({
          error: 'No pending code. Ask them to tap "Email me a login code" first, then look it up here.',
        });
      }
      const pending = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json({
        email,
        name: lookupUser.name,
        role: lookupUser.role,
        code: pending.code,
        requestedAt: pending.requestedAt,
      });
    }

    return res.status(400).json({ error: 'Pass ?loginCode=<email>.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
