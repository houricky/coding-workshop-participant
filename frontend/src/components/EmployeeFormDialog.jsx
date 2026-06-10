import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Grid, InputAdornment, MenuItem,
} from '@mui/material';

const empty = {
  name: '',
  email: '',
  role: 'employee',
  staff_type: 'direct',
  location: 'remote',
  title: '',
  hourly_rate: 100,
  capacity_hours: 320,
};

export default function EmployeeFormDialog({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) setForm(initial ? { ...empty, ...initial } : empty);
  }, [open, initial]);

  const set = (k, t = (v) => v) => (e) => setForm((f) => ({ ...f, [k]: t(e.target.value) }));
  const num = (v) => (v === '' ? '' : Number(v));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        is_direct_staff: form.staff_type === 'direct',
        work_location: form.location,
        hourly_rate: Number(form.hourly_rate) || 0,
        capacity_hours: Number(form.capacity_hours) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit employee' : 'New employee'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Full name" value={form.name} onChange={set('name')} fullWidth autoFocus />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} fullWidth />
          <TextField label="Title" value={form.title} onChange={set('title')} fullWidth />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField label="Role" select value={form.role} onChange={set('role')} fullWidth>
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Staff" select value={form.staff_type} onChange={set('staff_type')} fullWidth>
                <MenuItem value="direct">Direct</MenuItem>
                <MenuItem value="non_direct">Non-direct</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Location" select value={form.location} onChange={set('location')} fullWidth>
                <MenuItem value="remote">Remote</MenuItem>
                <MenuItem value="on_site">On-site</MenuItem>
              </TextField>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Hourly rate" type="number" value={form.hourly_rate} onChange={set('hourly_rate', num)}
                fullWidth InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Capacity (hours)" type="number" value={form.capacity_hours} onChange={set('capacity_hours', num)}
                fullWidth helperText="Planned hours over the period" />
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !form.name}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
