import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [cadets, setCadets] = useState(null);
  const [error, setError] = useState('');

  const [userForm, setUserForm] = useState({ email: '', name: '', role: 'senior', linkedCadetIds: [] });
  const [userMsg, setUserMsg] = useState('');
  const emptyMember = { id: '', type: 'cadet', capid: '', firstName: '', lastName: '', email: '' };
  const [cadetForm, setCadetForm] = useState(emptyMember);
  const [cadetMsg, setCadetMsg] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [migratePending, setMigratePending] = useState(0);
  const [migrateMsg, setMigrateMsg] = useState('');
  const [migrateBusy, setMigrateBusy] = useState(false);

  function load() {
    Promise.all([api.adminUsers(), api.cadets(), api.adminMigrateStatus()])
      .then(([u, c, m]) => {
        setUsers(u.users);
        setCadets(c.cadets);
        setMigratePending(m.pending);
      })
      .catch((err) => setError(err.message));
  }

  async function migrate() {
    if (!confirm('Move every roster record to a private ID now? Old bookmarked links to cadet pages will stop working.')) return;
    setMigrateBusy(true);
    setMigrateMsg('');
    try {
      const data = await api.adminMigrate();
      setMigrateMsg(`Done — ${data.migrated} record${data.migrated === 1 ? '' : 's'} moved.`);
      load();
    } catch (err) {
      setMigrateMsg(err.message);
    } finally {
      setMigrateBusy(false);
    }
  }

  // Picking someone from the roster fills the form for editing. Their CAPID is never
  // sent to the browser, so that box stays blank — leave it blank to keep it.
  function pickMember(id) {
    const m = cadets.find((c) => c.id === id);
    if (!m) return setCadetForm({ ...emptyMember, type: cadetForm.type });
    setCadetForm({ id: m.id, type: m.type, capid: '', firstName: m.firstName, lastName: m.lastName, email: '' });
  }

  useEffect(load, []);

  async function addUser(e) {
    e.preventDefault();
    setUserMsg('');
    try {
      await api.adminAddUser(userForm);
      setUserMsg('Saved. They can sign in with that email now.');
      setUserForm({ email: '', name: '', role: 'senior', linkedCadetIds: [] });
      load();
    } catch (err) {
      setUserMsg(err.message);
    }
  }

  async function addCadet(e) {
    e.preventDefault();
    setCadetMsg('');
    try {
      const { id, ...rest } = cadetForm;
      await api.adminAddCadet(id ? cadetForm : rest);
      setCadetMsg(`${cadetForm.type === 'senior' ? 'Senior member' : 'Cadet'} saved.`);
      setCadetForm({ ...emptyMember, type: cadetForm.type });
      load();
    } catch (err) {
      setCadetMsg(err.message);
    }
  }

  async function lookupCode(e) {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);
    setLookupBusy(true);
    try {
      const data = await api.adminLoginCode(lookupEmail.trim());
      setLookupResult(data);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!users || !cadets) return <LoadingBox />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-lg font-semibold text-cap-blue">Squadron Admin</h1>

      <section className="cap-card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a senior member or parent account
        </h2>
        <form onSubmit={addUser} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="cap-label">Email</label>
            <input
              type="email"
              required
              className="cap-input"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="cap-label">Full name</label>
            <input
              type="text"
              required
              className="cap-input"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="cap-label">Role</label>
            <select
              className="cap-input"
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              <option value="senior">Senior member (can verify any cadet)</option>
              <option value="parent">Parent / guardian (verifies own cadet only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
          {userForm.role === 'parent' && (
            <div>
              <label className="cap-label">Their cadet(s)</label>
              <select
                multiple
                className="cap-input h-24"
                value={userForm.linkedCadetIds}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    linkedCadetIds: Array.from(e.target.selectedOptions, (o) => o.value),
                  })
                }
              >
                {cadets.filter((c) => c.type === 'cadet').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Ctrl/Cmd-click to select more than one.</p>
            </div>
          )}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="cap-btn-primary">Save account</button>
            {userMsg && <span className="text-sm text-slate-600">{userMsg}</span>}
          </div>
        </form>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Existing accounts</h3>
          <div className="text-sm divide-y">
            {users.map((u) => (
              <div key={u.email} className="py-1.5 flex justify-between">
                <span>
                  {u.name} <span className="text-slate-400">&lt;{u.email}&gt;</span>
                </span>
                <span className="cap-badge bg-slate-100 text-slate-600 capitalize">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cap-card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Look up a pending login code
        </h2>
        <p className="text-xs text-slate-400">
          If someone's login email never arrives (some .gov/.cap.gov inboxes block it), have them tap
          &ldquo;Email me a login code&rdquo; on the sign-in screen first, then look their code up here and
          call or text it to them. It still expires in 15 minutes like a normal code.
        </p>
        <form onSubmit={lookupCode} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="cap-label">Their email</label>
            <input
              type="email"
              required
              className="cap-input"
              placeholder="name@ilwg.cap.gov"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
            />
          </div>
          <button className="cap-btn-primary" disabled={lookupBusy}>
            {lookupBusy ? 'Looking up…' : 'Look up code'}
          </button>
        </form>
        {lookupError && <p className="text-sm text-cap-red">{lookupError}</p>}
        {lookupResult && (
          <div className="rounded-lg bg-slate-50 border p-3 text-sm">
            <div className="text-slate-600">
              {lookupResult.name} <span className="text-slate-400">({lookupResult.role})</span>
            </div>
            <div className="mt-1 font-display text-2xl tracking-[0.3em] text-cap-blue">{lookupResult.code}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Requested {new Date(lookupResult.requestedAt).toLocaleTimeString()} · expires 15 min after that
            </div>
          </div>
        )}
      </section>

      <section className="cap-card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add / update a cadet or senior member
        </h2>
        <form onSubmit={addCadet} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="cap-label">Roster</label>
            <select
              className="cap-input"
              value={cadetForm.type}
              disabled={Boolean(cadetForm.id)}
              onChange={(e) => setCadetForm({ ...emptyMember, type: e.target.value })}
            >
              <option value="cadet">Cadet</option>
              <option value="senior">Senior member</option>
            </select>
          </div>
          <div>
            <label className="cap-label">Who</label>
            <select className="cap-input" value={cadetForm.id} onChange={(e) => pickMember(e.target.value)}>
              <option value="">+ New {cadetForm.type === 'senior' ? 'senior member' : 'cadet'}</option>
              {cadets
                .filter((c) => c.type === cadetForm.type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.lastName}, {c.firstName}
                    {c.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="cap-label">CAPID</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              required={!cadetForm.id}
              className="cap-input"
              placeholder={cadetForm.id ? 'On file — leave blank to keep' : ''}
              value={cadetForm.capid}
              onChange={(e) => setCadetForm({ ...cadetForm, capid: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <div>
            <label className="cap-label">Email (for login)</label>
            <input
              type="email"
              className="cap-input"
              placeholder={cadetForm.id ? 'Leave blank to keep current' : ''}
              value={cadetForm.email}
              onChange={(e) => setCadetForm({ ...cadetForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="cap-label">First name</label>
            <input
              type="text"
              required
              className="cap-input"
              value={cadetForm.firstName}
              onChange={(e) => setCadetForm({ ...cadetForm, firstName: e.target.value })}
            />
          </div>
          <div>
            <label className="cap-label">Last name</label>
            <input
              type="text"
              required
              className="cap-input"
              value={cadetForm.lastName}
              onChange={(e) => setCadetForm({ ...cadetForm, lastName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="cap-btn-primary">Save</button>
            {cadetForm.id && (
              <button type="button" className="text-sm underline text-slate-500" onClick={() => pickMember('')}>
                Cancel edit
              </button>
            )}
            {cadetMsg && <span className="text-sm text-slate-600">{cadetMsg}</span>}
          </div>
        </form>
        <p className="text-xs text-slate-400">
          CAPIDs are only used to sign in. They&rsquo;re never shown anywhere in the app &mdash; not here, not on
          the roster, not on reports. A senior member&rsquo;s email becomes their login (role: senior member); if
          the email already has a senior or admin account, that account is linked to the roster record instead.
          Admin accounts always sign in by email, never CAPID.
        </p>
      </section>

      {migratePending > 0 && (
        <section className="cap-card p-4 space-y-3 border-amber-300">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            One-time: hide CAPIDs from page links
          </h2>
          <p className="text-sm text-slate-600">
            {migratePending} roster record{migratePending === 1 ? ' still uses' : 's still use'} the CAPID as its
            page ID, so it shows up in the address bar. This moves them to private IDs. Hours, reports, parent
            links, and logins all carry over. Safe to run more than once.
          </p>
          <div className="flex items-center gap-3">
            <button className="cap-btn-primary" onClick={migrate} disabled={migrateBusy}>
              {migrateBusy ? 'Moving…' : 'Move to private IDs'}
            </button>
            {migrateMsg && <span className="text-sm text-slate-600">{migrateMsg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
