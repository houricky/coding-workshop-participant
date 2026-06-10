import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, CardContent, Typography, Box, Stack, Alert, LinearProgress, Divider } from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { PageHeader, StatCard, LoadingState } from '../components/ui';
import RagChip from '../components/RagChip';
import HealthGauge from '../components/HealthGauge';
import { dashboard, apiErrorMessage } from '../services/api';
import { money, hours, percent, clampPercent } from '../utils/format';
import { rag } from '../theme';

const RAG_COLORS = { Green: rag.green.main, Amber: rag.amber.main, Red: rag.red.main };
const ACTIVE_STAGES = new Set(['active', 'in progress']);

function isActiveProject(project) {
  return ACTIVE_STAGES.has(String(project?.stage || '').toLowerCase());
}

function countActiveProjects(projects = []) {
  return projects.filter(isActiveProject).length;
}

function activeRagBreakdownFromProjects(projects = []) {
  return projects.filter(isActiveProject).reduce((acc, project) => {
    const status = project.rag_status || 'Green';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { Green: 0, Amber: 0, Red: 0 });
}

function BurnBar({ label, used, allocated, formatter }) {
  const pct = allocated > 0 ? (used / allocated) * 100 : 0;
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="body2" className="tnum">
          {formatter(used)} <Box component="span" sx={{ color: 'text.disabled' }}>/ {formatter(allocated)}</Box>
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={clampPercent(pct)}
        sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(27,42,74,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: pct > 90 ? rag.red.main : pct > 75 ? rag.amber.main : 'primary.main' } }}
      />
      <Typography variant="caption" color="text.secondary" className="tnum">{percent(pct)} consumed</Typography>
    </Box>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    dashboard.get().then(setData).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <LoadingState label="Building your portfolio view" />;

  const pieData = Object.entries(data.rag_breakdown).map(([name, value]) => ({ name, value }));
  const hasProjectRows = Array.isArray(data.projects);
  const activeRagBreakdown = hasProjectRows
    ? activeRagBreakdownFromProjects(data.projects)
    : data.active_rag_breakdown || data.rag_breakdown;
  const activeProjectCount = hasProjectRows
    ? countActiveProjects(data.projects)
    : data.active_project_count ?? data.project_count ?? 0;

  return (
    <Box>
      <PageHeader title="Portfolio dashboard" subtitle="Project health across the whole portfolio, at a glance." />

      <Grid container spacing={2.5}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Active projects" value={activeProjectCount}
            sub={`${activeRagBreakdown.Red} at risk · ${activeRagBreakdown.Amber} to watch`}
            icon={<FolderOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Budget used" value={money(data.total_budget_used)}
            sub={`of ${money(data.total_allocated_budget)} allocated`}
            accent={rag.amber.main} icon={<AccountBalanceWalletOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Hours logged" value={hours(data.total_hours_used)}
            sub={`of ${hours(data.total_allocated_hours)} allocated`}
            accent={rag.green.main} icon={<ScheduleOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Overallocated people" value={data.overallocated_employees}
            sub="above planned capacity" accent={rag.red.main} icon={<WarningAmberOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Deliverables" value={data.total_deliverables ?? 0}
            sub={`${data.completed_deliverables ?? 0} complete · ${data.unassigned_deliverables ?? 0} need owner`}
            icon={<AssignmentOutlinedIcon />} />
        </Grid>

        {/* RAG breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Health breakdown</Typography>
              <Box sx={{ height: 200, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                      {pieData.map((entry) => <Cell key={entry.name} fill={RAG_COLORS[entry.name]} />)}
                    </Pie>
                    <RTooltip />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Burn vs allocation */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Portfolio burn</Typography>
              <Box sx={{ mt: 2 }}>
                <BurnBar label="Budget" used={data.total_budget_used} allocated={data.total_allocated_budget} formatter={money} />
                <BurnBar label="Resource hours" used={data.total_hours_used} allocated={data.total_allocated_hours} formatter={hours} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* At-risk projects */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="overline" color="text.secondary">Needs attention</Typography>
                <Typography variant="caption" color="text.secondary">Burn outrunning completion</Typography>
              </Stack>
              {data.at_risk_projects.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  Nothing in the red right now. Every project is tracking within tolerance.
                </Typography>
              ) : (
                data.at_risk_projects.map((p, i) => (
                  <Box key={p.id}>
                    {i > 0 && <Divider sx={{ my: 1.5 }} />}
                    <Box
                      onClick={() => navigate(`/projects/${p.id}`)}
                      sx={{ cursor: 'pointer', borderRadius: 1.5, p: 1, mx: -1, '&:hover': { bgcolor: 'rgba(27,42,74,0.04)' } }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <RagChip status={p.rag_status} />
                          <Typography variant="subtitle2">{p.name}</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" className="tnum">
                          {p.progress_gap}-pt gap
                        </Typography>
                      </Stack>
                      <HealthGauge burn={p.burn_percent} completion={p.actual_completion_percent} status={p.rag_status} />
                    </Box>
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
