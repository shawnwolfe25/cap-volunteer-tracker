import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, memberPath } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import RibbonBadge from '../components/RibbonBadge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

const TABS = {
  cadets: { type: 'cadet', label: 'Cadets', heading: 'Cadet Roster', one: 'cadet', many: 'cadets' },
  seniors: {
    type: 'senior',
    label: 'Senior Members',
    heading: 'Senior Member Roster',
    one: 'senior member',
    many: 'senior members',
  },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showArchived, setShowArchived] = useState(false);
  // Tab lives in the URL (?tab=seniors) so Back from a member's page lands on the same tab.
  const [params, setParams] = useSearchParams();
  const tabKey = params.get('tab') === 'seniors' ? 'seniors' : 'cadets';
  const tab = TABS[tabKey];

  useEffect(() => {
    api
      .cadets()
      .then((data) => setMembers(data.cadets))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!members) return <LoadingBox />;

  function pickTab(key) {
    setShowArchived(false);
    setParams(key === 'cadets' ? {} : { tab: key }, { replace: true });
  }

  // Archived members (transferred, aged out) keep their history but drop off the
  // roster and out of squadron stats unless you ask to see them.
  const inTab = members.filter((m) => m.type === tab.type);
  const active = inTab.filter((c) => !c.archived);
  const archivedCount = inTab.length - active.length;
  const visible = showArchived ? inTab : active;
  const activeCount = (key) => members.filter((m) => m.type === TABS[key].type && !m.archived).length;

  const squadronTotal = active.reduce((sum, c) => sum + c.totalVerified, 0);
  const ribbonEarners = active.filter((c) => c.progress.earned).length;
  const ownId = user?.role === 'cadet' ? user?.cadetId : user?.memberId;

  const sorted = [...visible].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1; // archived sink to the bottom
    if (sortBy === 'hours') return b.totalVerified - a.totalVerified;
    return a.lastName.localeCompare(b.lastName);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {Object.entries(TABS).map(([key, t]) => (
          <button
            key={key}
            role="tab"
            aria-selected={key === tabKey}
            onClick={() => pickTab(key)}
            className={`px-4 py-2 -mb-px text-sm font-semibold border-b-2 transition-colors ${
              key === tabKey
                ? 'border-cap-blue text-cap-blue'
                : 'border-transparent text-slate-500 hover:text-cap-blue'
            }`}
          >
            {t.label} <span className="font-normal text-slate-400">({activeCount(key)})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label={`Active ${tab.many}`} value={active.length} />
        <StatTile label="Ribbons earned" value={ribbonEarners} />
        <StatTile label="Verified hours" value={squadronTotal.toFixed(1)} />
        <StatTile
          label={`Hours per ${tab.one} (avg)`}
          value={active.length ? (squadronTotal / active.length).toFixed(1) : '0'}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-cap-blue">{tab.heading}</h2>
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

      {sorted.length === 0 && (
        <p className="cap-card p-6 text-center text-sm text-slate-400">
          No {tab.many} on the roster yet.
          {user?.role === 'admin' && ' Add them from the Admin screen.'}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((c) => (
          <Link
            to={memberPath(c.id, c.type)}
            key={c.id}
            className={`cap-card p-4 flex items-center gap-4 hover:shadow-md hover:border-cap-skyblue transition ${
              c.archived ? 'opacity-60 bg-slate-50' : ''
            }`}
          >
            <RibbonBadge progress={c.progress} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate mb-1">
                {c.firstName} {c.lastName}
                {ownId && ownId === c.id && (
                  <span className="ml-2 cap-badge bg-cap-gold/20 text-cap-blue">You</span>
                )}
                {c.archived && <span className="ml-2 cap-badge bg-slate-200 text-slate-600">Archived</span>}
              </div>
              <ProgressBar
                percent={c.progress.percentToNext}
                label={`${c.totalVerified.toFixed(1)} hrs verified · ${c.progress.nextGoal - c.totalVerified > 0 ? (c.progress.nextGoal - c.totalVerified).toFixed(1) + ' to go' : 'goal met'}`}
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
