import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Header from './components/Header.jsx';
import Login from './pages/Login.jsx';
import VerifyLanding from './pages/VerifyLanding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CadetDetail from './pages/CadetDetail.jsx';
import ReviewQueue from './pages/ReviewQueue.jsx';
import Admin from './pages/Admin.jsx';
import Report from './pages/Report.jsx';
import GroupEntry from './pages/GroupEntry.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-center py-16 text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<VerifyLanding />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/cadet/:id"
            element={
              <RequireAuth>
                <CadetDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/report/:id"
            element={
              <RequireAuth>
                <Report />
              </RequireAuth>
            }
          />
          <Route
            path="/group"
            element={
              <RequireAuth>
                <RequireRole roles={['admin', 'senior']}>
                  <GroupEntry />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/review"
            element={
              <RequireAuth>
                <RequireRole roles={['admin', 'senior', 'parent']}>
                  <ReviewQueue />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireRole roles={['admin']}>
                  <Admin />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="no-print text-center text-[11px] text-slate-400 py-4">
        IL-036 Springfield Composite Squadron &middot; Civil Air Patrol &middot; Community Service Ribbon tracker
      </footer>
    </div>
  );
}
