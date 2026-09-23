import { getSessionUser, normEmail } from '../../_lib/auth.js';
import { db } from '../../_lib/redis.js';
import { getCadet, getUserByEmail, saveUser } from '../../_lib/model.js';

// Admin/senior: add a cadet manually, or update name/email.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (!['admin', 'senior'].includes(user.role)) return res.status(403).json({ error: 'Admins/seniors only.' });

  const redis = db();

  if (req.method === 'POST') {
    const { capid, firstName, lastName, email, parentEmails } = req.body || {};
    const id = String(capid || '').trim();
    if (!id || !firstName || !lastName) {
      return res.status(400).json({ error: 'CAPID, first name, and last name are required.' });
    }
    if (!/^\d{4,8}$/.test(id)) return res.status(400).json({ error: 'CAPID should be a number.' });

    const existing = await getCadet(id);
    const newEmail = normEmail(email) || existing?.email || '';
    const oldEmail = existing?.email || '';

    // Don't let a cadet be pointed at an email that already belongs to a senior/parent/admin.
    // That account would keep its role, so CAPID login would silently fail for the cadet.
    if (newEmail && newEmail !== oldEmail) {
      const taken = await getUserByEmail(newEmail);
      if (taken && taken.role !== 'cadet') {
        return res.status(400).json({ error: `${newEmail} already belongs to a ${taken.role} account.` });
      }
      if (taken && taken.role === 'cadet' && taken.cadetId && taken.cadetId !== id) {
        return res.status(400).json({ error: `${newEmail} is already used by another cadet.` });
      }
    }

    const cadet = {
      id,
      capid: id,
      firstName: String(firstName).trim().slice(0, 80),
      lastName: String(lastName).trim().slice(0, 80),
      email: newEmail,
      parentEmails: Array.isArray(parentEmails) ? parentEmails : existing?.parentEmails || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await redis.set(`cadets:${cadet.id}`, JSON.stringify(cadet));
    await redis.sadd('cadets:index', cadet.id);

    // Keep the login account in step with the cadet record. Without this, changing a
    // cadet's email from the Admin screen breaks both CAPID and email login for them.
    if (newEmail) {
      const current = await getUserByEmail(newEmail);
      await saveUser({
        email: newEmail,
        name: `${cadet.firstName} ${cadet.lastName}`,
        role: 'cadet',
        cadetId: id,
        createdAt: current?.createdAt || new Date().toISOString(),
      });
      // Retire the old cadet login if the email actually changed.
      if (oldEmail && oldEmail !== newEmail) {
        const old = await getUserByEmail(oldEmail);
        if (old && old.role === 'cadet' && old.cadetId === id) {
          await redis.del(`users:${oldEmail}`);
          await redis.srem('users:index', oldEmail);
        }
      }
    }

    return res.status(201).json({ cadet });
  }

  // Archive / restore. Archiving keeps the cadet record, every hour entry, and the
  // printable report — it just hides them from the roster and blocks sign-in and new
  // entries. Use it when a cadet transfers, ages out, or goes inactive. Reversible.
  if (req.method === 'PATCH') {
    const { capid, archived } = req.body || {};
    const id = String(capid || '').trim();
    if (!id) return res.status(400).json({ error: 'CAPID required.' });
    const existing = await getCadet(id);
    if (!existing) return res.status(404).json({ error: 'Cadet not found.' });

    const cadet = {
      ...existing,
      archived: Boolean(archived),
      archivedAt: archived ? existing.archivedAt || new Date().toISOString() : null,
      archivedBy: archived ? existing.archivedBy || user.email : null,
    };
    await redis.set(`cadets:${cadet.id}`, JSON.stringify(cadet));
    return res.status(200).json({ cadet });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
