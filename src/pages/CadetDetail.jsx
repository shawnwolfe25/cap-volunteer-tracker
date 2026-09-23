import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import RibbonBadge from '../components/RibbonBadge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

const emptyForm = { date: '', hours: '', activity: '', organization: '', location: '', notes: '' };

export default function CadetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [autoVerify, setAutoVerify] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const canVerify = user && (user.role === 'admin' || user.role === 'senior' ||
    (user.role === 'parent' && (user.linkedCadetIds || []).includes(id)));

  const load = useCallback(() => {
    api
      .cadet(id)
      .then((d) => setData(d))
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <LoadingBox />;

  const { cadet, entries, summary, progress, canLogForThisCadet, canArchive } = data;
  const isSeniorLike = user.role === 'admin' || user.role === 'senior';

  async function toggleArchive() {
    const archiving = !cadet.archived;
    const msg = archiving
      ? `Archive ${cadet.firstName} ${cadet.lastName}?\n\nTheir hours and report are kept. They drop off the roster and can't sign in or log new hours until restored.`
      : `Restore ${cadet.firstName} ${cadet.lastName} to the active roster?`;
    if (!confirm(msg)) return;
    try {
      await api.adminArchiveCadet(cadet.id, archiving);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function submitEntry(e) {
    e.preventDefault();
    setFormError('');
    if (!form.date || !form.activity || !form.hours) {
      setFormError('Date, activity, and hours are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.addEntry(id, { ...form, hours: Number(form.hours), autoVerify: isSeniorLike && autoVerify });
      setForm(emptyForm);
      setAutoVerify(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function act(entryId, action) {
    let note = '';
    if (action === 'reject') {
      // A cadet can't edit or delete a rejected entry, so tell them why so they can
      // re-log it correctly. Cancel = abort, blank = reject with no reason.
      const answer = prompt('Reason for rejecting (the cadet will see this):');
      if (answer === null) return;
      note = answer.trim();
    }
    try {
      await api.updateEntry(entryId, { action, note });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(entryId) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await api.deleteEntry(entryId);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  const years = Object.keys(summary.byYear).sort().reverse();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Link to="/" className="text-sm text-cap-blue2 hover:underline no-print">
        &larr; Back to roster
      </Link>

      {cadet.archived && (
        <div className="rounded-lg bg-slate-100 border border-slate-300 px-4 py-3 text-sm text-slate-700 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <span className="font-semibold">Archived</span>
            {cadet.archivedAt ? ` on ${new Date(cadet.archivedAt).toLocaleDateString()}` : ''}. Hours and report are
            kept for the record. No sign-in or new entries until restored.
          </div>
          {canArchive && (
            <button className="cap-btn-outline !px-3 !py-1.5 text-xs no-print" onClick={toggleArchive}>
              Restore to roster
            </button>
          )}
        </div>
      )}

      <div className="cap-card p-5 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <RibbonBadge progress={progress} size="lg" />
        <div className="flex-1 w-full">
          <h1 className="text-2xl font-display font-semibold text-cap-blue">
            {cadet.firstName} {cadet.lastName}
          </h1>
          {cadet.capid && <div className="text-sm text-slate-500 mb-3">CAPID {cadet.capid}</div>}
          <ProgressBar
            percent={progress.percentToNext}
            label={
              progress.earned
                ? `Ribbon earned · ${progress.clasps} bronze clasp${progress.clasps === 1 ? '' : 's'} · working toward ${progress.nextGoal} hrs`
                : `${summary.totalVerified.toFixed(1)} / 60 hrs toward the Community Service Ribbon`
            }
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-cap-blue">{summary.totalVerified.toFixed(1)}</span> hrs verified
              (all-time)
            </div>
            {summary.totalPending > 0 && (
              <div className="text-amber-600">
                <span className="font-semibold">{summary.totalPending.toFixed(1)}</span> hrs pending verification
              </div>
            )}
            <Link to={`/report/${id}`} className="text-cap-blue2 underline no-print">
              Printable report &rarr;
            </Link>
          </div>
        </div>
      </div>

      {years.length > 0 && (
        <div className="cap-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Verified hours by year
          </h2>
          <div className="flex flex-wrap gap-3">
            {years.map((y) => (
              <div key={y} className="rounded-lg bg-slate-50 border px-3 py-2 text-center min-w-[80px]">
                <div className="text-lg font-semibold text-cap-blue">{summary.byYear[y].toFixed(1)}</div>
                <div className="text-[11px] text-slate-500">{y}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canLogForThisCadet && (
        <form onSubmit={submitEntry} className="cap-card p-4 space-y-3 no-print">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Log a volunteer hour</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="cap-label">Date</label>
              <input
                type="date"
                min="2000-01-01"
                max={new Date().toLocaleDateString('en-CA')}
                className="cap-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="cap-label">Hours</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                className="cap-input"
                placeholder="e.g. 3"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="cap-label">What did you do?</label>
            <input
              type="text"
              className="cap-input"
              placeholder="e.g. Food pantry sorting, Honor Flight greeting, park cleanup…"
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="cap-label">Organization</label>
              <input
                type="text"
                className="cap-input"
                placeholder="Who was it for?"
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
            </div>
            <div>
              <label className="cap-label">Location</label>
              <input
                type="text"
                className="cap-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="cap-label">Notes (optional)</label>
            <textarea
              className="cap-input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {isSeniorLike && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={autoVerify} onChange={(e) => setAutoVerify(e.target.checked)} />
              I was present and can verify this on the spot
            </label>
          )}
          {formError && <p className="text-sm text-cap-red">{formError}</p>}
          <button className="cap-btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Add entry'}
          </button>
          <p className="text-xs text-slate-400">
            Reminder: only volunteer service outside of CAP-run activities counts toward the Community Service
            Ribbon (60 verified hours).
          </p>
        </form>
      )}

      <div className="cap-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Hour log</h2>
        {entries.length === 0 && <p className="text-sm text-slate-400">No hours logged yet.</p>}
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} canVerify={canVerify} onAct={act} onDelete={remove} />
          ))}
        </div>
      </div>

      {canArchive && !cadet.archived && (
        <div className="no-print text-right">
          <button className="text-xs text-slate-400 hover:text-slate-700 underline" onClick={toggleArchive}>
            Archive this cadet (transferred / aged out)
          </button>
        </div>
      )}
    </div>
  );
}

function statusBadge(status) {
  if (status === 'verified') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function EntryRow({ entry, canVerify, onAct, onDelete }) {
  return (
    <div className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800">{entry.activity}</span>
          <span className={`cap-badge ${statusBadge(entry.status)} capitalize`}>{entry.status}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {entry.date} &middot; {entry.hours} hrs
          {entry.organization ? ` · ${entry.organization}` : ''}
          {entry.location ? ` · ${entry.location}` : ''}
        </div>
        {entry.notes && <div className="text-xs text-slate-500 mt-1">{entry.notes}</div>}
        <div className="text-[11px] text-slate-400 mt-1">
          Logged by {entry.submittedByName || entry.submittedBy}
          {entry.verifiedByName && (
            <>
              {' '}
              &middot; {entry.status === 'rejected' ? 'Rejected' : 'Verified'} by {entry.verifiedByName}
            </>
          )}
        </div>
        {entry.status === 'rejected' && entry.verifierNote && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 mt-1.5">
            Reason: {entry.verifierNote}
          </div>
        )}
      </div>
      {canVerify && entry.status === 'pending' && (
        <div className="flex gap-2 no-print">
          <button className="cap-btn-primary !px-3 !py-1.5 text-xs" onClick={() => onAct(entry.id, 'verify')}>
            Verify
          </button>
          <button className="cap-btn-outline !px-3 !py-1.5 text-xs" onClick={() => onAct(entry.id, 'reject')}>
            Reject
          </button>
        </div>
      )}
      {canVerify && (
        <button
          className="text-xs text-slate-400 hover:text-cap-red no-print"
          onClick={() => onDelete(entry.id)}
          title="Delete entry"
        >
          Delete
        </button>
      )}
    </div>
  );
}
