import requestCode from '../_handlers/auth/request-code.js';
import verify from '../_handlers/auth/verify.js';
import loginCapid from '../_handlers/auth/login-capid.js';

// One serverless function for all /api/auth/* routes. Vercel's Hobby plan caps a
// deployment at 12 functions, so related routes share a router; the real handlers
// live in api/_handlers (underscore-prefixed dirs aren't deployed as functions).
// URLs are unchanged: /api/auth/request-code, /api/auth/verify, /api/auth/login-capid.
const routes = {
  'request-code': requestCode,
  verify,
  'login-capid': loginCapid,
};

export default async function handler(req, res) {
  const fn = routes[req.query?.action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  return fn(req, res);
}
