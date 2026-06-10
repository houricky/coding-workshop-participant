import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Stack, Button, Chip, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, Avatar, Alert, IconButton, Tooltip, LinearProgress, Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import { PageHeader, LoadingState } from '../components/ui';
import RagChip from '../components/RagChip';
import HealthGauge from '../components/HealthGauge';
import ProjectFormDialog from '../components/ProjectFormDialog';
import { employees as employeesApi, projects as projectsApi, apiErrorMessage } from '../services/api';
import { money, hours, percent, formatDate, initials, clampPercent } from '../utils/format';
import { ragMeta } from '../theme';

const projectRoleLabel = (role) => ({ manager: 'Manager', employee: 'Employee' }[role] || 'Employee');

function MetricRow({ label, used, allocated, formatter, accentOver = 90 }) {
  const pct = allocated > 0 ? (used / allocated) * 100 : 0;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="body2" className="tnum">
          {formatter(used)} <Box component="span" sx={{ color: 'text.disabled' }}>/ {formatter(allocated)}</Box>
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={clampPercent(pct)}
        sx={{ height: 8, borderRadius: 4 }} color={pct > accentOver ? 'error' : pct > 75 ? 'warning' : 'primary'} />
      <Typography variant="caption" color="text.secondary" className="tnum">{percent(pct)} consumed</Typography>
    </Box>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    setError('');
    Promise.all([projectsApi.get(id), employeesApi.list()])
      .then(([project, employeeRows]) => { setP(project); setEmployees(employeeRows); })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!p) return <LoadingState label="Loading project" />;
  const managerOptions = employees.filter((e) => e.role === 'manager');

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/projects')} sx={{ mb: 1, ml: -1 }} color="inherit">
        Projects
      </Button>
      <PageHeader
        title={p.name}
        subtitle={p.description}
        action={
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
            Edit project
          </Button>
        }
      />

      <Grid container spacing={2.5}>
        {/* Health summary */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="overline" color="text.secondary">Project health</Typography>
                <RagChip status={p.rag_status} withLabel />
              </Stack>
              <HealthGauge burn={p.burn_percent} completion={p.actual_completion_percent} status={p.rag_status} height={12} />
              <Box sx={{ mt: 2, p: 1.5, bgcolor: ragMeta[p.rag_status].color.soft, borderRadius: 1.5 }}>
                <Typography variant="body2" sx={{ color: ragMeta[p.rag_status].color.text }} className="tnum">
                  Burn is at {percent(p.burn_percent)} while completion is {percent(p.actual_completion_percent)} —
                  a {p.progress_gap}-point gap.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={p.stage} />
                <Chip size="small" variant="outlined" label={`Lead: ${p.project_manager?.name || managerOptions.find((m) => m.id === p.project_manager_id)?.name || 'Unassigned'}`} />
                <Chip size="small" variant="outlined" label={`${formatDate(p.start_date)} → ${formatDate(p.end_date)}`} />
                <Chip size="small" variant="outlined" label={`${p.team_size} people`} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Budget & hours */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Budget & resource burn</Typography>
              <Box sx={{ mt: 2 }}>
                <MetricRow label="Budget" used={p.budget_used} allocated={p.allocated_budget} formatter={money} />
                <MetricRow label="Resource hours" used={p.hours_used} allocated={p.allocated_hours} formatter={hours} />
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Allocated cost (planned)</Typography>
                    <Typography variant="h6" className="tnum">{money(p.allocated_cost)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Completion</Typography>
                    <Typography variant="h6" className="tnum">{percent(p.actual_completion_percent)}</Typography>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Team allocations */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Team & allocations</Typography>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Member</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Allocated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {p.allocations.length === 0 && (
                    <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">No one is allocated yet.</Typography></TableCell></TableRow>
                  )}
                  {p.allocations.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'primary.light' }}>{initials(a.employee?.name)}</Avatar>
                          <Link component="button" underline="hover" onClick={() => navigate(`/employees/${a.employee_id}`)} sx={{ textAlign: 'left' }}>
                            {a.employee?.name}
                          </Link>
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{projectRoleLabel(a.role_on_project)}</Typography></TableCell>
                      <TableCell align="right" className="tnum">{hours(a.allocated_hours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate('/allocations')}>Manage allocations</Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Dependencies + recent usage */}
        <Grid item xs={12} md={5}>
          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Dependencies</Typography>
              {p.dependencies.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No upstream dependencies.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {p.dependencies.map((d) => (
                    <Stack key={d.id} direction="row" spacing={1} alignItems="center"
                      sx={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${d.depends_on_project_id}`)}>
                      <LinkOutlinedIcon fontSize="small" color="action" />
                      <Typography variant="body2" sx={{ flex: 1 }}>{d.depends_on?.name}</Typography>
                      <RagChip status={d.depends_on?.rag_status} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Recent usage</Typography>
              {p.usage.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No hours logged yet.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {p.usage.slice(-5).reverse().map((u) => (
                    <Stack key={u.id} direction="row" justifyContent="space-between">
                      <Typography variant="body2">{u.employee?.name}</Typography>
                      <Typography variant="body2" color="text.secondary" className="tnum">{hours(u.hours_used)} · {formatDate(u.logged_on)}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <ProjectFormDialog open={editOpen} initial={p} managerOptions={managerOptions} onClose={() => setEditOpen(false)}
        onSubmit={async (payload) => { await projectsApi.update(p.id, payload); load(); }} />
    </Box>
  );
}
