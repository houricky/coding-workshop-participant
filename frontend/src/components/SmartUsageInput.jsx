import { useState } from 'react';
import {
  Alert, Box, Button, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { ai, apiErrorMessage } from '../services/api';

export default function SmartUsageInput({ onParsed }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parse = async () => {
    const entry = text.trim();
    if (!entry || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await ai.parseUsage(entry);
      onParsed(res.parsed);
      setText('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(27,42,74,0.04)', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Quick log with AI
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          size="small" fullWidth
          placeholder='e.g. "6h on API work for Phoenix yesterday"'
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); parse(); } }}
          disabled={loading}
        />
        <Button
          variant="outlined" startIcon={<AutoAwesomeOutlinedIcon />}
          onClick={parse} disabled={loading || !text.trim()}
          sx={{ whiteSpace: 'nowrap', minWidth: 120 }}
        >
          {loading ? 'Parsing…' : 'Parse'}
        </Button>
      </Stack>
      {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}
