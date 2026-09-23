import { getSessionUser } from '../_lib/auth.js';
import { getPendingEntries, getCadet } from '../_lib/model.js';

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

  const withCadet = await Promise.all(
    visible.map(async (e) => {
      const cadet = await getCadet(e.cadetId);
      return { ...e, cadetName: cadet ? `${cadet.firstName} ${cadet.lastName}` : 'Unknown cadet' };
    })
  );

  withCadet.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  return res.status(200).json({ entries: withCadet });
}
