import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, Box, Stack, TextField, IconButton, Tooltip, Alert, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
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
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ project_id: '', employee_id: '', hours_used: '', logged_on: today() });
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');

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
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows
      .filter((u) => !projectFilter || u.project_id === projectFilter)
      .filter((u) => !employeeFilter || u.employee_id === employeeFilter)
      .filter((u) => !q || [u.employee?.name, u.project?.name].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [employeeFilter, projectFilter, query, rows]);

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await usageApi.create({ ...form, hours_used: Number(form.hours_used) });
      setForm({ project_id: '', employee_id: '', hours_used: '', logged_on: today() });
      setAddOpen(false);
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
      <PageHeader
        title="Resource usage"
        subtitle="Record actual hours worked. This drives budget burn and RAG status."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Log hours
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search usage" value={query}
          onChange={(e) => setQuery(e.target.value)} sx={{ maxWidth: 280 }} fullWidth />
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete label="Project" options={projects} value={projectFilter} onChange={setProjectFilter}
            placeholder="Search projects" allowNone noneLabel="All projects" />
        </Box>
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete label="Employee" options={employees} value={employeeFilter} onChange={setEmployeeFilter}
            placeholder="Search employees" allowNone noneLabel="All employees" />
        </Box>
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No usage logged yet" description="Record hours. RAG status recalculates as soon as usage is logged."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Log hours</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different usage filter." />
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
                {[...filtered].reverse().map((u) => (
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

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log hours</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <EntityAutocomplete label="Project" options={projects} value={form.project_id} onChange={setValue('project_id')} placeholder="Search projects" size="medium" />
            <EntityAutocomplete label="Employee" options={employees} value={form.employee_id} onChange={setValue('employee_id')} placeholder="Search employees" size="medium" />
            <TextField label="Hours" type="number" value={form.hours_used} onChange={set('hours_used')} fullWidth />
            <TextField label="Date" type="date" value={form.logged_on} onChange={set('logged_on')} fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Log hours'}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!toDelete} title="Delete usage record?" confirmLabel="Delete"
        message={`Delete this ${toDelete ? hours(toDelete.hours_used) : ''} entry?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
