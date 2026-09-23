import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [capid, setCapid] = useState('');
  const [stage, setStage] = useState('email'); // email | code | capid
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function go(next) {
    setStage(next);
    setError('');
    setNotice('');
  }

  // For someone who got their code by phone/text from the admin — skips the
  // re-request that would otherwise generate a fresh code.
  function haveCode() {
    if (!email.trim()) {
      setError('Enter your email first, then tap this.');
      return;
    }
    go('code');
    setNotice('Enter the code your squadron admin gave you.');
  }

  async function submitCapid(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.loginCapid(capid.trim());
      await login(data.sessionToken);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.requestCode(email);
      go('code');
    } catch (err) {
      if (err.status === 500) {
        // Send failed, but the code exists server-side and the admin can look it up.
        // Don't strand them on this screen with no way to type a code in.
        go('code');
        setNotice(
          "We couldn't confirm the email went out. If nothing shows up in a minute, ask your squadron admin to look up your code."
        );
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.verifyCode(email, code.trim());
      await login(data.sessionToken);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="cap-card w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-cap-gradient flex items-center justify-center text-cap-gold font-display text-xl border-2 border-cap-gold">
            036
          </div>
          <h1 className="text-xl font-semibold text-cap-blue">Volunteer Hours Sign-In</h1>
          <p className="text-sm text-slate-500 mt-1">
            Springfield Composite Squadron &middot; Civil Air Patrol
          </p>
        </div>

        {stage === 'email' && (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="cap-label">Email on file with the squadron</label>
              <input
                type="email"
                required
                className="cap-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-cap-red">{error}</p>}
            <button className="cap-btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a login code'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              New parent or senior member? Ask your squadron admin to add your email first.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" className="text-xs text-slate-500 underline w-full text-center" onClick={haveCode}>
                Already have a code from your admin?
              </button>
              <button type="button" className="text-xs text-slate-500 underline w-full text-center" onClick={() => go('capid')}>
                Cadet? Sign in with your CAPID instead
              </button>
            </div>
          </form>
        )}

        {stage === 'capid' && (
          <form onSubmit={submitCapid} className="space-y-4">
            <p className="text-sm text-slate-600">
              Cadets can sign in with their CAPID while we sort out email delivery for some accounts.
            </p>
            <div>
              <label className="cap-label">Your CAPID</label>
              <input
                type="text"
                inputMode="numeric"
                required
                className="cap-input text-center tracking-[0.2em] text-lg"
                placeholder="e.g. 774629"
                value={capid}
                onChange={(e) => setCapid(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && <p className="text-sm text-cap-red">{error}</p>}
            <button className="cap-btn-primary w-full" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 underline w-full text-center"
              onClick={() => go('email')}
            >
              Senior member or parent? Use email instead
            </button>
          </form>
        )}

        {stage === 'code' && (
          <form onSubmit={submitCode} className="space-y-4">
            {notice ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{notice}</p>
            ) : (
              <p className="text-sm text-slate-600">
                We sent a 6-digit code (and a login link) to <strong>{email}</strong>. Enter the code below,
                or just tap the link in the email.
              </p>
            )}
            <div>
              <label className="cap-label">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                className="cap-input text-center tracking-[0.5em] text-lg"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && <p className="text-sm text-cap-red">{error}</p>}
            <button className="cap-btn-primary w-full" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              Didn&rsquo;t get it? Some squadron inboxes block these. Your admin can look up your code and read
              it to you &mdash; it works for 15 minutes.
            </p>
            <button
              type="button"
              className="text-xs text-slate-500 underline w-full text-center"
              onClick={() => go('email')}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
