import users from '../_handlers/admin/users.js';
import people from '../_handlers/admin/people.js';
import seed from '../_handlers/admin/seed.js';
import migrate from '../_handlers/admin/migrate.js';

// One serverless function for all /api/admin/* routes (see api/auth/[action].js for why).
// Each handler does its own auth check: users, people and migrate require an admin
// session, seed requires SEED_SECRET.
const routes = { users, people, seed, migrate };

export default async function handler(req, res) {
  const fn = routes[req.query?.action];
  if (!fn) return res.status(404).json({ error: 'Not found' });
  return fn(req, res);
}
