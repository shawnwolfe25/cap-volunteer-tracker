import { getSessionUser } from '../_lib/auth.js';
import { getPendingEntries, getCadetsByIds } from '../_lib/model.js';

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

  // One pipelined lookup for all the cadets involved, not one Upstash call per entry.
  const cadets = await getCadetsByIds(visible.map((e) => e.cadetId));
  const withCadet = visible.map((e) => {
    const cadet = cadets.get(e.cadetId);
    return { ...e, cadetName: cadet ? `${cadet.firstName} ${cadet.lastName}` : 'Unknown cadet' };
  });

  withCadet.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  return res.status(200).json({ entries: withCadet });
}
