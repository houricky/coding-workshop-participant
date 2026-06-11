import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Button, Box, Stack, TextField, MenuItem, IconButton, Tooltip, Alert, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog } from '../components/ui';
import RagChip from '../components/RagChip';
import HealthGauge from '../components/HealthGauge';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { useAuth } from '../context/AuthContext';
import { employees as employeesApi, projects as projectsApi, apiErrorMessage } from '../services/api';
import { money, hours, percent } from '../utils/format';
import { ragSortWeight } from '../utils/rag';

export default function ProjectsListPage() {
  const [rows, setRows] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isLead = (project) => project?.project_manager_id === user?.employee_id;
  const canEditProject = (project) => isAdmin || (user?.role === 'manager' && isLead(project));

  const load = () => {
    setError('');
    Promise.all([projectsApi.list(), employeesApi.list()])
      .then(([projectRows, employeeRows]) => { setRows(projectRows); setEmployees(employeeRows); })
      .catch((e) => setError(apiErrorMessage(e)));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((p) => (statusFilter === 'All' ? true : p.rag_status === statusFilter))
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => ragSortWeight[a.rag_status] - ragSortWeight[b.rag_status] || b.progress_gap - a.progress_gap);
  }, [rows, statusFilter, query]);

  const handleSubmit = async (payload) => {
    if (editing?.id) await projectsApi.update(editing.id, payload);
    else await projectsApi.create(payload);
    load();
  };

  const confirmDelete = async () => {
    await projectsApi.remove(toDelete.id);
    setToDelete(null);
    load();
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading projects" />;
  const managerOptions = employees.filter((e) => e.role === 'manager');

  return (
    <Box>
      <PageHeader
        title="Projects"
        subtitle="Sorted by urgency — most at-risk first."
        action={isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            New project
          </Button>
        )}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search projects" value={query}
          onChange={(e) => setQuery(e.target.value)} sx={{ maxWidth: 280 }} fullWidth />
        <TextField size="small" select label="Status" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 140 }}>
          {['All', 'Red', 'Amber', 'Green'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'No projects yet' : 'No matches'}
          description={rows.length === 0 ? 'Create your first project to start tracking budget and resource health.' : 'Try a different search or status filter.'}
          action={rows.length === 0 && isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              New project
            </Button>
          )}
        />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Health</TableCell>
                  {!compact && <TableCell align="right">Budget used</TableCell>}
                  {!compact && <TableCell align="right">Hours used</TableCell>}
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                    <TableCell>
                      <Box sx={{ fontWeight: 600 }}>{p.name}</Box>
                      <Box sx={{ fontSize: 12.5, color: 'text.secondary' }}>{p.stage} · {p.manager_count || 1} manager{(p.manager_count || 1) === 1 ? '' : 's'} · {p.team_size} people</Box>
                    </TableCell>
                    <TableCell><RagChip status={p.rag_status} /></TableCell>
                    <TableCell>
                      <HealthGauge burn={p.burn_percent} completion={p.actual_completion_percent} status={p.rag_status} showLabels={false} />
                    </TableCell>
                    {!compact && (
                      <TableCell align="right" className="tnum">
                        {money(p.budget_used)}
                        <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{percent(p.budget_used_percent)}</Box>
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell align="right" className="tnum">
                        {hours(p.hours_used)}
                        <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{percent(p.hours_used_percent)}</Box>
                      </TableCell>
                    )}
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {canEditProject(p) && (
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => { setEditing(p); setFormOpen(true); }}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {isAdmin && (
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setToDelete(p)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ProjectFormDialog open={formOpen} initial={editing} managerOptions={managerOptions} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete project?"
        message={`"${toDelete?.name}" and its allocations and usage records will be removed. This can't be undone.`}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </Box>
  );
}
