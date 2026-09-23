import { db } from '../../_lib/redis.js';
import { clientIp, rateLimit, TOO_MANY } from '../../_lib/auth.js';
import { rosterSeed as roster } from '../../../data/roster-seed.js';

// One-time setup endpoint. Run once after deploying (see README) then consider
// changing SEED_SECRET so it can't be triggered again.
// POST /api/admin/seed  { "secret": "..." }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 5 tries per IP per hour — the secret shouldn't be guessable in the first place,
  // but this makes it moot.
  if (!(await rateLimit(`seed:ip:${clientIp(req)}`, 5, 60 * 60))) return res.status(429).json(TOO_MANY);

  const secret = req.body?.secret;
  if (!secret || !process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return res.status(403).json({ error: 'Invalid seed secret.' });
  }

  const redis = db();
  let cadetsCreated = 0;
  let cadetsSkipped = 0;

  for (const c of roster) {
    const id = c.capid;
    const exists = await redis.get(`cadets:${id}`);
    if (exists) {
      cadetsSkipped++;
      continue;
    }
    const cadet = {
      id,
      capid: c.capid,
      firstName: c.firstName,
      lastName: c.lastName,
      email: (c.email || '').toLowerCase(),
      parentEmails: [],
      createdAt: new Date().toISOString(),
    };
    await redis.set(`cadets:${id}`, JSON.stringify(cadet));
    await redis.sadd('cadets:index', id);

    // Create a login account for the cadet using their CAP email on file.
    if (cadet.email) {
      const userExists = await redis.get(`users:${cadet.email}`);
      if (!userExists) {
        await redis.set(
          `users:${cadet.email}`,
          JSON.stringify({
            email: cadet.email,
            name: `${cadet.firstName} ${cadet.lastName}`,
            role: 'cadet',
            cadetId: id,
            createdAt: new Date().toISOString(),
          })
        );
        await redis.sadd('users:index', cadet.email);
      }
    }
    cadetsCreated++;
  }

  // Bootstrap the admin (Shawn) account.
  const adminEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').toLowerCase();
  let adminCreated = false;
  if (adminEmail) {
    const exists = await redis.get(`users:${adminEmail}`);
    if (!exists) {
      await redis.set(
        `users:${adminEmail}`,
        JSON.stringify({
          email: adminEmail,
          name: process.env.ADMIN_BOOTSTRAP_NAME || 'Squadron Admin',
          role: 'admin',
          createdAt: new Date().toISOString(),
        })
      );
      await redis.sadd('users:index', adminEmail);
      adminCreated = true;
    }
  }

  return res.status(200).json({
    ok: true,
    cadetsCreated,
    cadetsSkipped,
    adminCreated,
  });
}
