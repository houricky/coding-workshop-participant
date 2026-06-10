import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';

export function StatCard({ label, value, sub, accent = '#1B2A4A', icon }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          {icon && <Box sx={{ color: accent, display: 'flex' }}>{icon}</Box>}
        </Stack>
        <Typography variant="h4" className="tnum" sx={{ mt: 0.5, color: accent }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} className="tnum">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 8,
        px: 2,
        border: '1px dashed rgba(27,42,74,0.2)',
        borderRadius: 2,
        bgcolor: '#FBFBFC',
      }}
    >
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 420, mx: 'auto' }}>
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}

export function LoadingState({ label = 'Loading' }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 10 }}>
      <CircularProgress size={28} />
      <Typography variant="body2" color="text.secondary">
        {label}…
      </Typography>
    </Box>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose, danger = true }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color={danger ? 'error' : 'primary'}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
