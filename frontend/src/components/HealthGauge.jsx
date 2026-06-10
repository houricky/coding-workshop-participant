import { Box, Typography, Tooltip } from '@mui/material';
import { rag, ragMeta } from '../theme';
import { clampPercent, percent } from '../utils/format';

// ---------------------------------------------------------------------------
// The signature element of the product.
//
// The whole thesis of the tracker is: "is burn outrunning progress?" This gauge
// shows a single track where the filled bar is BURN (max of budget% / hours%),
// a vertical marker is actual COMPLETION%, and the shaded span between them is
// the PROGRESS GAP that drives RAG. One glance answers the core question.
// ---------------------------------------------------------------------------
export default function HealthGauge({ burn, completion, status, height = 10, showLabels = true }) {
  const b = clampPercent(burn);
  const c = clampPercent(completion);
  const meta = ragMeta[status] || ragMeta.Green;
  const fill = meta.color.main;
  const gapStart = Math.min(b, c);
  const gapWidth = Math.abs(b - c);
  const gapColor = status === 'Green' ? rag.green.main : status === 'Amber' ? rag.amber.main : rag.red.main;

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{
          position: 'relative',
          height,
          borderRadius: height / 2,
          bgcolor: 'rgba(27,42,74,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* burn fill */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            width: `${b}%`,
            bgcolor: fill,
            opacity: 0.9,
            transition: 'width .4s ease',
          }}
        />
        {/* gap band (hatched feel via translucent overlay) */}
        {gapWidth > 0.5 && (
          <Tooltip title={`Progress gap ${percent(Math.abs(burn - completion), 1)}`} arrow>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${gapStart}%`,
                width: `${gapWidth}%`,
                backgroundImage: `repeating-linear-gradient(45deg, ${gapColor}33, ${gapColor}33 3px, transparent 3px, transparent 6px)`,
              }}
            />
          </Tooltip>
        )}
      </Box>

      {/* completion marker line + tick */}
      <Box sx={{ position: 'relative', height: 0 }}>
        <Tooltip title={`Completion ${percent(completion)}`} arrow>
          <Box
            sx={{
              position: 'absolute',
              top: -(height + 4),
              left: `calc(${c}% - 1px)`,
              width: 2,
              height: height + 8,
              bgcolor: '#1A2233',
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
