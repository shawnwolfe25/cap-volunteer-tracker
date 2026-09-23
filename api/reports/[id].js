import { getSessionUser, canSeeCapid } from '../_lib/auth.js';
import { getCadet, getEntriesForCadet, summarizeHours, ribbonProgress } from '../_lib/model.js';

// Read-only data for the printable CAPF 2a-style report. Access mirrors the cadet detail view.
export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { id } = req.query;
  const cadet = await getCadet(id);
  if (!cadet) return res.status(404).json({ error: 'Cadet not found.' });

  const entries = await getEntriesForCadet(id);
  const verified = entries.filter((e) => e.status === 'verified');
  const summary = summarizeHours(entries);
  const progress = ribbonProgress(summary.totalVerified);
  const cadetOut = canSeeCapid(user, cadet) ? cadet : { ...cadet, capid: null };

  return res.status(200).json({ cadet: cadetOut, entries: verified, summary, progress });
}
