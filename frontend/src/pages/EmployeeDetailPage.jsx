import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Button, Avatar, Chip, Alert,
  Table, TableHead, TableBody, TableRow, TableCell, LinearProgress, Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PageHeader, LoadingState } from '../components/ui';
import RagChip from '../components/RagChip';
import { employees as employeesApi, apiErrorMessage } from '../services/api';
import { money, hours, initials, percent, clampPercent, formatDate } from '../utils/format';
import { rag } from '../theme';

const roleLabel = (role) => ({ admin: 'Admin', manager: 'Manager', employee: 'Employee' }[role] || role || 'Employee');
const projectRoleLabel = (role) => ({ manager: 'Manager', employee: 'Employee' }[role] || 'Employee');
const staffLabel = (type) => (type === 'non_direct' ? 'Non-direct' : 'Direct');
const locationLabel = (location) => (location === 'on_site' ? 'On-site' : 'Remote');
const deliverableStatusLabel = (status) => ({ pending: 'Pending', in_progress: 'In progress', completed: 'Completed' }[status] || status || 'Pending');
const deliverableStatusColor = (status) => ({ completed: 'success', in_progress: 'warning', pending: 'default' }[status] || 'default');

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [e, setE] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    employeesApi.get(id).then(setE).catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!e) return <LoadingState label="Loading employee" />;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/employees')} sx={{ mb: 1, ml: -1 }} color="inherit">
        Employees
      </Button>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack alignItems="center" spacing={1.5} sx={{ py: 1 }}>
                <Avatar sx={{ width: 72, height: 72, fontSize: 26, bgcolor: 'primary.main' }}>{initials(e.name)}</Avatar>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6">{e.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{e.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{e.email}</Typography>
                </Box>
                {e.overallocated && <Chip size="small" label="Overallocated" sx={{ bgcolor: rag.red.soft, color: rag.red.text }} />}
              </Stack>
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Role</Typography><Typography variant="body2">{roleLabel(e.role)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Staff</Typography><Typography variant="body2">{staffLabel(e.staff_type)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Location</Typography><Typography variant="body2">{locationLabel(e.location)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Rate</Typography><Typography variant="body2" className="tnum">{money(e.hourly_rate)}/h</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Capacity</Typography><Typography variant="body2" className="tnum">{hours(e.capacity_hours)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Allocated</Typography><Typography variant="body2" className="tnum">{hours(e.allocated_hours)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">Logged</Typography><Typography variant="body2" className="tnum">{hours(e.hours_used)}</Typography></Stack>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Utilization</Typography>
                  <LinearProgress variant="determinate" value={clampPercent(e.utilization_percent)}
                    sx={{ height: 8, borderRadius: 4, mt: 0.5, '& .MuiLinearProgress-bar': { bgcolor: e.overallocated ? rag.red.main : 'primary.main' } }} />
                  <Typography variant="caption" className="tnum">{percent(e.utilization_percent)} of capacity</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Project allocations</Typography>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Project</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Allocated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {e.allocations.length === 0 && (
                    <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Not allocated to any project.</Typography></TableCell></TableRow>
                  )}
                  {e.allocations.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell>
                        <Link component="button" underline="hover" onClick={() => navigate(`/projects/${a.project_id}`)}>
                          {a.project?.name}
                        </Link>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{projectRoleLabel(a.role_on_project)}</Typography></TableCell>
                      <TableCell>{a.project && <RagChip status={a.project.rag_status} />}</TableCell>
                      <TableCell align="right" className="tnum">{hours(a.allocated_hours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Deliverables</Typography>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Deliverable</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Due date</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(e.deliverables || []).length === 0 && (
                    <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No assigned deliverables.</Typography></TableCell></TableRow>
                  )}
                  {(e.deliverables || []).map((deliverable) => (
                    <TableRow key={deliverable.id} hover>
                      <TableCell>{deliverable.title}</TableCell>
                      <TableCell>
                        <Link component="button" underline="hover" onClick={() => navigate(`/projects/${deliverable.project_id}`)}>
                          {deliverable.project?.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tnum">{formatDate(deliverable.due_date)}</TableCell>
                      <TableCell>
                        <Chip size="small" color={deliverableStatusColor(deliverable.status)}
                          label={deliverableStatusLabel(deliverable.status)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
