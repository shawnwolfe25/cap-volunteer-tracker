import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

const emptyForm = { date: '', hours: '', activity: '', organization: '', location: '', notes: '' };

// Log one activity for many cadets at once. Admin/senior only (route-guarded in
// App.jsx and enforced server-side). Everyone selected gets an identical entry.
export default function GroupEntry() {
  const navigate = useNavigate();
  const [cadets, setCadets] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(() => new Set());
  const [autoVerify, setAutoVerify] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api
      .cadets()
      .then((d) => setCadets(d.cadets.filter((c) => !c.archived)))
      .catch((err) => setError(err.message));
  }, []);

  const visible = useMemo(() => {
    if (!cadets) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return cadets;
    return cadets.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
  }, [cadets, filter]);

  if (error) return <ErrorBox message={error} />;
  if (!cadets) return <LoadingBox />;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.date || !form.activity || !form.hours) {
      setFormError('Date, activity, and hours are required.');
      return;
    }
    if (selected.size === 0) {
      setFormError('Pick at least one cadet.');
      return;
    }
    const names = cadets.filter((c) => selected.has(c.id)).map((c) => `${c.firstName} ${c.lastName}`);
    const ok = confirm(
      `Log ${form.hours} hrs of "${form.activity}" on ${form.date} for ${selected.size} cadet${
        selected.size === 1 ? '' : 's'
      }${autoVerify ? ' (verified on the spot)' : ' (pending verification)'}?\n\n${names.join(', ')}`
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const data = await api.addGroupEntry({
        ...form,
        hours: Number(form.hours),
        cadetIds: Array.from(selected),
        autoVerify,
      });
      setResult(data);
      setForm(emptyForm);
      setSelected(new Set());
      setAutoVerify(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Link to="/" className="text-sm text-cap-blue2 hover:underline">
        &larr; Back to roster
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-cap-blue">Log a group activity</h1>
        <p className="text-sm text-slate-500">
          One activity, many cadets. Everyone you check gets the same entry. If someone stayed a different
          number of hours, log the group first, then adjust theirs from their page.
        </p>
      </div>

      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <div className="font-semibold">
            Logged for {result.created} cadet{result.created === 1 ? '' : 's'}.
          </div>
          <div className="text-green-700 mt-0.5">{result.cadets.join(', ')}</div>
          {result.skipped?.length > 0 && (
            <div className="text-amber-700 mt-1">
              Skipped {result.skipped.length}:{' '}
              {result.skipped.map((s) => `${s.name || s.id} (${s.reason})`).join(', ')}
            </div>
          )}
          <div className="mt-2 flex gap-3">
            <button className="underline" onClick={() => navigate('/')}>
              Back to roster
            </button>
            <button className="underline" onClick={() => setResult(null)}>
              Log another
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <section className="cap-card p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">The activity</h2>
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
              <label className="cap-label">Hours (each cadet)</label>
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
            <label className="cap-label">What did they do?</label>
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={autoVerify} onChange={(e) => setAutoVerify(e.target.checked)} />
            I was present and can verify this on the spot
          </label>
        </section>

        <section className="cap-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Who was there{' '}
              <span className="normal-case tracking-normal text-slate-400 font-normal">
                ({selected.size} of {cadets.length} selected)
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <input
                type="text"
                className="cap-input !py-1 !w-40"
                placeholder="Filter names"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button type="button" className="underline text-slate-600" onClick={selectAllVisible}>
                Select {filter ? 'shown' : 'all'}
              </button>
              <button type="button" className="underline text-slate-600" onClick={clearAll}>
                Clear
              </button>
            </div>
          </div>
          {visible.length === 0 && <p className="text-sm text-slate-400">No cadets match.</p>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {visible.map((c) => {
              const on = selected.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer select-none ${
                    on ? 'bg-cap-blue/5 border-cap-blue' : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                  <span className="truncate">
                    {c.lastName}, {c.firstName}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {formError && <p className="text-sm text-cap-red">{formError}</p>}
        <div className="flex items-center gap-3">
          <button className="cap-btn-primary" disabled={submitting || selected.size === 0}>
            {submitting
              ? 'Saving…'
              : `Log for ${selected.size} cadet${selected.size === 1 ? '' : 's'}`}
          </button>
          <p className="text-xs text-slate-400">
            Reminder: only volunteer service outside of CAP-run activities counts toward the ribbon.
          </p>
        </div>
      </form>
    </div>
  );
}
