import { Box, Typography, Tooltip } from '@mui/material';
import { rag, ragMeta } from '../theme';
import { clampPercent, percent } from '../utils/format';

export default function HealthGauge({ burn, completion, status, height = 10, showLabels = true }) {
  const b = clampPercent(burn);
  const c = clampPercent(completion);
  const meta = ragMeta[status] || ragMeta.Green;
  const fill = meta.color.main;
  const gapStart = Math.min(b, c);
  const gapWidth = Math.abs(b - c);
  const gapColor = status === 'Red' ? rag.red.main : status === 'Amber' ? rag.amber.main : rag.green.main;

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{
          position: 'relative',
          height,
          borderRadius: height / 2,
          bgcolor: 'rgba(148,163,184,0.14)',
          overflow: 'hidden',
          border: '1px solid rgba(148,163,184,0.10)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${b}%`,
            bgcolor: fill,
            opacity: 0.82,
          }}
        />
        {gapWidth > 0.5 && (
          <Tooltip title={`Progress gap ${percent(Math.abs(burn - completion), 1)}`} arrow>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${gapStart}%`,
                width: `${gapWidth}%`,
                backgroundImage: `repeating-linear-gradient(45deg, ${gapColor}44, ${gapColor}44 3px, transparent 3px, transparent 6px)`,
              }}
            />
          </Tooltip>
        )}
      </Box>

      <Box sx={{ position: 'relative', height: 0 }}>
        <Tooltip title={`Completion ${percent(completion)}`} arrow>
          <Box
            sx={{
              position: 'absolute',
              top: -(height + 4),
              left: `calc(${c}% - 1px)`,
              width: 2,
              height: height + 8,
              bgcolor: 'rgba(229,238,249,0.92)',
              borderRadius: 1,
            }}
          />
        </Tooltip>
      </Box>

      {showLabels && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
          <Typography variant="caption" color="text.secondary" className="tnum">
            Burn {percent(burn)}
          </Typography>
          <Typography variant="caption" color="text.secondary" className="tnum">
            Done {percent(completion)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
