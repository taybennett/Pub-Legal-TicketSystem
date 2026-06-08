import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Locations } from './pages/Locations';
import { LocationDetail } from './pages/LocationDetail';
import { TicketDetail } from './pages/TicketDetail';
import { Dras } from './pages/Dras';

function Loading() {
  return <div className="state state--loading">Loading…</div>;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/locations" replace />} />
        <Route path="locations" element={<Locations />} />
        <Route path="locations/:id" element={<LocationDetail />} />
        <Route path="locations/:id/:tab" element={<LocationDetail />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="dras" element={<Dras />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
