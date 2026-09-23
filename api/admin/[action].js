import users from '../_handlers/admin/users.js';
import cadets from '../_handlers/admin/cadets.js';
import seed from '../_handlers/admin/seed.js';

// One serverless function for all /api/admin/* routes (see api/auth/[action].js for why).
// Each handler does its own auth check: users/cadets require an admin/senior session,
// seed requires SEED_SECRET. URLs unchanged.
const routes = { users, cadets, seed };

export default async function handler(req, res) {
  const fn = routes[req.query?.action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  return fn(req, res);
}
