import { createSession, clientIp, rateLimit, TOO_MANY } from '../../_lib/auth.js';
import { getCadet, getUserByEmail } from '../../_lib/model.js';

// Temporary cadet login path while squadron .gov/.cap.gov addresses aren't receiving
// the emailed login code reliably. A cadet enters their CAPID and is signed straight
// into their own account — no email round-trip. Only works for accounts with role
// "cadet" whose cadetId matches the CAPID looked up. Senior/parent/admin accounts
// have no CAPID and are unaffected; they keep using the email + code flow.
//
// CAPIDs are 6-digit and not secret, so this path is rate limited hard: 10 tries per
// IP and 5 per CAPID per 15 minutes. That makes guessing a valid CAPID impractical
// without stopping a real cadet who fat-fingers their number once or twice.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const capid = String(req.body?.capid || '').trim();
  if (!capid || !/^\d{4,8}$/.test(capid)) return res.status(400).json({ error: 'Enter your CAPID.' });

  const ip = clientIp(req);
  const okIp = await rateLimit(`capid:ip:${ip}`, 10, 15 * 60);
  const okId = await rateLimit(`capid:id:${capid}`, 5, 15 * 60);
  if (!okIp || !okId) return res.status(429).json(TOO_MANY);

  const cadet = await getCadet(capid);
  if (!cadet || !cadet.email) {
    return res.status(404).json({ error: 'CAPID not found. Check the number, or ask your admin.' });
  }
  if (cadet.archived) {
    return res.status(403).json({ error: 'This cadet account has been archived. Ask your squadron admin if that’s a mistake.' });
  }

  const user = await getUserByEmail(cadet.email);
  if (!user || user.role !== 'cadet' || user.cadetId !== cadet.id) {
    return res.status(404).json({ error: 'No cadet login is set up for that CAPID yet. Ask your admin.' });
  }

  const sessionToken = await createSession(user.email);
  return res.status(200).json({ sessionToken, user });
}
