import { useEffect, useState } from 'react';
import {
  Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, Box, TextField, IconButton, Tooltip, Alert, Grid, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog, EntityAutocomplete } from '../components/ui';
import { usage as usageApi, projects as projectsApi, employees as employeesApi, apiErrorMessage } from '../services/api';
import { hours, money, formatDate } from '../utils/format';

const today = () => new Date().toISOString().slice(0, 10);

export default function ResourceUsagePage() {
  const [rows, setRows] = useState(null);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [form, setForm] = useState({ project_id: '', employee_id: '', hours_used: '', logged_on: today() });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError('');
    Promise.all([usageApi.list(), projectsApi.list(), employeesApi.list()])
      .then(([u, p, e]) => { setRows(u); setProjects(p); setEmployees(e); })
      .catch((e) => setError(apiErrorMessage(e)));
  };
  useEffect(load, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k) => (value) => setForm((f) => ({ ...f, [k]: value }));
  const valid = form.project_id && form.employee_id && Number(form.hours_used) > 0;

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await usageApi.create({ ...form, hours_used: Number(form.hours_used) });
      setForm({ project_id: '', employee_id: '', hours_used: '', logged_on: today() });
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => { await usageApi.remove(toDelete.id); setToDelete(null); load(); };

  if (error && !rows) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading usage records" />;

  const rateOf = (id) => employees.find((e) => e.id === id)?.hourly_rate || 0;

  return (
    <Box>
      <PageHeader title="Resource usage" subtitle="Record actual hours worked. This drives budget burn and RAG status." />

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">Log hours</Typography>
          <Grid container spacing={2} sx={{ mt: 0 }} alignItems="flex-start">
            <Grid item xs={12} sm={6} md={3}>
              <EntityAutocomplete label="Project" options={projects} value={form.project_id} onChange={setValue('project_id')} placeholder="Search projects" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <EntityAutocomplete label="Employee" options={employees} value={form.employee_id} onChange={setValue('employee_id')} placeholder="Search employees" />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField size="small" label="Hours" type="number" value={form.hours_used} onChange={set('hours_used')} fullWidth />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField size="small" label="Date" type="date" value={form.logged_on} onChange={set('logged_on')} fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={4} md={2}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd} disabled={!valid || saving} fullWidth sx={{ height: 40 }}>
                Log
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No usage logged yet" description="Record hours above. RAG status recalculates as soon as usage is logged." />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {[...rows].reverse().map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.employee?.name}</TableCell>
                    <TableCell>{u.project?.name}</TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{formatDate(u.logged_on)}</Typography></TableCell>
                    <TableCell align="right" className="tnum">{hours(u.hours_used)}</TableCell>
                    <TableCell align="right" className="tnum">{money(u.hours_used * rateOf(u.employee_id))}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setToDelete(u)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ConfirmDialog open={!!toDelete} title="Delete usage record?" confirmLabel="Delete"
        message={`Delete this ${toDelete ? hours(toDelete.hours_used) : ''} entry?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
