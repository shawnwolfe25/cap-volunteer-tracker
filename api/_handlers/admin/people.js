import { getSessionUser, normEmail } from '../../_lib/auth.js';
import { db } from '../../_lib/redis.js';
import {
  getAllCadets,
  getAllUsers,
  getCadet,
  getUserByEmail,
  saveUser,
  getEntriesForCadet,
  getMemberIdByCapid,
  memberType,
  newMemberId,
} from '../../_lib/model.js';

// Admin-only people management: one place to add, edit, re-role, archive, and delete.
//
// A "person" is a login account (users:{email}), a roster record (cadets:{id}, type
// cadet|senior, where hours live), or both linked together — cadets via cadetId, senior
// members and admins via memberId. Role decides the shape:
//   cadet   roster record (type cadet) required; login optional (needs an email)
//   senior  login required; roster record (type senior) if they have a CAPID
//   admin   login required; roster record (type senior) if they have a CAPID
//   parent  login required; never on the roster; linked to one or more cadets
// Changing role keeps the same roster record, so logged hours follow the person.
//
//   GET                              -> { people }
//   POST   { memberId?, origEmail?, role, firstName, lastName, email, capid?, linkedCadetIds? }
//   PATCH  { memberId, archived }    -> archive / restore
//   DELETE ?memberId=&email=         -> delete login, roster record, and all their hours
const ROLES = ['cadet', 'senior', 'admin', 'parent'];

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });

  if (req.method === 'GET') return res.status(200).json({ people: await listPeople() });
  if (req.method === 'POST') return savePerson(req, res, user);
  if (req.method === 'PATCH') return archivePerson(req, res);
  if (req.method === 'DELETE') return deletePerson(req, res, user);
  return res.status(405).json({ error: 'Method not allowed' });
}

// The login account that belongs to a roster record, if any.
function linkedAccount(rec, usersByEmail) {
  const u = rec?.email ? usersByEmail.get(rec.email) : null;
  return u && (u.cadetId === rec.id || u.memberId === rec.id) ? u : null;
}

function splitName(name) {
  const s = String(name || '').trim();
  const i = s.lastIndexOf(' ');
  return i === -1 ? { firstName: s, lastName: '' } : { firstName: s.slice(0, i), lastName: s.slice(i + 1) };
}

async function listPeople() {
  const [records, users] = await Promise.all([getAllCadets(), getAllUsers()]);
  const usersByEmail = new Map(users.map((u) => [u.email, u]));
  const claimed = new Set();
  const people = records.map((rec) => {
    const acct = linkedAccount(rec, usersByEmail);
    if (acct) claimed.add(acct.email);
    return {
      memberId: rec.id,
      firstName: rec.firstName,
      lastName: rec.lastName,
      email: acct?.email || rec.email || '',
      hasLogin: Boolean(acct),
      role: acct?.role || memberType(rec),
      onRoster: memberType(rec),
      hasCapid: Boolean(rec.capid), // never the CAPID itself
      archived: Boolean(rec.archived),
    };
  });
  for (const u of users) {
    if (claimed.has(u.email)) continue;
    people.push({
      memberId: null,
      ...splitName(u.name),
      email: u.email,
      hasLogin: true,
      role: u.role,
      onRoster: null,
      hasCapid: false,
      archived: false,
      linkedCadetIds: u.linkedCadetIds || [],
    });
  }
  return people.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}

async function adminCount() {
  return (await getAllUsers()).filter((u) => u.role === 'admin').length;
}

async function loadPerson({ memberId, email }) {
  const rec = memberId ? await getCadet(String(memberId)) : null;
  let acct = null;
  if (email) acct = await getUserByEmail(normEmail(email));
  else if (rec?.email) {
    const u = await getUserByEmail(rec.email);
    if (u && (u.cadetId === rec.id || u.memberId === rec.id)) acct = u;
  }
  return { rec, acct };
}

