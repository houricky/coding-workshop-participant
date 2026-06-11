import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { ai, apiErrorMessage } from '../services/api';

const SUGGESTIONS = [
  'Summarize portfolio health',
  'Which projects are at risk?',
  'Who is overallocated?',
];

export default function AiCopilotPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const send = async (text) => {
    const message = (text || input).trim();
    if (!message || loading) return;
    setInput('');
    setError('');
    const userTurn = { role: 'user', content: message };
    setHistory((h) => [...h, userTurn]);
    setLoading(true);
    try {
      const prior = history.slice(-4);
      const res = await ai.chat(message, prior);
      setHistory((h) => [...h, { role: 'assistant', content: res.answer, sources: res.sources }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (e) {
      setError(apiErrorMessage(e));
      setHistory((h) => h.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        startIcon={<AutoAwesomeOutlinedIcon />}
        onClick={() => setOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1200, borderRadius: 3, boxShadow: 4 }}
      >
        Portfolio copilot
      </Button>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, display: 'flex', flexDirection: 'column' } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeOutlinedIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>Portfolio copilot</Typography>
          </Stack>
          <IconButton onClick={() => setOpen(false)} size="small"><CloseIcon /></IconButton>
        </Stack>

        <Box ref={scrollRef} sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {history.length === 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Ask about portfolio health, at-risk projects, or overallocation — answers are grounded in live data.
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} variant="outlined" size="small" onClick={() => send(s)} sx={{ cursor: 'pointer' }} />
                ))}
              </Stack>
            </Box>
          )}

          {history.map((turn, i) => (
            <Box key={i} sx={{ mb: 2, textAlign: turn.role === 'user' ? 'right' : 'left' }}>
              <Box sx={{
                display: 'inline-block', maxWidth: '90%', p: 1.5, borderRadius: 2, textAlign: 'left',
                bgcolor: turn.role === 'user' ? 'primary.main' : 'rgba(27,42,74,0.06)',
                color: turn.role === 'user' ? 'primary.contrastText' : 'text.primary',
              }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{turn.content}</Typography>
                {turn.sources?.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                    {turn.sources.map((s) => <Chip key={s} label={s} size="small" variant="outlined" />)}
                  </Stack>
                )}
              </Box>
            </Box>
          ))}

          {loading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">Thinking…</Typography>
            </Stack>
          )}

          {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        </Box>

        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small" fullWidth placeholder="Ask about the portfolio…"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={loading}
            />
            <IconButton color="primary" onClick={() => send()} disabled={loading || !input.trim()}>
              <SendOutlinedIcon />
            </IconButton>
          </Stack>
        </Box>
      </Drawer>
    </>
  );
}
