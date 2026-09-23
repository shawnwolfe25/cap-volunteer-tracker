import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const roleLabel = {
  admin: 'Squadron Admin',
  senior: 'Senior Member',
  parent: 'Parent / Guardian',
  cadet: 'Cadet',
};

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-cap-gradient text-white no-print">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <PropSeal />
          <div className="leading-tight">
            <div className="font-display text-lg sm:text-xl font-semibold tracking-wider">
              IL-036 VOLUNTEER HOURS
            </div>
            <div className="text-[11px] sm:text-xs text-cap-silver/90 uppercase tracking-[0.2em]">
              Springfield Composite Squadron &middot; Civil Air Patrol
            </div>
          </div>
        </Link>

        {user && (
          <nav className="flex items-center gap-2 sm:gap-3 text-sm">
            <Link to="/" className="hidden sm:inline hover:text-cap-gold transition-colors">
              Roster
            </Link>
            {['admin', 'senior', 'parent'].includes(user.role) && (
              <Link to="/review" className="hidden sm:inline hover:text-cap-gold transition-colors">
                Review Queue
              </Link>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" className="hidden sm:inline hover:text-cap-gold transition-colors">
                Admin
              </Link>
            )}
            <div className="flex items-center gap-2 bg-white/10 rounded-full pl-3 pr-1 py-1">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold">{user.name}</div>
                <div className="text-[10px] text-cap-silver/80 uppercase tracking-wide">
                  {roleLabel[user.role] || user.role}
                </div>
              </div>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="cap-btn bg-white/15 hover:bg-white/25 !px-3 !py-1.5 text-xs"
              >
                Sign out
              </button>
            </div>
          </nav>
        )}
      </div>
      {user && (
        <div className="sm:hidden flex justify-around bg-black/20 text-xs py-2">
          <Link to="/">Roster</Link>
          {['admin', 'senior', 'parent'].includes(user.role) && <Link to="/review">Review</Link>}
          {user.role === 'admin' && <Link to="/admin">Admin</Link>}
        </div>
      )}
    </header>
  );
}

function PropSeal() {
  return (
    <svg width="36" height="36" viewBox="0 0 100 100" className="drop-shadow-sm shrink-0">
      <circle cx="50" cy="50" r="48" fill="#0B3D6E" stroke="#C8A951" strokeWidth="3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#C8A951" strokeWidth="1.5" opacity="0.6" />
      <g fill="#B0202E" stroke="#C8A951" strokeWidth="1">
        <path d="M50 14 L56 46 L50 50 L44 46 Z" />
        <path d="M50 86 L56 54 L50 50 L44 54 Z" />
        <path d="M14 50 L46 44 L50 50 L46 56 Z" />
        <path d="M86 50 L54 44 L50 50 L54 56 Z" />
      </g>
      <circle cx="50" cy="50" r="7" fill="#C8A951" />
    </svg>
  );
}
