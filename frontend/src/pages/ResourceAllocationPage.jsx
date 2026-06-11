import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, Box, Stack, TextField, MenuItem, IconButton, Tooltip, Alert, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
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
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ project_id: '', employee_id: '', allocated_hours: '', role_on_project: '' });
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

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
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows
      .filter((a) => !projectFilter || a.project_id === projectFilter)
      .filter((a) => !employeeFilter || a.employee_id === employeeFilter)
      .filter((a) => roleFilter === 'All' || a.role_on_project === roleFilter)
      .filter((a) => !q || [a.employee?.name, a.project?.name].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [employeeFilter, projectFilter, query, roleFilter, rows]);

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await allocApi.create({ ...form, allocated_hours: Number(form.allocated_hours) });
      setForm({ project_id: '', employee_id: '', allocated_hours: '', role_on_project: '' });
      setAddOpen(false);
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
      <PageHeader
        title="Resource allocation"
        subtitle="Plan who works on what, and for how many hours."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add allocation
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search allocations" value={query}
          onChange={(e) => setQuery(e.target.value)} sx={{ maxWidth: 280 }} fullWidth />
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete label="Project" options={projects} value={projectFilter} onChange={setProjectFilter}
            placeholder="Search projects" allowNone noneLabel="All projects" />
        </Box>
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete label="Employee" options={employees} value={employeeFilter} onChange={setEmployeeFilter}
            placeholder="Search employees" allowNone noneLabel="All employees" />
        </Box>
        <TextField size="small" select label="Role" value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="All">All</MenuItem>
          <MenuItem value="employee">Employee</MenuItem>
          <MenuItem value="manager">Manager</MenuItem>
        </TextField>
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No allocations yet" description="Allocate people to projects to start planning capacity."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add allocation</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different allocation filter." />
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
                {filtered.map((a) => (
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

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add allocation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <EntityAutocomplete label="Project" options={projects} value={form.project_id} onChange={setValue('project_id')} placeholder="Search projects" size="medium" />
            <EntityAutocomplete label="Employee" options={employees} value={form.employee_id} onChange={setValue('employee_id')} placeholder="Search employees" size="medium" />
            <TextField label="Hours" type="number" value={form.allocated_hours} onChange={set('allocated_hours')} fullWidth />
            <TextField select label="Role" value={form.role_on_project} onChange={set('role_on_project')} fullWidth>
              <MenuItem value="employee">Employee</MenuItem>
              <MenuItem value="manager">Manager</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Add allocation'}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!toDelete} title="Remove allocation?" confirmLabel="Remove"
        message={`Remove ${toDelete?.employee?.name} from ${toDelete?.project?.name}?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
