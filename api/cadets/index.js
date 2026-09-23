import { getSessionUser, canSeeCapid, randomToken } from '../_lib/auth.js';
import { getAllCadets, getEntriesForCadets, summarizeHours, ribbonProgress, saveEntries, entryDateError } from '../_lib/model.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  if (req.method === 'GET') {
    const cadets = await getAllCadets();
    const entriesById = await getEntriesForCadets(cadets.map((c) => c.id));
    const withStats = cadets.map((c) => {
      const summary = summarizeHours(entriesById[c.id] || []);
      const progress = ribbonProgress(summary.totalVerified);
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        capid: canSeeCapid(user, c) ? c.capid : null,
        archived: Boolean(c.archived),
        archivedAt: c.archivedAt || null,
        totalVerified: summary.totalVerified,
        totalPending: summary.totalPending,
        byYear: summary.byYear,
        progress,
      };
    });
    return res.status(200).json({ cadets: withStats });
  }

  // Group activity: one entry, many cadets. For events where a bunch of cadets did
  // the same thing (food pantry, Honor Flight, parade). Admin/senior only. Every
  // cadet gets an identical entry; fix stragglers individually afterward.
  if (req.method === 'POST') {
    if (!['admin', 'senior'].includes(user.role)) {
      return res.status(403).json({ error: 'Only senior members and admins can log group activities.' });
    }

    const { cadetIds, date, hours, activity, organization, location, notes, autoVerify } = req.body || {};
    const ids = Array.isArray(cadetIds) ? [...new Set(cadetIds.map(String))] : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Pick at least one cadet.' });
    if (ids.length > 200) return res.status(400).json({ error: 'Too many cadets in one batch.' });

    const h = Number(hours);
    if (!date || !activity || !h || h <= 0 || h > 24) {
      return res.status(400).json({ error: 'Provide a date, activity, and hours between 0 and 24.' });
    }
    const dateError = entryDateError(date);
    if (dateError) return res.status(400).json({ error: dateError });

    const all = await getAllCadets();
    const byId = new Map(all.map((c) => [c.id, c]));
    const skipped = [];
    const targets = [];
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) skipped.push({ id, reason: 'not found' });
      else if (c.archived) skipped.push({ id, name: `${c.firstName} ${c.lastName}`, reason: 'archived' });
      else targets.push(c);
    }
    if (targets.length === 0) return res.status(400).json({ error: 'None of the selected cadets can be logged.', skipped });

    const now = new Date().toISOString();
    const batchId = randomToken(6); // ties the group together for anyone auditing later
    const verified = Boolean(autoVerify);
    const entries = targets.map((c) => ({
      id: randomToken(10),
      cadetId: c.id,
      date,
      hours: h,
      activity: String(activity).slice(0, 200),
      organization: String(organization || '').slice(0, 200),
      location: String(location || '').slice(0, 200),
      notes: String(notes || '').slice(0, 1000),
      status: verified ? 'verified' : 'pending',
      submittedBy: user.email,
      submittedByName: user.name,
      submittedAt: now,
      groupBatchId: batchId,
      verifiedBy: verified ? user.email : null,
      verifiedByName: verified ? user.name : null,
      verifiedAt: verified ? now : null,
      verifierNote: verified ? 'Logged and verified by senior member present at the activity.' : null,
    }));

    await saveEntries(entries);
    return res.status(201).json({
      created: entries.length,
      cadets: targets.map((c) => `${c.firstName} ${c.lastName}`),
      skipped,
      batchId,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
