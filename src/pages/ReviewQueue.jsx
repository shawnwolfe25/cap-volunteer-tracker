import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

export default function ReviewQueue() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api
      .pendingEntries()
      .then((d) => setEntries(d.entries))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function act(entryId, action) {
    let note = '';
    if (action === 'reject') {
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

  if (error) return <ErrorBox message={error} />;
  if (!entries) return <LoadingBox />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-lg font-semibold text-cap-blue">Hours Awaiting Verification</h1>
      {entries.length === 0 && (
        <p className="text-sm text-slate-400 cap-card p-6 text-center">All caught up — nothing pending.</p>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="cap-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <Link to={`/cadet/${entry.cadetId}`} className="font-semibold text-cap-blue hover:underline">
              {entry.cadetName}
            </Link>
            <div className="text-sm text-slate-700 mt-0.5">{entry.activity}</div>
            <div className="text-xs text-slate-500">
              {entry.date} &middot; {entry.hours} hrs
              {entry.organization ? ` · ${entry.organization}` : ''}
            </div>
            {entry.notes && <div className="text-xs text-slate-500 mt-1">{entry.notes}</div>}
            <div className="text-[11px] text-slate-400 mt-1">
              Logged by {entry.submittedByName || entry.submittedBy}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="cap-btn-primary !px-3 !py-1.5 text-xs" onClick={() => act(entry.id, 'verify')}>
              Verify
            </button>
            <button className="cap-btn-outline !px-3 !py-1.5 text-xs" onClick={() => act(entry.id, 'reject')}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
