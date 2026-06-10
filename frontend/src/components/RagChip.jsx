import { Chip } from '@mui/material';
import { ragMeta } from '../theme';

// One canonical RAG badge so status reads identically across every screen.
export default function RagChip({ status, withLabel = false, size = 'small' }) {
  const meta = ragMeta[status] || ragMeta.Green;
  const { color } = meta;
  return (
    <Chip
      size={size}
      label={withLabel ? `${status} · ${meta.label}` : status}
      sx={{
        bgcolor: color.soft,
        color: color.text,
        fontWeight: 700,
        borderRadius: 1,
        letterSpacing: '0.01em',
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}
