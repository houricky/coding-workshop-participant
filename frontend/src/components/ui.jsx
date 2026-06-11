import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Button,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { command, glass } from '../theme';

export function EntityAutocomplete({
  label,
  options = [],
  value,
  onChange,
  getOptionLabel = (option) => option?.name || '',
  placeholder = 'Search',
  size = 'small',
  disabled = false,
  allowNone = false,
  noneLabel = 'None',
  fullWidth = true,
}) {
  const normalizedOptions = allowNone ? [{ id: '', name: noneLabel }, ...options] : options;
  const selected = value
    ? normalizedOptions.find((option) => String(option.id) === String(value)) || null
    : null;
  const selectedLabel = selected ? getOptionLabel(selected) : '';
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (selected) {
      setInputValue(selectedLabel);
      setIsTyping(false);
    } else if (!value && !isTyping) {
      setInputValue('');
    }
  }, [isTyping, selected, selectedLabel, value]);

  return (
    <Autocomplete
      size={size}
      options={normalizedOptions}
      value={selected}
      inputValue={inputValue}
      disabled={disabled}
      fullWidth={fullWidth}
      autoHighlight
      clearOnEscape
      openOnFocus
      selectOnFocus
      handleHomeEndKeys
      isOptionEqualToValue={(option, selectedOption) => String(option.id) === String(selectedOption.id)}
      getOptionLabel={(option) => getOptionLabel(option)}
      onChange={(_, option) => {
        onChange(option?.id || '');
        setInputValue(option ? getOptionLabel(option) : '');
        setIsTyping(false);
      }}
      onInputChange={(_, newInputValue, reason) => {
        setInputValue(newInputValue);
        if (reason === 'clear') {
          onChange('');
          setIsTyping(false);
        }
        if (reason === 'input' && selected && newInputValue !== selectedLabel) {
          setIsTyping(true);
          onChange('');
        }
        if (reason === 'input' && !selected) {
          setIsTyping(true);
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selected ? placeholder : allowNone ? noneLabel : placeholder}
          inputProps={{
            ...params.inputProps,
            autoComplete: 'new-password',
          }}
        />
      )}
    />
  );
}

export function StatCard({ label, value, sub, accent = command.teal, icon }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          {icon && (
            <Box
              sx={{
                color: accent,
                display: 'grid',
                placeItems: 'center',
                width: 36,
                height: 36,
                borderRadius: 2,
                ...glass.inset,
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>
        <Typography variant="h4" className="tnum" sx={{ mt: 0.5, color: accent, lineHeight: 1.08 }}>
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
        border: '1px dashed rgba(125,249,255,0.24)',
        borderRadius: 2,
        ...glass.inset,
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
