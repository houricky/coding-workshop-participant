import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './ui';

/**
 * Smart root route that redirects based on authentication state.
 * - If loading: Show loading screen
 * - If authenticated: Redirect to /dashboard
 * - If not authenticated: Redirect to /login
 */
export default function RootRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <LoadingState label="Restoring your session" />;
  
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}
