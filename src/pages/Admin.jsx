import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

const ROLE_LABEL = { cadet: 'Cadet', senior: 'Senior member', admin: 'Admin', parent: 'Parent' };
const ROLE_BADGE = {
  cadet: 'bg-sky-100 text-sky-800',
  senior: 'bg-indigo-100 text-indigo-800',
  admin: 'bg-cap-gold/25 text-cap-blue',
  parent: 'bg-emerald-100 text-emerald-800',
};
const blankPerson = {
  memberId: null,
  origEmail: '',
  role: 'cadet',
  firstName: '',
  lastName: '',
  email: '',
  capid: '',
  linkedCadetIds: [],
  hasCapid: false,
  archived: false,
  isNew: true,
};

export default function Admin() {
  const { user } = useAuth();
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // person being edited, or null
  const [formMsg, setFormMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [migratePending, setMigratePending] = useState(0);
  const [migrateMsg, setMigrateMsg] = useState('');
  const [migrateBusy, setMigrateBusy] = useState(false);

  function load() {
    Promise.all([api.adminPeople(), api.adminMigrateStatus()])
      .then(([p, m]) => {
        setPeople(p.people);
        setMigratePending(m.pending);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const cadetRecords = useMemo(
    () => (people || []).filter((p) => p.memberId && p.onRoster === 'cadet'),
    [people]
  );

  const visible = useMemo(() => {
    if (!people) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.email} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(q)
    );
  }, [people, filter]);

  if (error) return <ErrorBox message={error} />;
  if (!people) return <LoadingBox />;

  function open(p) {
    setFormMsg('');
    setNotice('');
    setEditing({
      ...blankPerson,
      ...p,
      origEmail: p.hasLogin ? p.email : '',
      capid: '',
      linkedCadetIds: p.linkedCadetIds || [],
      isNew: false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function set(field, value) {
    setEditing((e) => ({ ...e, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setFormMsg('');
    setBusy(true);
    try {
      await api.adminSavePerson({
        memberId: editing.memberId,
        origEmail: editing.origEmail || undefined,
        role: editing.role,
        firstName: editing.firstName,
        lastName: editing.lastName,
        email: editing.email,
        capid: editing.capid,
        linkedCadetIds: editing.linkedCadetIds,
      });
      setNotice(`Saved ${editing.firstName} ${editing.lastName}.`);
      setEditing(null);
      load();
    } catch (err) {
      setFormMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    const archiving = !editing.archived;
    const name = `${editing.firstName} ${editing.lastName}`;
    const msg = archiving
      ? `Archive ${name}?\n\nTheir hours and report are kept. They drop off the roster and can't sign in or log new hours until restored.`
      : `Restore ${name} to the active roster?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api.adminArchiveCadet(editing.memberId, archiving);
      setNotice(`${name} ${archiving ? 'archived' : 'restored'}.`);
      setEditing(null);
      load();
    } catch (err) {
      setFormMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const name = `${editing.firstName} ${editing.lastName}`;
    const parts = [];
    if (editing.origEmail) parts.push('their login');
    if (editing.memberId) parts.push('their roster record and ALL of their logged hours');
    const typed = prompt(
      `Permanently delete ${name}?\n\nThis removes ${parts.join(' and ')}. It cannot be undone. ` +
        `If they just left the squadron, Archive keeps their history instead.\n\nType DELETE to confirm.`
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'DELETE') {
      setFormMsg('Not deleted — you have to type DELETE to confirm.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.adminDeletePerson({ memberId: editing.memberId, email: editing.origEmail });
      setNotice(
        `Deleted ${name}${data.entriesDeleted ? ` and ${data.entriesDeleted} hour entr${data.entriesDeleted === 1 ? 'y' : 'ies'}` : ''}.`
      );
      setEditing(null);
      load();
    } catch (err) {
      setFormMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function lookupCode(e) {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);
    setLookupBusy(true);
    try {
      setLookupResult(await api.adminLoginCode(lookupEmail.trim()));
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupBusy(false);
    }
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

  const isSelf = editing && editing.origEmail && editing.origEmail === user.email;
  const role = editing?.role;
  const capidRequired = role === 'cadet' && !editing?.memberId;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-lg font-semibold text-cap-blue">Squadron Admin</h1>

      {editing && (
        <form onSubmit={save} className="cap-card p-4 space-y-4 border-cap-blue">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {editing.isNew ? 'Add a person' : `Edit ${editing.firstName} ${editing.lastName}`}
            </h2>
            <button type="button" className="text-sm underline text-slate-500" onClick={() => setEditing(null)}>
              Close
            </button>
          </div>

          {editing.archived && (
            <p className="text-sm rounded-lg bg-slate-100 border px-3 py-2 text-slate-600">
              Archived — off the roster, can&rsquo;t sign in or log hours until restored.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="cap-label">Role</label>
              <select
                className="cap-input"
                value={role}
                disabled={isSelf}
                onChange={(e) => set('role', e.target.value)}
              >
                <option value="cadet">Cadet</option>
                <option value="senior">Senior member</option>
                <option value="admin">Admin</option>
                <option value="parent">Parent / guardian</option>
              </select>
              {isSelf && <p className="text-[11px] text-slate-400 mt-1">You can&rsquo;t change your own role.</p>}
            </div>
            <div>
              <label className="cap-label">Email (sign-in){role === 'cadet' ? ' — optional' : ''}</label>
              <input
                type="email"
                className="cap-input"
                required={role !== 'cadet'}
                value={editing.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
            <div>
              <label className="cap-label">First name</label>
              <input
                type="text"
                required
                className="cap-input"
                value={editing.firstName}
                onChange={(e) => set('firstName', e.target.value)}
              />
            </div>
            <div>
              <label className="cap-label">Last name</label>
              <input
                type="text"
                required
                className="cap-input"
                value={editing.lastName}
                onChange={(e) => set('lastName', e.target.value)}
              />
            </div>

            {role !== 'parent' && (
              <div>
                <label className="cap-label">CAPID{role === 'cadet' ? '' : ' — optional'}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  required={capidRequired}
                  className="cap-input"
                  placeholder={editing.hasCapid ? 'On file — leave blank to keep' : ''}
                  value={editing.capid}
                  onChange={(e) => set('capid', e.target.value.replace(/\D/g, ''))}
                />
                {(role === 'senior' || role === 'admin') && !editing.memberId && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Add a CAPID to put them on the Senior Members roster (tracks their hours, lets them sign in with
                    CAPID).
                  </p>
                )}
              </div>
            )}

            {role === 'parent' && (
              <div className="sm:col-span-2">
                <label className="cap-label">Their cadet(s)</label>
                <select
                  multiple
                  className="cap-input h-28"
                  value={editing.linkedCadetIds}
                  onChange={(e) => set('linkedCadetIds', Array.from(e.target.selectedOptions, (o) => o.value))}
                >
                  {cadetRecords.map((c) => (
                    <option key={c.memberId} value={c.memberId}>
                      {c.lastName}, {c.firstName}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Ctrl/Cmd-click to select more than one.</p>
              </div>
            )}
          </div>

          {!editing.isNew && editing.memberId && role !== 'parent' && (
            <p className="text-xs text-slate-500">
              Their logged hours stay with them when you change role
              {role === 'cadet' ? ' (they show on the Cadets tab)' : ' (they show on the Senior Members tab)'}.
            </p>
          )}

          {formMsg && <p className="text-sm text-cap-red">{formMsg}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="cap-btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {!editing.isNew && editing.memberId && (
              <button type="button" className="cap-btn-outline" disabled={busy} onClick={toggleArchive}>
                {editing.archived ? 'Restore' : 'Archive'}
              </button>
            )}
            {!editing.isNew && !isSelf && (
              <button
                type="button"
                className="ml-auto text-sm text-cap-red underline disabled:opacity-50"
                disabled={busy}
                onClick={remove}
              >
                Delete permanently
              </button>
            )}
          </div>
        </form>
      )}

      <section className="cap-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            People <span className="normal-case tracking-normal font-normal text-slate-400">({people.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="cap-input !py-1 !w-44 text-sm"
              placeholder="Search name, email, role"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              className="cap-btn-primary !px-3 !py-1.5 text-xs"
              onClick={() => {
                setFormMsg('');
                setNotice('');
                setEditing({ ...blankPerson });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              + Add person
            </button>
          </div>
        </div>
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <p className="text-xs text-slate-400">
          Click anyone to change their role, email or CAPID, archive them, or delete them. CAPIDs are never shown
          &mdash; &ldquo;CAPID ✓&rdquo; just means one is on file.
        </p>
        <div className="divide-y text-sm">
          {visible.map((p) => (
            <button
              key={p.memberId || p.email}
              type="button"
              onClick={() => open(p)}
              className={`w-full text-left py-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-50 ${
                p.archived ? 'opacity-60' : ''
              }`}
            >
              <span className="font-medium text-slate-800 min-w-[10rem]">
                {p.lastName}, {p.firstName}
              </span>
              <span className={`cap-badge ${ROLE_BADGE[p.role] || 'bg-slate-100 text-slate-600'}`}>
                {ROLE_LABEL[p.role] || p.role}
              </span>
              {p.hasCapid && <span className="cap-badge bg-slate-100 text-slate-500">CAPID ✓</span>}
              {p.archived && <span className="cap-badge bg-slate-200 text-slate-600">Archived</span>}
              {!p.hasLogin && <span className="cap-badge bg-amber-50 text-amber-700">No login</span>}
              <span className="text-slate-400 text-xs truncate ml-auto">{p.email}</span>
            </button>
          ))}
          {visible.length === 0 && <p className="py-3 text-slate-400">No one matches.</p>}
        </div>
      </section>

      <section className="cap-card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Look up a pending login code</h2>
        <p className="text-xs text-slate-400">
          If someone's login email never arrives (some .gov/.cap.gov inboxes block it), have them tap &ldquo;Email me
          a login code&rdquo; on the sign-in screen first, then look their code up here and call or text it to them.
          It still expires in 15 minutes like a normal code.
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

      <p className="text-xs text-slate-400">
        Senior members and admins who sign in with their CAPID can only add hours to their own record. Verifying
        hours, logging for others, and this Admin screen need an email sign-in. Nobody can verify their own hours.
      </p>

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
