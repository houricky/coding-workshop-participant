import { useCallback, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { ai, apiErrorMessage } from '../services/api';

const PRIORITY_COLOR = { high: 'error', medium: 'warning', low: 'default' };

export default function ProjectInsightCard({ projectId }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    ai.explainProject(projectId)
      .then((res) => setInsight(res.insight))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <Card sx={{ mt: 2.5 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
            <Typography variant="overline" color="text.secondary">AI health insight</Typography>
          </Stack>
          {insight && (
            <Button size="small" startIcon={<RefreshOutlinedIcon />} onClick={load} disabled={loading}>
              Refresh
            </Button>
          )}
        </Stack>

        {!insight && !loading && !error && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Get a plain-language explanation of why this project is at its current health status, with recommended next steps.
            </Typography>
            <Button variant="outlined" size="small" startIcon={<AutoAwesomeOutlinedIcon />} onClick={load}>
              Generate insight
            </Button>
          </Box>
        )}

        {loading && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">Analyzing project data…</Typography>
          </Stack>
        )}

        {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}

        {insight && !loading && (
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>{insight.headline}</Typography>
            {insight.why?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Why</Typography>
                {insight.why.map((item) => (
                  <Typography key={item} variant="body2" sx={{ mb: 0.5 }}>• {item}</Typography>
                ))}
              </Box>
            )}
            {insight.risks?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Risks</Typography>
                {insight.risks.map((item) => (
                  <Typography key={item} variant="body2" color="error.main" sx={{ mb: 0.5 }}>• {item}</Typography>
                ))}
              </Box>
            )}
            {insight.actions?.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">Recommended actions</Typography>
                {insight.actions.map((action) => (
                  <Stack key={action.text} direction="row" spacing={1} alignItems="flex-start">
                    <Chip size="small" label={action.priority} color={PRIORITY_COLOR[action.priority] || 'default'} />
                    <Typography variant="body2">{action.text}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
