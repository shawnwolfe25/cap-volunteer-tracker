import { getSessionUser, canEditEntry, canVerifyFor } from '../_lib/auth.js';
import { getEntry, getCadet, saveEntry, deleteEntry } from '../_lib/model.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { id } = req.query;
  const entry = await getEntry(id);
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });
  const cadet = await getCadet(entry.cadetId);
  if (!cadet) return res.status(404).json({ error: 'Cadet not found.' });

  if (req.method === 'PATCH') {
    const action = req.body?.action;

    if (action === 'verify' || action === 'reject') {
      if (!canVerifyFor(user, cadet)) {
        return res.status(403).json({ error: 'You are not authorized to verify hours for this cadet.' });
      }
      entry.status = action === 'verify' ? 'verified' : 'rejected';
      entry.verifiedBy = user.email;
      entry.verifiedByName = user.name;
      entry.verifiedAt = new Date().toISOString();
      entry.verifierNote = String(req.body?.note || '').slice(0, 500) || entry.verifierNote;
      await saveEntry(entry);
      return res.status(200).json({ entry });
    }

    // Editing entry content
    if (!canEditEntry(user, cadet, entry)) {
      return res.status(403).json({ error: 'You cannot edit this entry.' });
    }
    const { date, hours, activity, organization, location, notes } = req.body || {};
    if (date) entry.date = date;
    if (hours !== undefined) {
      const h = Number(hours);
      if (!h || h <= 0 || h > 24) return res.status(400).json({ error: 'Hours must be between 0 and 24.' });
      entry.hours = h;
    }
    if (activity) entry.activity = String(activity).slice(0, 200);
    if (organization !== undefined) entry.organization = String(organization).slice(0, 200);
    if (location !== undefined) entry.location = String(location).slice(0, 200);
    if (notes !== undefined) entry.notes = String(notes).slice(0, 1000);
    // Editing a verified entry's substance re-opens it for verification.
    if (entry.status === 'verified' && (date || hours !== undefined || activity)) {
      entry.status = 'pending';
      entry.verifiedBy = null;
      entry.verifiedByName = null;
      entry.verifiedAt = null;
    }
    await saveEntry(entry);
    return res.status(200).json({ entry });
  }

  if (req.method === 'DELETE') {
    // Cadets cannot delete their own entries once submitted — integrity control.
    // Only a senior member, parent (of that cadet), or admin can remove a logged entry.
    const canDelete = canVerifyFor(user, cadet);
    if (!canDelete) return res.status(403).json({ error: 'You cannot delete this entry.' });
    await deleteEntry(entry);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
