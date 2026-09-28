import { getSessionUser, normEmail } from '../../_lib/auth.js';
import { db } from '../../_lib/redis.js';
import {
  getCadet,
  getUserByEmail,
  saveUser,
  getMemberIdByCapid,
  memberType,
  newMemberId,
  publicMember,
  MEMBER_TYPES,
} from '../../_lib/model.js';

const TYPE_LABEL = { cadet: 'cadet', senior: 'senior member' };

// Admin/senior: add a cadet or senior member, or update one. The CAPID is write-only —
// it's stored for CAPID sign-in but never sent back. To update, pass the member's `id`
// (from the roster) and leave `capid` blank to keep it, or type a CAPID with no `id` and
// the matching record is updated, same as before private ids existed.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (!['admin', 'senior'].includes(user.role)) return res.status(403).json({ error: 'Admins/seniors only.' });

  const redis = db();

  if (req.method === 'POST') {
    const { id: rawId, type: rawType, capid: rawCapid, firstName, lastName, email, parentEmails } = req.body || {};
    const type = MEMBER_TYPES.includes(rawType) ? rawType : 'cadet';
    const capid = String(rawCapid || '').trim();
    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
    if (capid && !/^\d{4,8}$/.test(capid)) return res.status(400).json({ error: 'CAPID should be a number.' });

    let existing = null;
    if (rawId) {
      existing = await getCadet(String(rawId));
      if (!existing) return res.status(404).json({ error: 'Member not found.' });
    } else {
      if (!capid) return res.status(400).json({ error: 'CAPID is required for a new member.' });
      const found = await getMemberIdByCapid(capid);
      existing = found ? await getCadet(found) : null;
    }
    if (existing && memberType(existing) !== type) {
      return res.status(400).json({
        error: `That CAPID belongs to a ${TYPE_LABEL[memberType(existing)]}, not a ${TYPE_LABEL[type]}.`,
      });
    }
    // Legacy records (id === CAPID, from before migration) keep their id until the admin
    // runs the migration; everything new gets a private random id.
    const id = existing?.id || newMemberId();

    // CAPIDs must be unique across cadets and senior members — it's a login.
    if (capid && capid !== existing?.capid) {
      const owner = await getMemberIdByCapid(capid);
      if (owner && owner !== id) return res.status(400).json({ error: 'That CAPID is already on another member.' });
    }
    const finalCapid = capid || existing?.capid || '';

    const newEmail = normEmail(email) || existing?.email || '';
    const oldEmail = existing?.email || '';

    // Don't point a roster record at an email whose account can't sign in as them.
    if (newEmail && newEmail !== oldEmail) {
      const taken = await getUserByEmail(newEmail);
      if (taken) {
        if (type === 'cadet') {
          if (taken.role !== 'cadet') {
            return res.status(400).json({ error: `${newEmail} already belongs to a ${taken.role} account.` });
          }
          if (taken.cadetId && taken.cadetId !== id) {
            return res.status(400).json({ error: `${newEmail} is already used by another cadet.` });
          }
        } else {
          if (!['senior', 'admin'].includes(taken.role)) {
            return res.status(400).json({ error: `${newEmail} already belongs to a ${taken.role} account.` });
          }
          if (taken.memberId && taken.memberId !== id) {
            return res.status(400).json({ error: `${newEmail} is already linked to another senior member.` });
          }
        }
      }
    }

    const member = {
      ...(existing || {}),
      id,
      type,
      capid: finalCapid,
      firstName: String(firstName).trim().slice(0, 80),
      lastName: String(lastName).trim().slice(0, 80),
      email: newEmail,
      parentEmails: Array.isArray(parentEmails) ? parentEmails : existing?.parentEmails || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await redis.set(`cadets:${id}`, JSON.stringify(member));
    await redis.sadd('cadets:index', id);
    if (finalCapid) await redis.set(`capid:${finalCapid}`, id);
    if (existing?.capid && existing.capid !== finalCapid) {
      const pointsHere = await redis.get(`capid:${existing.capid}`);
      if (String(pointsHere) === id) await redis.del(`capid:${existing.capid}`);
    }

    // Keep the login account in step with the roster record. Without this, changing an
    // email from the Admin screen breaks both CAPID and email login for them.
    if (newEmail) {
      const current = await getUserByEmail(newEmail);
      const name = `${member.firstName} ${member.lastName}`;
      if (type === 'cadet') {
        await saveUser({
          email: newEmail,
          name,
          role: 'cadet',
          cadetId: id,
          createdAt: current?.createdAt || new Date().toISOString(),
        });
      } else if (current) {
        // Existing senior or admin account: link it, keep its role and everything else.
        await saveUser({ ...current, memberId: id });
      } else {
        await saveUser({ email: newEmail, name, role: 'senior', memberId: id, createdAt: new Date().toISOString() });
      }

      // Retire the old login if the email actually changed.
      if (oldEmail && oldEmail !== newEmail) {
        const old = await getUserByEmail(oldEmail);
        if (old && old.role === 'cadet' && old.cadetId === id) {
          await redis.del(`users:${oldEmail}`);
          await redis.srem('users:index', oldEmail);
        } else if (old && old.memberId === id) {
          if (old.role === 'senior') {
            await redis.del(`users:${oldEmail}`);
            await redis.srem('users:index', oldEmail);
          } else {
            // An admin account: never delete it, just unlink the roster record.
            const { memberId, ...rest } = old;
            await saveUser(rest);
          }
        }
      }
    }

    return res.status(201).json({ cadet: publicMember(member) });
  }

  // Archive / restore. Archiving keeps the record, every hour entry, and the printable
  // report — it just hides them from the roster and blocks sign-in and new entries. Use
  // it when someone transfers, ages out, or goes inactive. Reversible.
  if (req.method === 'PATCH') {
    const { id: rawId, archived } = req.body || {};
    const id = String(rawId || '').trim();
    if (!id) return res.status(400).json({ error: 'Member id required.' });
    const existing = await getCadet(id);
    if (!existing) return res.status(404).json({ error: 'Member not found.' });

    const member = {
      ...existing,
      archived: Boolean(archived),
      archivedAt: archived ? existing.archivedAt || new Date().toISOString() : null,
      archivedBy: archived ? existing.archivedBy || user.email : null,
    };
    await redis.set(`cadets:${member.id}`, JSON.stringify(member));
    return res.status(200).json({ cadet: publicMember(member) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
