import { getSessionUser } from '../../_lib/auth.js';
import { db } from '../../_lib/redis.js';
import { getAllCadets, getAllUsers, getEntriesForCadet, isLegacyMember, newMemberId } from '../../_lib/model.js';

// One-time move from CAPID-as-id to private random ids, so CAPIDs stop showing up in
// page URLs and API responses. Admin only.
//   GET  /api/admin/migrate  -> { pending: <records still keyed by CAPID> }
//   POST /api/admin/migrate  -> moves them, returns { migrated }
//
// Per record: write the copy under the new id, point capid:{capid} at it, move the entry
// list and rewrite each entry's cadetId, repoint logins (cadetId / parent links /
// memberId), then drop the old key. Safe to re-run: capid:{capid} is written first, so a
// run that died halfway reuses the same new id instead of minting a second one.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });

  const redis = db();
  const legacy = (await getAllCadets()).filter(isLegacyMember);

  if (req.method === 'GET') return res.status(200).json({ pending: legacy.length });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const idMap = new Map(); // old id (CAPID) -> new id
  for (const old of legacy) {
    const mapped = await redis.get(`capid:${old.capid}`);
    const newId = mapped && String(mapped) !== old.id ? String(mapped) : newMemberId();
    idMap.set(old.id, newId);

    await redis.set(`capid:${old.capid}`, newId);
    await redis.set(`cadets:${newId}`, JSON.stringify({ ...old, id: newId }));
    await redis.sadd('cadets:index', newId);

    // Entries: rewrite cadetId, then move the sorted set (scores are entry dates).
    const entries = await getEntriesForCadet(old.id);
    if (entries.length > 0) {
      const p = redis.pipeline();
      entries.forEach((e) => p.set(`entries:${e.id}`, JSON.stringify({ ...e, cadetId: newId })));
      await p.exec();
    }
    if (await redis.exists(`cadet:${old.id}:entries`)) {
      if (await redis.exists(`cadet:${newId}:entries`)) {
        // Half-finished earlier run: merge rather than overwrite.
        const withScores = await redis.zrange(`cadet:${old.id}:entries`, 0, -1, { withScores: true });
        for (let i = 0; i < withScores.length; i += 2) {
          await redis.zadd(`cadet:${newId}:entries`, { score: Number(withScores[i + 1]), member: withScores[i] });
        }
        await redis.del(`cadet:${old.id}:entries`);
      } else {
        await redis.rename(`cadet:${old.id}:entries`, `cadet:${newId}:entries`);
      }
    }
  }

  // Logins that point at old ids.
  if (idMap.size > 0) {
    for (const u of await getAllUsers()) {
      const next = { ...u };
      let changed = false;
      if (u.cadetId && idMap.has(u.cadetId)) {
        next.cadetId = idMap.get(u.cadetId);
        changed = true;
      }
      if (u.memberId && idMap.has(u.memberId)) {
        next.memberId = idMap.get(u.memberId);
        changed = true;
      }
      if (Array.isArray(u.linkedCadetIds) && u.linkedCadetIds.some((id) => idMap.has(id))) {
        next.linkedCadetIds = u.linkedCadetIds.map((id) => idMap.get(id) || id);
        changed = true;
      }
      if (changed) await redis.set(`users:${u.email}`, JSON.stringify(next));
    }
  }

  // Old records last, once nothing points at them.
  for (const [oldId] of idMap) {
    await redis.srem('cadets:index', oldId);
    await redis.del(`cadets:${oldId}`);
  }

  return res.status(200).json({ migrated: idMap.size });
}
