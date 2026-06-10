import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  TextField,
  Button,
  Typography,
  Alert,
  Stack,
  Link,
  MenuItem,
} from '@mui/material';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../services/api';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (!form.name || !form.email || form.password.length < 6) {
      setError('Enter your name, email, and a password of at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await register(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Create your account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Roles are stored now for future access control. Everyone can do everything in the MVP.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        <TextField label="Full name" value={form.name} onChange={set('name')} fullWidth />
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} fullWidth />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          helperText="At least 6 characters"
          fullWidth
        />
        <TextField label="Role" select value={form.role} onChange={set('role')} fullWidth>
          <MenuItem value="employee">Employee</MenuItem>
          <MenuItem value="manager">Manager</MenuItem>
        </TextField>
        <Button variant="contained" size="large" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Already have an account?{' '}
        <Link component={RouterLink} to="/login" underline="hover">
          Sign in
        </Link>
      </Typography>
    </AuthShell>
  );
}
