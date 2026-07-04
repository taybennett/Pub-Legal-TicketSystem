import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="layout">
      <header className="topnav">
        <div className="topnav-inner">
          <Link to="/locations" className="brand">
            <span className="brand-mark">PUB</span>
            <span className="brand-sub">LEGAL · PORTAL</span>
          </Link>
          <nav className="topnav-links">
            <NavLink to="/locations" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>Shops</NavLink>
            {me?.userType === 'Admin' && (
              <NavLink to="/dras" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>DRAs</NavLink>
            )}
            {me?.userType === 'Admin' && (
              <NavLink to="/fa" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>Generate FA</NavLink>
            )}
            {me?.userType === 'Admin' && (
              <NavLink to="/compliance" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>Compliance</NavLink>
            )}
            {me?.userType === 'Admin' && (
              <NavLink to="/reports" className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>Reports</NavLink>
            )}
          </nav>
          <div className="topnav-user">
            <span className="user-name">{me?.name}</span>
            <button className="signout" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
