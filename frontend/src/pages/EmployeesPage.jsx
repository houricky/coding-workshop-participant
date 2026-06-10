import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Button, Box,
  Avatar, Stack, Chip, IconButton, Tooltip, Alert, LinearProgress, Typography,
  TextField, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog } from '../components/ui';
import EmployeeFormDialog from '../components/EmployeeFormDialog';
import { employees as employeesApi, apiErrorMessage } from '../services/api';
import { money, initials, percent, clampPercent } from '../utils/format';
import { rag } from '../theme';

const roleLabel = (role) => ({ admin: 'Admin', manager: 'Manager', employee: 'Employee' }[role] || role || 'Employee');
const staffLabel = (type) => (type === 'non_direct' ? 'Non-direct' : 'Direct');
const locationLabel = (location) => (location === 'on_site' ? 'On-site' : 'Remote');

export default function EmployeesPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [staffFilter, setStaffFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    setError('');
    employeesApi.list().then(setRows).catch((e) => setError(apiErrorMessage(e)));
  };
  useEffect(load, []);

  const handleSubmit = async (payload) => {
    if (editing?.id) await employeesApi.update(editing.id, payload);
    else await employeesApi.create(payload);
    load();
  };
  const confirmDelete = async () => {
    await employeesApi.remove(toDelete.id);
    setToDelete(null);
    load();
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((e) => (roleFilter === 'All' ? true : e.role === roleFilter))
      .filter((e) => (staffFilter === 'All' ? true : e.staff_type === staffFilter))
      .filter((e) => (locationFilter === 'All' ? true : e.location === locationFilter))
      .filter((e) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [e.name, e.email, e.title].some((value) => String(value || '').toLowerCase().includes(q));
      });
  }, [rows, roleFilter, staffFilter, locationFilter, query]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading employees" />;

  return (
    <Box>
      <PageHeader
        title="Employees"
        subtitle="Who's allocated where, and who's stretched past capacity."
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            New employee
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search employees" value={query}
          onChange={(e) => setQuery(e.target.value)} sx={{ maxWidth: 280 }} fullWidth />
        <TextField size="small" select label="Role" value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 140 }}>
          {['All', 'manager', 'employee'].map((value) => <MenuItem key={value} value={value}>{value === 'All' ? 'All' : roleLabel(value)}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Staff" value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="All">All</MenuItem>
          <MenuItem value="direct">Direct</MenuItem>
          <MenuItem value="non_direct">Non-direct</MenuItem>
        </TextField>
        <TextField size="small" select label="Location" value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="All">All</MenuItem>
          <MenuItem value="remote">Remote</MenuItem>
          <MenuItem value="on_site">On-site</MenuItem>
        </TextField>
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No employees yet" description="Add people so you can allocate them to projects."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>New employee</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different employee filter." />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Staff</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell align="center">Projects</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>Utilization</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/employees/${e.id}`)}>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ bgcolor: 'primary.light', fontSize: 14 }}>{initials(e.name)}</Avatar>
                        <Box>
                          <Box sx={{ fontWeight: 600 }}>{e.name}</Box>
                          <Box sx={{ fontSize: 12.5, color: 'text.secondary' }}>{e.title}</Box>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell><Chip size="small" label={roleLabel(e.role)} variant="outlined" /></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{staffLabel(e.staff_type)}</Typography></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{locationLabel(e.location)}</Typography></TableCell>
                    <TableCell align="center" className="tnum">{e.project_count}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1 }}>
                          <LinearProgress variant="determinate" value={clampPercent(e.utilization_percent)}
                            sx={{ height: 7, borderRadius: 4,
                              '& .MuiLinearProgress-bar': { bgcolor: e.overallocated ? rag.red.main : 'primary.main' } }} />
                        </Box>
                        <Typography variant="caption" className="tnum" sx={{ minWidth: 38, textAlign: 'right' }}>
                          {percent(e.utilization_percent)}
                        </Typography>
                      </Stack>
                      {e.overallocated && <Chip size="small" label="Overallocated" sx={{ mt: 0.5, bgcolor: rag.red.soft, color: rag.red.text, height: 20 }} />}
                    </TableCell>
                    <TableCell align="right" className="tnum">{money(e.hourly_rate)}/h</TableCell>
                    <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => { setEditing(e); setFormOpen(true); }}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setToDelete(e)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <EmployeeFormDialog open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />
      <ConfirmDialog open={!!toDelete} title="Delete employee?"
        message={`${toDelete?.name} will be removed along with their allocations and logged usage.`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
