import { useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { TextField, Button, Typography, Alert, Stack, Link, Box } from '@mui/material';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, USE_MOCK } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(USE_MOCK ? 'admin@acme.com' : '');
  const [password, setPassword] = useState(USE_MOCK ? 'admin123' : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Sign in
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Welcome back. Enter your details to continue.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2} component="div">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          autoComplete="email"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          autoComplete="current-password"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <Button variant="contained" size="large" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        New to ACME?{' '}
        <Link component={RouterLink} to="/register" underline="hover">
          Create an account
        </Link>
      </Typography>

      {USE_MOCK && (
        <Box sx={{ mt: 3, p: 1.5, bgcolor: 'rgba(15,23,41,0.52)', border: '1px dashed rgba(125,249,255,0.24)', borderRadius: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Demo sign-in is pre-filled: <strong>admin@acme.com</strong> / <strong>admin123</strong>
          </Typography>
        </Box>
      )}
    </AuthShell>
  );
}
