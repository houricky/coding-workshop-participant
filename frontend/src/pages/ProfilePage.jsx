import { useEffect, useState } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Button, Avatar, Chip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputAdornment, MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { LoadingState } from '../components/ui';
import RagChip from '../components/RagChip';
import { employees as employeesApi, apiErrorMessage } from '../services/api';
import { money, hours, initials, percent, clampPercent, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { rag } from '../theme';

const roleLabel = (role) => ({ admin: 'Admin', manager: 'Manager', employee: 'Employee' }[role] || role || 'Employee');
const staffLabel = (type) => (type === 'non_direct' ? 'Non-direct' : 'Direct');
const locationLabel = (location) => (location === 'on_site' ? 'On-site' : 'Remote');

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load the full profile data when component mounts
  useEffect(() => {
    if (user?.employee_id) {
      employeesApi.get(user.employee_id)
        .then(setProfile)
        .catch((err) => setError(apiErrorMessage(err)))
        .finally(() => setLoading(false));
    }
  }, [user?.employee_id]);

  const handleEditClick = () => {
    if (profile) {
      setEditForm({
        name: profile.name,
        email: profile.email,
        title: profile.title,
        department: profile.department || '',
        role: profile.role,
        staff_type: profile.staff_type,
        location: profile.location,
        hourly_rate: profile.hourly_rate,
        capacity_hours: profile.capacity_hours,
      });
      setEditDialogOpen(true);
    }
  };

  const handleEditFormChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setSaveError('');
    setSaving(true);
    try {
      const updated = await employeesApi.update(user.employee_id, editForm);
      setProfile(updated);
      setEditDialogOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (loading || !profile) return <LoadingState label="Loading profile" />;

  return (
    <Box>
      <Grid container spacing={2.5}>
        {/* Main profile card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack alignItems="center" spacing={1.5} sx={{ py: 1 }}>
                <Avatar sx={{ width: 72, height: 72, fontSize: 26, bgcolor: 'primary.main' }}>
                  {initials(profile.name)}
                </Avatar>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6">{profile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{profile.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{profile.email}</Typography>
                </Box>
                {profile.overallocated && (
                  <Chip size="small" label="Overallocated" sx={{ bgcolor: rag.red.soft, color: rag.red.text }} />
                )}
              </Stack>

              <Box sx={{ mt: 3 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Role</Typography>
                  <Typography variant="body2">{roleLabel(profile.role)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Department</Typography>
                  <Typography variant="body2">{profile.department || 'Not set'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Staff</Typography>
                  <Typography variant="body2">{staffLabel(profile.staff_type)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Location</Typography>
                  <Typography variant="body2">{locationLabel(profile.location)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Rate</Typography>
                  <Typography variant="body2" className="tnum">{money(profile.hourly_rate)}/h</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Capacity</Typography>
                  <Typography variant="body2" className="tnum">{hours(profile.capacity_hours)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Allocated</Typography>
                  <Typography variant="body2" className="tnum">{hours(profile.allocated_hours)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 3 }}>
                  <Typography variant="body2" color="text.secondary">Logged</Typography>
                  <Typography variant="body2" className="tnum">{hours(profile.hours_used)}</Typography>
                </Stack>

                {/* Utilization bar */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Utilization</Typography>
                  {/* Import LinearProgress from MUI */}
                  <Box
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      mt: 0.5,
                      bgcolor: 'rgba(148,163,184,0.18)',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${clampPercent(profile.utilization_percent)}%`,
                        bgcolor: profile.overallocated ? rag.red.main : 'primary.main',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" className="tnum">
                    {percent(profile.utilization_percent)} of capacity
                  </Typography>
                </Box>
              </Box>

              <Button
                fullWidth
                variant="contained"
                startIcon={<EditIcon />}
                onClick={handleEditClick}
                sx={{ mt: 2.5 }}
              >
                Edit Profile
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Project allocations */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Your project allocations</Typography>
              {profile.allocations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  You are not allocated to any projects yet.
                </Typography>
              ) : (
                <Box sx={{ mt: 1, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', paddingBottom: '8px', borderBottom: '1px solid rgba(148,163,184,0.14)', fontSize: '12px' }}>
                          Project
                        </th>
                        <th style={{ textAlign: 'left', paddingBottom: '8px', borderBottom: '1px solid rgba(148,163,184,0.14)', fontSize: '12px' }}>
                          Role
                        </th>
                        <th style={{ textAlign: 'left', paddingBottom: '8px', borderBottom: '1px solid rgba(148,163,184,0.14)', fontSize: '12px' }}>
                          Status
                        </th>
                        <th style={{ textAlign: 'right', paddingBottom: '8px', borderBottom: '1px solid rgba(148,163,184,0.14)', fontSize: '12px' }}>
                          Allocated
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.allocations.map((a) => (
                        <tr key={a.id}>
                          <td style={{ paddingTop: '12px', paddingBottom: '12px', fontSize: '14px' }}>
                            {a.project?.name}
                          </td>
                          <td style={{ paddingTop: '12px', paddingBottom: '12px', fontSize: '14px', color: 'rgba(148,163,184,0.8)' }}>
                            {a.role_on_project === 'manager' ? 'Manager' : 'Employee'}
                          </td>
                          <td style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                            {a.project && <RagChip status={a.project.rag_status} />}
                          </td>
                          <td style={{ paddingTop: '12px', paddingBottom: '12px', textAlign: 'right', fontSize: '14px', fontFamily: 'monospace' }}>
                            {hours(a.allocated_hours)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Your Profile</DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Full name"
              value={editForm?.name || ''}
              onChange={(e) => handleEditFormChange('name', e.target.value)}
              fullWidth
              disabled
              helperText="Contact your administrator to change your name"
            />
            <TextField
              label="Email"
              type="email"
              value={editForm?.email || ''}
              onChange={(e) => handleEditFormChange('email', e.target.value)}
              fullWidth
              disabled
              helperText="Contact your administrator to change your email"
            />
            <TextField
              label="Title"
              value={editForm?.title || ''}
              onChange={(e) => handleEditFormChange('title', e.target.value)}
              fullWidth
            />
            <TextField
              label="Department"
              value={editForm?.department || ''}
              onChange={(e) => handleEditFormChange('department', e.target.value)}
              fullWidth
            />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Role"
                  select
                  value={editForm?.role || 'employee'}
                  disabled
                  fullWidth
                  helperText="Contact your administrator to change"
                >
                  <MenuItem value="employee">Employee</MenuItem>
                  <MenuItem value="manager">Manager</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Staff"
                  select
                  value={editForm?.staff_type || 'direct'}
                  disabled
                  fullWidth
                  helperText="Contact admin"
                >
                  <MenuItem value="direct">Direct</MenuItem>
                  <MenuItem value="non_direct">Non-direct</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Location"
                  select
                  value={editForm?.location || 'remote'}
                  disabled
                  fullWidth
                  helperText="Contact admin"
                >
                  <MenuItem value="remote">Remote</MenuItem>
                  <MenuItem value="on_site">On-site</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Hourly rate"
                  type="number"
                  value={editForm?.hourly_rate || 0}
                  disabled
                  fullWidth
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                  helperText="Contact admin"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Capacity (hours)"
                  type="number"
                  value={editForm?.capacity_hours || 0}
                  disabled
                  fullWidth
                  helperText="Contact admin"
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveProfile}
            disabled={saving || !editForm?.title}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
