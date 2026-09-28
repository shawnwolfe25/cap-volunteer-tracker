import { createSession, clientIp, rateLimit, TOO_MANY } from '../../_lib/auth.js';
import { getCadet, getUserByEmail, getMemberIdByCapid, memberType } from '../../_lib/model.js';

// CAPID sign-in, for while squadron .gov/.cap.gov addresses aren't receiving the emailed
// login code reliably. A cadet or senior member enters their CAPID and is signed straight
// into their own account — no email round-trip. Only works when the login account's
// role matches the roster record: role "cadet" with that cadetId, or role "senior" with
// that memberId. Admin and parent accounts never sign in this way; they use email + code.
//
// CAPIDs are 6-digit and not secret outside this app (the app itself never displays
// them), so this path is rate limited hard: 10 tries per IP and 5 per CAPID per 15
// minutes. That makes guessing a valid CAPID impractical without stopping a real member
// who fat-fingers their number once or twice.
const NOT_FOUND = 'CAPID not found. Check the number, or ask your admin.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const capid = String(req.body?.capid || '').trim();
  if (!capid || !/^\d{4,8}$/.test(capid)) return res.status(400).json({ error: 'Enter your CAPID.' });

  const ip = clientIp(req);
  const okIp = await rateLimit(`capid:ip:${ip}`, 10, 15 * 60);
  const okId = await rateLimit(`capid:id:${capid}`, 5, 15 * 60);
  if (!okIp || !okId) return res.status(429).json(TOO_MANY);

  const id = await getMemberIdByCapid(capid);
  const member = id ? await getCadet(id) : null;
  if (!member || !member.email) return res.status(404).json({ error: NOT_FOUND });
  if (member.archived) {
    return res.status(403).json({ error: 'This account has been archived. Ask your squadron admin if that’s a mistake.' });
  }

  const user = await getUserByEmail(member.email);
  const matches =
    memberType(member) === 'senior'
      ? user?.role === 'senior' && user.memberId === member.id
      : user?.role === 'cadet' && user.cadetId === member.id;
  if (!matches) {
    return res.status(404).json({ error: 'CAPID sign-in isn’t set up for this account. Use your email instead, or ask your admin.' });
  }

  const sessionToken = await createSession(user.email);
  return res.status(200).json({ sessionToken, user });
}
