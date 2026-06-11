import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LoadingState } from '../components/ui';
import RagChip from '../components/RagChip';
import { dashboard, apiErrorMessage } from '../services/api';
import { money, hours, percent, clampPercent, initials } from '../utils/format';
import { command, glass, rag } from '../theme';

const RAG_COLORS = { Green: rag.green.main, Amber: rag.amber.main, Red: rag.red.main };
const GRID = 'rgba(148,163,184,0.13)';
const SUBTLE_FILL = 'rgba(148,163,184,0.18)';
const CHART_CURSOR_FILL = 'rgba(125,211,252,0.05)';
const RAG_PRIORITY = { Red: 3, Amber: 2, Green: 1 };

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const pctOf = (used, allocated) => {
  const total = safeNumber(allocated);
  return total > 0 ? (safeNumber(used) / total) * 100 : 0;
};

const shortName = (name = '', max = 16) => {
  const text = String(name);
  return text.length > max ? `${text.slice(0, max - 2)}...` : text;
};

const urgencyScore = (project) =>
  ((RAG_PRIORITY[project.rag_status] || 0) * 1000)
  + (safeNumber(project.progress_gap) * 10)
  + safeNumber(project.burn_percent);

function ChartTooltip({ active, payload, label, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  const tooltipLabel = payload[0]?.payload?.fullName || label || payload[0]?.name;
  return (
    <Box sx={{ px: 1.25, py: 1, borderRadius: 2, ...glass.panel }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{tooltipLabel}</Typography>
      {payload.map((item) => (
        <Stack key={item.dataKey || item.name} direction="row" spacing={1.5} justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">{item.name}</Typography>
          <Typography variant="caption" className="tnum" sx={{ fontWeight: 700 }}>
            {valueFormatter(item.value, item)}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

function KpiCard({ label, value, sub, icon, onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { borderColor: 'rgba(125,211,252,0.28)', bgcolor: 'rgba(18,29,51,0.82)' } : undefined,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" noWrap sx={{ lineHeight: 1.4, display: 'block' }}>{label}</Typography>
            <Typography variant="h5" className="tnum" sx={{ mt: 0.25, color: 'text.primary', lineHeight: 1.1 }}>
              {value}
            </Typography>
          </Box>
          <Box sx={{ width: 32, height: 32, borderRadius: 2, display: 'grid', placeItems: 'center', color: command.teal2, flexShrink: 0, ...glass.inset }}>
            {icon}
          </Box>
        </Stack>
        {sub && (
          <Typography variant="caption" color="text.secondary" className="tnum" noWrap sx={{ mt: 0.75, display: 'block' }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function TeamRing({ member, onClick }) {
  const size = 54;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = clampPercent(member.utilization_percent);
  const color = member.overallocated ? rag.red.main : pct > 85 ? rag.amber.main : command.teal2;
  return (
    <Stack
      spacing={0.75}
      alignItems="center"
      onClick={onClick}
      sx={{ cursor: 'pointer', minWidth: 80 }}
    >
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(148,163,184,0.18)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (pct / 100) * circumference}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <Avatar sx={{ position: 'absolute', inset: 7, width: 40, height: 40, fontSize: 13 }}>
          {initials(member.name)}
        </Avatar>
      </Box>
      <Typography variant="caption" sx={{ maxWidth: 80, textAlign: 'center' }} noWrap>{member.name}</Typography>
      <Typography variant="caption" className="tnum" color="text.secondary">{percent(pct)}</Typography>
    </Stack>
  );
}

function RunwayBars({ projects, onProject }) {
  return (
    // Fill the available card height: rows distribute evenly when there's room and
    // only scroll on extremely short viewports (each row keeps a readable minimum).
    <Stack
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        justifyContent: 'space-between',
        gap: 1,
        pb: 2,
      }}
    >
      {projects.map((p) => {
        const burn = clampPercent(p.burn_percent);
        const done = clampPercent(p.completion_percent);
        const color = RAG_COLORS[p.rag_status] || command.teal2;
        return (
          <Box
            key={p.id}
            onClick={() => onProject(p.id)}
            sx={{ cursor: 'pointer', flexShrink: 0, '&:hover .runway-track': { borderColor: 'rgba(125,211,252,0.28)' } }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <RagChip status={p.rag_status} />
                <Typography variant="body2" noWrap>{p.fullName}</Typography>
              </Stack>
              <Typography variant="caption" className="tnum" color="text.secondary">{percent(burn)} burn</Typography>
            </Stack>
            <Box className="runway-track" sx={{ position: 'relative', height: 10, borderRadius: 5, bgcolor: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.12)', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', inset: 0, width: `${burn}%`, bgcolor: color, opacity: 0.82 }} />
              <Box sx={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${done}% - 1px)`, width: 2, bgcolor: 'rgba(229,238,249,0.9)' }} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

function ProjectComparisonChart({ eyebrow, title, note, data, series, valueFormatter, onProject }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', pb: '8px !important' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.5} sx={{ mb: 1 }}>
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>{eyebrow}</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
          </Box>
          {note && (
            <Typography variant="caption" color="text.secondary" className="tnum">
              {note}
            </Typography>
          )}
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              onClick={(state) => onProject(state?.activePayload?.[0]?.payload?.id)}
              margin={{ top: 6, right: 24, left: 6, bottom: 4 }}
              barGap={2}
              barCategoryGap={10}
            >
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${Math.round(v)}%`}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: command.muted, fontSize: 12 }}
              />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={128}
                tickMargin={10}
                tick={{ fill: command.muted, fontSize: 12 }}
              />
              <RTooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ fill: CHART_CURSOR_FILL }} />
              <Legend verticalAlign="bottom" height={22} wrapperStyle={{ fontSize: 12 }} />
              {series.map((item) => (
                <Bar
                  key={item.dataKey}
                  dataKey={item.dataKey}
                  name={item.name}
                  fill={item.fill}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeRag, setActiveRag] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    dashboard.get().then(setData).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const ragBreakdown = data.active_rag_breakdown || data.rag_breakdown || {};
    const rawProjects = Array.isArray(data.project_burn) ? data.project_burn : [];
    const projectBurn = rawProjects.map((project) => {
      const budgetUsed = safeNumber(project.budget_used);
      const budgetRemaining = safeNumber(project.budget_remaining);
      const budgetUsedPercent = safeNumber(project.budget_used_percent) || pctOf(budgetUsed, budgetUsed + budgetRemaining);

      return {
        ...project,
        fullName: project.name,
        name: shortName(project.name, 15),
        budget_used: budgetUsed,
        budget_remaining: budgetRemaining,
        budget_used_percent: clampPercent(budgetUsedPercent),
        budget_remaining_percent: clampPercent(100 - budgetUsedPercent),
        burn_percent: safeNumber(project.burn_percent),
        completion_percent: safeNumber(project.completion_percent),
        progress_gap: safeNumber(project.progress_gap),
      };
    });
    const relevantProjects = [...projectBurn]
      .sort((a, b) => urgencyScore(b) - urgencyScore(a) || a.fullName.localeCompare(b.fullName))
      .slice(0, 5);
    const budgetPct = safeNumber(data.budget_used_percent) || pctOf(data.total_budget_used, data.total_allocated_budget);
    const hoursPct = safeNumber(data.hours_used_percent) || pctOf(data.total_hours_used, data.total_allocated_hours);
    const deliverablePct = pctOf(data.completed_deliverables, data.total_deliverables);
    const teamUtilization = (data.team_utilization || []).slice(0, 6);
    const utilizationAvg = teamUtilization.length
      ? teamUtilization.reduce((sum, e) => sum + safeNumber(e.utilization_percent), 0) / teamUtilization.length
      : 0;

    return {
      ragBreakdown,
      ragRing: Object.entries(ragBreakdown).map(([name, value]) => ({ name, value: safeNumber(value) })),
      topProjects: relevantProjects,
      comparisonProjects: relevantProjects,
      budgetPct,
      hoursPct,
      deliverablePct,
      teamUtilization,
      utilizationAvg,
    };
  }, [data]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data || !view) return <LoadingState label="Loading dashboard" />;

  const drillProject = (projectId) => projectId && navigate(`/projects/${projectId}`);

  const kpis = [
    {
      label: 'Active projects',
      value: safeNumber(data.active_project_count),
      sub: `${safeNumber(view.ragBreakdown.Red)} red / ${safeNumber(view.ragBreakdown.Amber)} amber`,
      icon: <FolderOutlinedIcon fontSize="small" />,
      onClick: () => navigate('/projects'),
    },
    {
      label: 'Budget burn',
      value: money(data.total_budget_used),
      sub: `${percent(view.budgetPct)} of ${money(data.total_allocated_budget)}`,
      icon: <AccountBalanceWalletOutlinedIcon fontSize="small" />,
      onClick: () => navigate('/projects'),
    },
    {
      label: 'Hours logged',
      value: hours(data.total_hours_used),
      sub: `${percent(view.hoursPct)} of ${hours(data.total_allocated_hours)}`,
      icon: <ScheduleOutlinedIcon fontSize="small" />,
      onClick: () => navigate('/usage'),
    },
    {
      label: 'Deliverables',
      value: safeNumber(data.total_deliverables),
      sub: `${safeNumber(data.completed_deliverables)} done / ${safeNumber(data.unassigned_deliverables)} unassigned`,
      icon: <AssignmentOutlinedIcon fontSize="small" />,
      onClick: () => navigate('/deliverables'),
    },
    {
      label: 'Stalled deliverables',
      value: safeNumber(data.stalled_deliverables),
      sub: `${safeNumber(data.stalls_impacting_other_projects)} blocking other projects`,
      icon: <BlockOutlinedIcon fontSize="small" />,
      onClick: () => navigate('/deliverables'),
    },
  ];

  const impactedProjects = data.impacted_projects || [];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: { md: 'calc(100vh - 112px)' },
        overflow: { md: 'hidden' },
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h5">Operations dashboard</Typography>
        <Typography variant="body2" color="text.secondary">
          Portfolio health, project pressure, delivery runway, and team capacity.
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ flexShrink: 0 }}>
        {kpis.map((kpi) => (
          <Grid item xs={6} sm={4} md={2.4} key={kpi.label}>
            <KpiCard {...kpi} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Row A: health distribution + the two comparison charts */}
        <Box sx={{ flex: 1, minHeight: { xs: 280, md: 0 }, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 280, md: 0 } }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', pb: '8px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>RAG distribution</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Active project health</Typography>
                  </Box>
                  {activeRag && <RagChip status={activeRag} withLabel />}
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0, cursor: 'pointer' }} onClick={() => navigate('/projects')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={view.ragRing}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={3}
                        isAnimationActive={false}
                        onMouseEnter={(entry) => setActiveRag(entry.name)}
                        onMouseLeave={() => setActiveRag(null)}
                        onClick={(entry) => {
                          setActiveRag(entry.name);
                          navigate('/projects');
                        }}
                      >
                        {view.ragRing.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={RAG_COLORS[entry.name] || command.teal2}
                            opacity={!activeRag || activeRag === entry.name ? 1 : 0.5}
                            stroke="rgba(15,23,41,0.82)"
                            strokeWidth={3}
                          />
                        ))}
                      </Pie>
                      <RTooltip content={<ChartTooltip />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 280, md: 0 } }}>
            <ProjectComparisonChart
              eyebrow="Burn vs completion"
              title="Project pressure"
              data={view.comparisonProjects}
              onProject={drillProject}
              valueFormatter={(v) => percent(v)}
              series={[
                { dataKey: 'burn_percent', name: 'Burn', fill: rag.red.main },
                { dataKey: 'completion_percent', name: 'Completion', fill: command.teal2 },
              ]}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 280, md: 0 } }}>
            <ProjectComparisonChart
              eyebrow="Budget runway"
              title="Capital allocation"
              note={`Remaining ${money(data.total_budget_remaining)}`}
              data={view.topProjects}
              onProject={drillProject}
              valueFormatter={(v, item) => {
                if (item.dataKey === 'budget_used_percent') return `${percent(v)} (${money(item.payload.budget_used)})`;
                if (item.dataKey === 'budget_remaining_percent') return `${percent(v)} (${money(item.payload.budget_remaining)})`;
                return percent(v);
              }}
              series={[
                { dataKey: 'budget_used_percent', name: 'Used', fill: command.teal2 },
                { dataKey: 'budget_remaining_percent', name: 'Remaining', fill: SUBTLE_FILL },
              ]}
            />
          </Box>
        </Box>

        {/* Row B: team load + project runway + cross-project blockers */}
        <Box sx={{ flex: 1, minHeight: { xs: 280, md: 0 }, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 240, md: 0 } }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', pb: '8px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>Team load</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Utilization</Typography>
                  </Box>
                  <Typography className="tnum" sx={{ color: 'text.primary', fontWeight: 700 }}>
                    {percent(view.utilizationAvg)}
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 1.5,
                    alignContent: 'flex-start',
                  }}
                >
                  {view.teamUtilization.map((member) => (
                    <TeamRing key={member.id} member={member} onClick={() => navigate(`/employees/${member.id}`)} />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 240, md: 0 } }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', pb: '20px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>Project runway</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Health bars</Typography>
                  </Box>
                  <PeopleOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <RunwayBars projects={view.topProjects} onProject={drillProject} />
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, minHeight: { xs: 240, md: 0 } }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', pb: '8px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>Cross-project blockers</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Stalls impacting others</Typography>
                  </Box>
                  <BlockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {impactedProjects.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No deliverables are blocking other projects.
                    </Typography>
                  ) : (
                    <Stack spacing={0.75}>
                      {impactedProjects.map((project) => (
                        <Stack
                          key={project.id}
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                          sx={{ cursor: 'pointer', p: 0.75, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
                          onClick={() => drillProject(project.id)}
                        >
                          <RagChip status={project.rag_status} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{project.name}</Typography>
                          <Typography variant="caption" color="text.secondary" className="tnum">
                            {safeNumber(project.blocked_deliverable_count)} blocked
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
