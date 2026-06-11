import { useEffect, useState } from 'react';
import {
  Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, Box, Stack, TextField, MenuItem, IconButton, Tooltip, Alert, Grid, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog, EntityAutocomplete } from '../components/ui';
import { allocations as allocApi, projects as projectsApi, employees as employeesApi, apiErrorMessage } from '../services/api';
import { hours, money } from '../utils/format';

const projectRoleLabel = (role) => ({ manager: 'Manager', employee: 'Employee' }[role] || 'Employee');

export default function ResourceAllocationPage() {
  const [rows, setRows] = useState(null);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [form, setForm] = useState({ project_id: '', employee_id: '', allocated_hours: '', role_on_project: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError('');
    Promise.all([allocApi.list(), projectsApi.list(), employeesApi.list()])
      .then(([a, p, e]) => { setRows(a); setProjects(p); setEmployees(e); })
      .catch((e) => setError(apiErrorMessage(e)));
  };
  useEffect(load, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k) => (value) => setForm((f) => ({ ...f, [k]: value }));
  const valid = form.project_id && form.employee_id && form.role_on_project && Number(form.allocated_hours) > 0;

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await allocApi.create({ ...form, allocated_hours: Number(form.allocated_hours) });
      setForm({ project_id: '', employee_id: '', allocated_hours: '', role_on_project: '' });
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => { await allocApi.remove(toDelete.id); setToDelete(null); load(); };

  if (error && !rows) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading allocations" />;

  const rateOf = (id) => employees.find((e) => e.id === id)?.hourly_rate || 0;

  return (
    <Box>
      <PageHeader title="Resource allocation" subtitle="Plan who works on what, and for how many hours." />

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">Add allocation</Typography>
          <Grid container spacing={2} sx={{ mt: 0 }} alignItems="flex-start">
            <Grid item xs={12} sm={6} md={3}>
              <EntityAutocomplete label="Project" options={projects} value={form.project_id} onChange={setValue('project_id')} placeholder="Search projects" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <EntityAutocomplete label="Employee" options={employees} value={form.employee_id} onChange={setValue('employee_id')} placeholder="Search employees" />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField size="small" label="Hours" type="number" value={form.allocated_hours} onChange={set('allocated_hours')} fullWidth />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField select size="small" label="Role" value={form.role_on_project} onChange={set('role_on_project')} fullWidth>
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4} md={2}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd} disabled={!valid || saving} fullWidth sx={{ height: 40 }}>
                Add
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No allocations yet" description="Allocate people to projects above to start planning capacity." />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right">Allocated hours</TableCell>
                  <TableCell align="right">Planned cost</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.employee?.name}</TableCell>
                    <TableCell>{a.project?.name}</TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{projectRoleLabel(a.role_on_project)}</Typography></TableCell>
                    <TableCell align="right" className="tnum">{hours(a.allocated_hours)}</TableCell>
                    <TableCell align="right" className="tnum">{money(a.allocated_hours * rateOf(a.employee_id))}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => setToDelete(a)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ConfirmDialog open={!!toDelete} title="Remove allocation?" confirmLabel="Remove"
        message={`Remove ${toDelete?.employee?.name} from ${toDelete?.project?.name}?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
