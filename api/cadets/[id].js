import { randomToken, getSessionUser, canSeeCapid } from '../_lib/auth.js';
import {
  getCadet,
  getEntriesForCadet,
  summarizeHours,
  ribbonProgress,
  saveEntry,
} from '../_lib/model.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { id } = req.query;
  const cadet = await getCadet(id);
  if (!cadet) return res.status(404).json({ error: 'Cadet not found.' });

  if (req.method === 'GET') {
    const entries = await getEntriesForCadet(id);
    const summary = summarizeHours(entries);
    const progress = ribbonProgress(summary.totalVerified);
    const canLogForThisCadet =
      !cadet.archived &&
      (user.role === 'admin' ||
        user.role === 'senior' ||
        (user.role === 'cadet' && user.cadetId === cadet.id) ||
        (user.role === 'parent' && (user.linkedCadetIds || []).includes(cadet.id)));
    const canArchive = user.role === 'admin' || user.role === 'senior';
    const cadetOut = canSeeCapid(user, cadet) ? cadet : { ...cadet, capid: null };
    return res.status(200).json({ cadet: cadetOut, entries, summary, progress, canLogForThisCadet, canArchive });
  }

  if (req.method === 'POST') {
    // Add a new hour entry for this cadet.
    if (cadet.archived) {
      return res.status(403).json({ error: 'This cadet is archived. Restore them first to log new hours.' });
    }
    const canLog =
      user.role === 'admin' ||
      user.role === 'senior' ||
      (user.role === 'cadet' && user.cadetId === cadet.id) ||
      (user.role === 'parent' && (user.linkedCadetIds || []).includes(cadet.id));
    if (!canLog) return res.status(403).json({ error: 'You cannot log hours for this cadet.' });

    const { date, hours, activity, organization, location, notes } = req.body || {};
    const h = Number(hours);
    if (!date || !activity || !h || h <= 0 || h > 24) {
      return res.status(400).json({ error: 'Provide a date, activity, and hours between 0 and 24.' });
    }

    const entry = {
      id: randomToken(10),
      cadetId: cadet.id,
      date,
      hours: h,
      activity: String(activity).slice(0, 200),
      organization: String(organization || '').slice(0, 200),
      location: String(location || '').slice(0, 200),
      notes: String(notes || '').slice(0, 1000),
      status: 'pending',
      submittedBy: user.email,
      submittedByName: user.name,
      submittedAt: new Date().toISOString(),
      verifiedBy: null,
      verifiedByName: null,
      verifiedAt: null,
      verifierNote: null,
    };

    // Admin/senior can log and self-verify in one step if they were physically present.
    if ((user.role === 'admin' || user.role === 'senior') && req.body?.autoVerify) {
      entry.status = 'verified';
      entry.verifiedBy = user.email;
      entry.verifiedByName = user.name;
      entry.verifiedAt = new Date().toISOString();
      entry.verifierNote = 'Logged and verified by senior member present at the activity.';
    }

    await saveEntry(entry);
    return res.status(201).json({ entry });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
