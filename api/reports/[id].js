import { getSessionUser } from '../_lib/auth.js';
import { getCadet, getEntriesForCadet, summarizeHours, ribbonProgress, publicMember } from '../_lib/model.js';

// Read-only data for the printable CAPF 2a-style report. Access mirrors the member detail view.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { id } = req.query;
  const member = await getCadet(id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const entries = await getEntriesForCadet(id);
  const verified = entries.filter((e) => e.status === 'verified');
  const summary = summarizeHours(entries);
  const progress = ribbonProgress(summary.totalVerified);

  return res.status(200).json({ cadet: publicMember(member), entries: verified, summary, progress });
}
