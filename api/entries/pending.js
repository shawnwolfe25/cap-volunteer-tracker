import { getSessionUser, canVerifyFor } from '../_lib/auth.js';
import { getPendingEntries, getCadetsByIds, memberType } from '../_lib/model.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (!['admin', 'senior', 'parent'].includes(user.role)) {
    return res.status(200).json({ entries: [] });
  }

  const all = await getPendingEntries();
  let visible = all;
  if (user.role === 'parent') {
    const linked = new Set(user.linkedCadetIds || []);
    visible = all.filter((e) => linked.has(e.cadetId));
  }

  // One pipelined lookup for all the members involved, not one Upstash call per entry.
  const members = await getCadetsByIds(visible.map((e) => e.cadetId));
  // Leave out anything this user can't act on — mainly a senior's own pending hours,
  // which someone else has to verify.
  const withCadet = visible
    .filter((e) => !members.get(e.cadetId) || canVerifyFor(user, members.get(e.cadetId)))
    .map((e) => {
      const m = members.get(e.cadetId);
      return {
        ...e,
        cadetName: m ? `${m.firstName} ${m.lastName}` : 'Unknown member',
        memberType: memberType(m),
      };
    });

  withCadet.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  return res.status(200).json({ entries: withCadet });
}
