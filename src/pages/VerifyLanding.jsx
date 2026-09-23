import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function VerifyLanding() {
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) {
      setError('Missing login token.');
      return;
    }
    api
      .verifyToken(token)
      .then(async (data) => {
        await login(data.sessionToken);
        navigate('/');
      })
      .catch((err) => setError(err.message));
  }, [params, login, navigate]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="cap-card p-6 max-w-sm w-full text-center">
        {error ? (
          <>
            <p className="text-cap-red font-medium mb-2">Sign-in failed</p>
            <p className="text-sm text-slate-500 mb-4">{error}</p>
            <button className="cap-btn-primary" onClick={() => navigate('/login')}>
              Back to sign in
            </button>
          </>
        ) : (
          <p className="text-slate-600">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