async function savePerson(req, res, me) {
  const b = req.body || {};
  const role = b.role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Pick a role.' });
  const firstName = String(b.firstName || '').trim().slice(0, 80);
  const lastName = String(b.lastName || '').trim().slice(0, 80);
  if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
  const capid = String(b.capid || '').trim();
  if (capid && !/^\d{4,8}$/.test(capid)) return res.status(400).json({ error: 'CAPID should be a number.' });
  const email = normEmail(b.email);
  if (email && !email.includes('@')) return res.status(400).json({ error: 'That email doesn’t look right.' });

  if (b.memberId && !(await getCadet(String(b.memberId)))) return res.status(404).json({ error: 'Person not found.' });
  const { rec, acct } = await loadPerson({ memberId: b.memberId, email: b.origEmail });
  if (b.origEmail && !acct) return res.status(404).json({ error: 'Account not found.' });

  // Don't let the admin lock themself (or the squadron) out.
  if (acct && acct.role === 'admin' && role !== 'admin') {
    if (acct.email === me.email) return res.status(400).json({ error: 'You can’t remove your own admin rights.' });
    if ((await adminCount()) <= 1) return res.status(400).json({ error: 'There has to be at least one admin.' });
  }

  if (role !== 'cadet' && !email) return res.status(400).json({ error: 'An email is required — it’s how they sign in.' });
  if (role === 'parent' && rec) {
    return res.status(400).json({ error: 'Parents can’t be on the roster. Delete or archive their roster record instead.' });
  }
  if (role === 'cadet' && !rec && !capid) return res.status(400).json({ error: 'CAPID is required for a cadet.' });

  // Email must not belong to someone else.
  if (email && email !== acct?.email) {
    const other = await getUserByEmail(email);
    if (other) return res.status(400).json({ error: `${email} is already used by another account.` });
  }

  let linkedCadetIds;
  if (role === 'parent') {
    linkedCadetIds = Array.isArray(b.linkedCadetIds) ? [...new Set(b.linkedCadetIds.map(String))] : [];
    if (linkedCadetIds.length === 0) return res.status(400).json({ error: 'Pick at least one cadet for a parent.' });
    for (const cid of linkedCadetIds) {
      const c = await getCadet(cid);
      if (!c || memberType(c) !== 'cadet') return res.status(400).json({ error: 'One of the linked cadets wasn’t found.' });
    }
  }

  const redis = db();

  // Roster record: cadets always; seniors/admins when they have (or are given) a CAPID.
  let record = null;
  if (role !== 'parent' && (rec || capid)) {
    const id = rec?.id || newMemberId();
    if (capid && capid !== rec?.capid) {
      const owner = await getMemberIdByCapid(capid);
      if (owner && owner !== id) return res.status(400).json({ error: 'That CAPID is already on another person.' });
    }
    record = {
      ...(rec || {}),
      id,
      type: role === 'cadet' ? 'cadet' : 'senior',
      capid: capid || rec?.capid || '',
      firstName,
      lastName,
      email,
      parentEmails: rec?.parentEmails || [],
      createdAt: rec?.createdAt || new Date().toISOString(),
    };
    await redis.set(`cadets:${id}`, JSON.stringify(record));
    await redis.sadd('cadets:index', id);
    if (record.capid) await redis.set(`capid:${record.capid}`, id);
    if (rec?.capid && rec.capid !== record.capid) {
      const pointsHere = await redis.get(`capid:${rec.capid}`);
      if (String(pointsHere) === id) await redis.del(`capid:${rec.capid}`);
    }
  }

  // Login account. An email change moves the account (old sign-ins stop working).
  if (acct && acct.email !== email) {
    await redis.del(`users:${acct.email}`);
    await redis.srem('users:index', acct.email);
  }
  if (email) {
    const account = {
      ...(acct || {}),
      email,
      name: `${firstName} ${lastName}`,
      role,
      createdAt: acct?.createdAt || new Date().toISOString(),
    };
    delete account.cadetId;
    delete account.memberId;
    delete account.linkedCadetIds;
    if (role === 'cadet') account.cadetId = record.id;
    if ((role === 'senior' || role === 'admin') && record) account.memberId = record.id;
    if (role === 'parent') account.linkedCadetIds = linkedCadetIds;
    await saveUser(account);
  }

  return res.status(200).json({ ok: true, memberId: record?.id || null, email: email || null });
}

async function archivePerson(req, res) {
  const { memberId, archived } = req.body || {};
  const rec = memberId ? await getCadet(String(memberId)) : null;
  if (!rec) return res.status(404).json({ error: 'Only people on the roster can be archived.' });
  const next = {
    ...rec,
    archived: Boolean(archived),
    archivedAt: archived ? rec.archivedAt || new Date().toISOString() : null,
  };
  await db().set(`cadets:${rec.id}`, JSON.stringify(next));
  return res.status(200).json({ ok: true });
}

async function deletePerson(req, res, me) {
  const { memberId, email } = req.query || {};
  const { rec, acct } = await loadPerson({ memberId, email });
  if (!rec && !acct) return res.status(404).json({ error: 'Person not found.' });
  if (acct?.email === me.email) return res.status(400).json({ error: 'You can’t delete your own account.' });
  if (acct?.role === 'admin' && (await adminCount()) <= 1) {
    return res.status(400).json({ error: 'There has to be at least one admin.' });
  }

  const redis = db();
  let entriesDeleted = 0;
  if (rec) {
    const entries = await getEntriesForCadet(rec.id);
    const p = redis.pipeline();
    entries.forEach((e) => {
      p.del(`entries:${e.id}`);
      p.srem('entries:pending', e.id);
    });
    p.del(`cadet:${rec.id}:entries`);
    p.del(`cadets:${rec.id}`);
    p.srem('cadets:index', rec.id);
    await p.exec();
    entriesDeleted = entries.length;
    if (rec.capid) {
      const pointsHere = await redis.get(`capid:${rec.capid}`);
      if (String(pointsHere) === rec.id) await redis.del(`capid:${rec.capid}`);
    }
    // Unlink from any parent accounts.
    for (const u of await getAllUsers()) {
      if (Array.isArray(u.linkedCadetIds) && u.linkedCadetIds.includes(rec.id)) {
        await saveUser({ ...u, linkedCadetIds: u.linkedCadetIds.filter((id) => id !== rec.id) });
      }
    }
  }
  if (acct) {
    await redis.del(`users:${acct.email}`);
    await redis.srem('users:index', acct.email);
  }
  return res.status(200).json({ ok: true, entriesDeleted });
}
