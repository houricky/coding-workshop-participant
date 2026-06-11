import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Checkbox, Chip, FormControlLabel,
  IconButton, Link, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { PageHeader, LoadingState, EmptyState, ConfirmDialog, EntityAutocomplete } from '../components/ui';
import DeliverableFormDialog from '../components/DeliverableFormDialog';
import { useAuth } from '../context/AuthContext';
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
  { value: 'stalled', label: 'Stalled' },
  { value: 'completed', label: 'Completed' },
];
const deliverableStatusLabel = (status) => ({ pending: 'Pending', in_progress: 'In progress', stalled: 'Stalled', completed: 'Completed' }[status] || status || 'Pending');
const deliverableStatusColor = (status) => ({ completed: 'success', in_progress: 'warning', stalled: 'error', pending: 'default' }[status] || 'default');

export default function DeliverablesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [allDeliverables, setAllDeliverables] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [filters, setFilters] = useState({ project_id: '', employee_id: '', status: '' });
  const [blocksOnly, setBlocksOnly] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toEdit, setToEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { user } = useAuth();

  const params = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);

  const load = () => {
    setError('');
    Promise.all([
      deliverablesApi.list(params),
      deliverablesApi.list(),
      projectsApi.list(),
      employeesApi.list(),
      allocationsApi.list(),
    ])
      .then(([deliverableRows, allDeliverableRows, projectRows, employeeRows, allocationRows]) => {
        setRows(deliverableRows);
        setAllDeliverables(allDeliverableRows);
        setProjects(projectRows);
        setEmployees(employeeRows);
        setAllocations(allocationRows);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  };

  useEffect(load, [params]);

  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const setFilterValue = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }));
  const filteredRows = useMemo(
    () => rows?.filter((deliverable) => !blocksOnly || deliverable.blocks_count > 0) || [],
    [blocksOnly, rows],
  );
  const openDialog = (deliverable = null) => {
    setToEdit(deliverable);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setToEdit(null);
  };
  const syncDeliverableDependencies = async (deliverableId, dependencyIds) => {
    if (!Array.isArray(dependencyIds)) return;
    const selectedIds = new Set(dependencyIds || []);
    const existingEdges = toEdit?.blocked_by || [];
    await Promise.all(existingEdges
      .filter((edge) => !selectedIds.has(edge.id))
      .map((edge) => deliverablesApi.removeDependency(edge.dependency_id)));

    const existingIds = new Set(existingEdges.map((edge) => edge.id));
    await Promise.all((dependencyIds || [])
      .filter((dependencyId) => !existingIds.has(dependencyId))
      .map((dependencyId) => deliverablesApi.createDependency({
        deliverable_id: deliverableId,
        depends_on_deliverable_id: dependencyId,
      })));
  };
  const saveDeliverable = async (payload, options = {}) => {
    const saved = toEdit?.id
      ? await deliverablesApi.update(toEdit.id, payload)
      : await deliverablesApi.create(payload);
    await syncDeliverableDependencies(toEdit?.id || saved.id, options.dependencyIds);
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
  const isAdmin = user?.role === 'admin';
  const leadProjectIds = new Set([
    ...projects.filter((project) => project.project_manager_id === user?.employee_id).map((project) => project.id),
    ...allocations
      .filter((allocation) => allocation.employee_id === user?.employee_id && allocation.role_on_project === 'manager')
      .map((allocation) => allocation.project_id),
  ]);
  const isProjectLead = (projectId) => isAdmin || (user?.role === 'manager' && leadProjectIds.has(projectId));
  const canCreateDeliverable = isAdmin || user?.role === 'manager';
  const canEditDeliverable = (deliverable) => {
    if (isProjectLead(deliverable.project_id)) return true;
    if (user?.role !== 'employee') return false;
    const assignedId = deliverable.employee_id || deliverable.assigned_employee_id;
    return assignedId === user?.employee_id || !assignedId;
  };
  const projectOptions = user?.role === 'manager'
    ? projects.filter((project) => leadProjectIds.has(project.id))
    : projects;

  if (error && !rows) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <LoadingState label="Loading deliverables" />;

  return (
    <Box>
      <PageHeader
        title="Deliverables"
        subtitle="Track discrete project outcomes, owners, dates, and status."
        action={canCreateDeliverable && <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog()}>Add deliverable</Button>}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete
            label="Project"
            options={projects}
            value={filters.project_id}
            onChange={setFilterValue('project_id')}
            placeholder="Search projects"
            allowNone
            noneLabel="All projects"
          />
        </Box>
        <Box sx={{ minWidth: 220, maxWidth: 280, width: '100%' }}>
          <EntityAutocomplete
            label="Assignee"
            options={employees}
            value={filters.employee_id}
            onChange={setFilterValue('employee_id')}
            placeholder="Search assignees"
            allowNone
            noneLabel="All assignees"
          />
        </Box>
        <TextField select size="small" label="Status" value={filters.status} onChange={setFilter('status')} sx={{ minWidth: 160 }}>
          {STATUSES.map((status) => <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>)}
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={blocksOnly} onChange={(event) => setBlocksOnly(event.target.checked)} />}
          label="Blocks other work"
          sx={{ minHeight: 40, ml: { xs: 0, sm: 0.25 }, whiteSpace: 'nowrap' }}
        />
      </Stack>

      {filteredRows.length === 0 ? (
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
                {filteredRows.map((deliverable) => (
                  <TableRow key={deliverable.id} hover onClick={() => navigate(`/projects/${deliverable.project_id}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{deliverable.title}</Typography>
                        {deliverable.description && (
                          <Typography variant="caption" color="text.secondary">{deliverable.description}</Typography>
                        )}
                        {(deliverable.blocked_by?.length > 0 || deliverable.blocks_count > 0) && (
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                            {deliverable.blocked_by?.filter((node) => node.status !== 'completed').length > 0 && (
                              <Tooltip title={deliverable.blocked_by.filter((node) => node.status !== 'completed').map((node) => `${node.title} (${node.project_name})`).join(', ')}>
                                <Chip size="small" color="error" variant="outlined"
                                  label={`Blocked by ${deliverable.blocked_by.filter((node) => node.status !== 'completed').length}`} />
                              </Tooltip>
                            )}
                            {deliverable.blocks_count > 0 && (
                              <Tooltip title={deliverable.blocks.map((node) => `${node.title} (${node.project_name})`).join(', ')}>
                                <Chip size="small" color="warning" variant="outlined" label={`Blocks ${deliverable.blocks_count}`} />
                              </Tooltip>
                            )}
                          </Stack>
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
                        {canEditDeliverable(deliverable) && (
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={(event) => { event.stopPropagation(); openDialog(deliverable); }}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isProjectLead(deliverable.project_id) && (
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={(event) => { event.stopPropagation(); setToDelete(deliverable); }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <DeliverableFormDialog open={dialogOpen} initial={toEdit} projectOptions={projectOptions}
        assigneeOptions={assigneeOptions} dependencyOptions={allDeliverables}
        currentUser={user} onClose={closeDialog} onSubmit={saveDeliverable} />
      <ConfirmDialog open={!!toDelete} title="Delete deliverable?" confirmLabel="Delete"
        message={`Delete ${toDelete?.title || 'this deliverable'}?`}
        onClose={() => setToDelete(null)} onConfirm={confirmDelete} />
    </Box>
  );
}
