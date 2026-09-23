import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [cadets, setCadets] = useState(null);
  const [error, setError] = useState('');

  const [userForm, setUserForm] = useState({ email: '', name: '', role: 'senior', linkedCadetIds: [] });
  const [userMsg, setUserMsg] = useState('');
  const [cadetForm, setCadetForm] = useState({ capid: '', firstName: '', lastName: '', email: '' });
  const [cadetMsg, setCadetMsg] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);

  function load() {
    Promise.all([api.adminUsers(), api.cadets()])
      .then(([u, c]) => {
        setUsers(u.users);
        setCadets(c.cadets);
      })
      .catch((err) => setError(err.message));
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
      await api.adminAddCadet(cadetForm);
      setCadetMsg('Cadet saved.');
      setCadetForm({ capid: '', firstName: '', lastName: '', email: '' });
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
                {cadets.map((c) => (
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
          Add / update a cadet
        </h2>
        <form onSubmit={addCadet} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="cap-label">CAPID</label>
            <input
              type="text"
              required
              className="cap-input"
              value={cadetForm.capid}
              onChange={(e) => setCadetForm({ ...cadetForm, capid: e.target.value })}
            />
          </div>
          <div>
            <label className="cap-label">Cadet email (for login)</label>
            <input
              type="email"
              className="cap-input"
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
            <button className="cap-btn-primary">Save cadet</button>
            {cadetMsg && <span className="text-sm text-slate-600">{cadetMsg}</span>}
          </div>
        </form>
        <p className="text-xs text-slate-400">
          The initial 19-cadet roster was loaded by the one-time /api/admin/seed call — see the README. Use this
          form for new cadets who join later, or to fix a typo.
        </p>
      </section>
    </div>
  );
}
