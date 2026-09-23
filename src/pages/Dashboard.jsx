import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import RibbonBadge from '../components/RibbonBadge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [cadets, setCadets] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    api
      .cadets()
      .then((data) => setCadets(data.cadets))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!cadets) return <LoadingBox />;

  // Archived cadets (transferred, aged out) keep their history but drop off the
  // roster and out of squadron stats unless you ask to see them.
  const active = cadets.filter((c) => !c.archived);
  const archivedCount = cadets.length - active.length;
  const visible = showArchived ? cadets : active;

  const squadronTotal = active.reduce((sum, c) => sum + c.totalVerified, 0);
  const ribbonEarners = active.filter((c) => c.progress.earned).length;

  const sorted = [...visible].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1; // archived sink to the bottom
    if (sortBy === 'hours') return b.totalVerified - a.totalVerified;
    return a.lastName.localeCompare(b.lastName);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Active cadets" value={active.length} />
        <StatTile label="Ribbons earned" value={ribbonEarners} />
        <StatTile label="Squadron verified hours" value={squadronTotal.toFixed(1)} />
        <StatTile
          label="Hours per cadet (avg)"
          value={active.length ? (squadronTotal / active.length).toFixed(1) : '0'}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-cap-blue">Cadet Roster</h2>
          {(user?.role === 'admin' || user?.role === 'senior') && (
            <Link to="/group" className="cap-btn-primary !px-3 !py-1.5 text-xs">
              + Log a group activity
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {archivedCount > 0 && (
            <label className="flex items-center gap-1.5 text-slate-500 mr-2">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          )}
          <span className="text-slate-500">Sort:</span>
          <button
            className={`px-2 py-1 rounded ${sortBy === 'name' ? 'bg-cap-blue text-white' : 'bg-white border'}`}
            onClick={() => setSortBy('name')}
          >
            Name
          </button>
          <button
            className={`px-2 py-1 rounded ${sortBy === 'hours' ? 'bg-cap-blue text-white' : 'bg-white border'}`}
            onClick={() => setSortBy('hours')}
          >
            Hours
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((c) => (
          <Link
            to={`/cadet/${c.id}`}
            key={c.id}
            className={`cap-card p-4 flex items-center gap-4 hover:shadow-md hover:border-cap-skyblue transition ${
              c.archived ? 'opacity-60 bg-slate-50' : ''
            }`}
          >
            <RibbonBadge progress={c.progress} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate">
                {c.firstName} {c.lastName}
                {user?.cadetId === c.id && (
                  <span className="ml-2 cap-badge bg-cap-gold/20 text-cap-blue">You</span>
                )}
                {c.archived && <span className="ml-2 cap-badge bg-slate-200 text-slate-600">Archived</span>}
              </div>
              {c.capid && <div className="text-xs text-slate-400 mb-1">CAPID {c.capid}</div>}
              <ProgressBar
                percent={c.progress.percentToNext}
                label={`${c.totalVerified.toFixed(1)} hrs verified &middot; ${c.progress.nextGoal - c.totalVerified > 0 ? (c.progress.nextGoal - c.totalVerified).toFixed(1) + ' to go' : 'goal met'}`.replace('&middot;', '·')}
              />
              {c.totalPending > 0 && (
                <div className="text-[11px] text-amber-600 mt-1">
                  +{c.totalPending.toFixed(1)} hrs awaiting verification
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="cap-card p-4 text-center">
      <div className="text-2xl font-display font-semibold text-cap-blue">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function LoadingBox() {
  return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-slate-400">Loading…</div>;
}

export function ErrorBox({ message }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 text-center text-cap-red">{message}</div>
  );
}
