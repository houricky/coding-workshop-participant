import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './ui';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
