import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Grid, IconButton, Link, MenuItem,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog } from '../components/ui';
import DeliverableFormDialog from '../components/DeliverableFormDialog';
import {
  allocations as allocationsApi,
  deliverables as deliverablesApi,
  employees as employeesApi,
  projects as projectsApi,
  apiErrorMessage,
} from '../services/api';
import { formatDate } from '../utils/format';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];
const deliverableStatusLabel = (status) => ({ pending: 'Pending', in_progress: 'In progress', completed: 'Completed' }[status] || status || 'Pending');
const deliverableStatusColor = (status) => ({ completed: 'success', in_progress: 'warning', pending: 'default' }[status] || 'default');

export default function DeliverablesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [filters, setFilters] = useState({ project_id: '', employee_id: '', status: '' });
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toEdit, setToEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);

  const load = () => {
    setError('');
    Promise.all([
      deliverablesApi.list(params),
      projectsApi.list(),
      employeesApi.list(),
      allocationsApi.list(),
    ])
      .then(([deliverableRows, projectRows, employeeRows, allocationRows]) => {
        setRows(deliverableRows);
        setProjects(projectRows);
        setEmployees(employeeRows);
        setAllocations(allocationRows);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  };

  useEffect(load, [params]);

  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const openDialog = (deliverable = null) => {
    setToEdit(deliverable);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setToEdit(null);
  };
  const saveDeliverable = async (payload) => {
    if (toEdit?.id) {
      await deliverablesApi.update(toEdit.id, payload);
    } else {
      await deliverablesApi.create(payload);
    }
    load();
  };
  const confirmDelete = async () => {
    await deliverablesApi.remove(toDelete.id);
    setToDelete(null);
    load();
  };

  const assigneeOptions = allocations
    .filter((allocation) => allocation.employee)
    .map((allocation) => ({
      ...allocation.employee,
      project_id: allocation.project_id,
    }));

  if (error && !rows) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading deliverables" />;

  return (
    <Box>
      <PageHeader
        title="Deliverables"
        subtitle="Track discrete project outcomes, owners, dates, and status."
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog()}>Add deliverable</Button>}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField select size="small" label="Project" value={filters.project_id} onChange={setFilter('project_id')} fullWidth>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select size="small" label="Assignee" value={filters.employee_id} onChange={setFilter('employee_id')} fullWidth>
                <MenuItem value="">All assignees</MenuItem>
                {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select size="small" label="Status" value={filters.status} onChange={setFilter('status')} fullWidth>
                {STATUSES.map((status) => <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No deliverables found" description="Adjust the filters or add a deliverable to a project." />
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Due date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((deliverable) => (
                  <TableRow key={deliverable.id} hover onClick={() => navigate(`/projects/${deliverable.project_id}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{deliverable.title}</Typography>
                        {deliverable.description && (
                          <Typography variant="caption" color="text.secondary">{deliverable.description}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{deliverable.project?.name}</TableCell>
                    <TableCell>
                      {deliverable.employee?.name ? (
                        <Link component="button" underline="hover" onClick={(event) => { event.stopPropagation(); navigate(`/employees/${deliverable.employee_id}`); }}>
                          {deliverable.employee.name}
                        </Link>
                      ) : (
                        <Chip size="small" variant="outlined" label="Unassigned" />
                      )}
                    </TableCell>
                    <TableCell className="tnum">{formatDate(deliverable.due_date)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={deliverableStatusColor(deliverable.status)}
                        label={deliverableStatusLabel(deliverable.status)} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" justifyContent="flex-end">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={(event) => { event.stopPropagation(); openDialog(deliverable); }}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={(event) => { event.stopPropagation(); setToDelete(deliverable); }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <DeliverableFormDialog open={dialogOpen} initial={toEdit} projectOptions={projects}
        assigneeOptions={assigneeOptions} onClose={closeDialog} onSubmit={saveDeliverable} />
      <ConfirmDialog open={!!toDelete} title="Delete deliverable?" confirmLabel="Delete"
        message={`Delete ${toDelete?.title || 'this deliverable'}?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
