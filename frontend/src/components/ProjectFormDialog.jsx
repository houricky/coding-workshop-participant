import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Stack, Grid, Box, Typography, InputAdornment,
} from '@mui/material';
import RagChip from './RagChip';
import HealthGauge from './HealthGauge';
import { computeRag } from '../utils/rag';
import { percent } from '../utils/format';

const STAGES = ['Planning', 'In progress', 'On hold', 'Completed'];
const empty = { name: '', description: '', stage: 'Planning', start_date: '', end_date: '', allocated_budget: 0, actual_completion_percent: 0 };

export default function ProjectFormDialog({ open, initial, onClose, onSubmit }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) setForm(initial ? { ...empty, ...initial } : empty);
  }, [open, initial]);

  const set = (k, transform = (v) => v) => (e) => setForm((f) => ({ ...f, [k]: transform(e.target.value) }));
  const num = (v) => (v === '' ? '' : Number(v));

  // Live RAG preview uses current derived burn if editing, else completion alone.
  const preview = computeRag({
    allocated_budget: form.allocated_budget || 0,
    budget_used: initial?.budget_used || 0,
    allocated_hours: initial?.allocated_hours || 0,
    hours_used: initial?.hours_used || 0,
    actual_completion_percent: form.actual_completion_percent || 0,
  });

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        allocated_budget: Number(form.allocated_budget) || 0,
        actual_completion_percent: Number(form.actual_completion_percent) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Project name" value={form.name} onChange={set('name')} fullWidth autoFocus />
          <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={2} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Stage" select value={form.stage} onChange={set('stage')} fullWidth>
                {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Allocated budget" type="number" value={form.allocated_budget}
                onChange={set('allocated_budget', num)} fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Start date" type="date" value={form.start_date || ''} onChange={set('start_date')}
                fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Target end date" type="date" value={form.end_date || ''} onChange={set('end_date')}
                fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Actual completion" type="number" value={form.actual_completion_percent}
                onChange={set('actual_completion_percent', num)} fullWidth
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment>, inputProps: { min: 0, max: 100 } }} />
            </Grid>
          </Grid>

          <Box sx={{ bgcolor: '#FBFBFC', border: '1px solid rgba(27,42,74,0.1)', borderRadius: 1.5, p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Projected status</Typography>
              <RagChip status={preview.status} withLabel />
            </Stack>
            <HealthGauge burn={preview.burn} completion={preview.completion} status={preview.status} />
            <Typography variant="caption" color="text.secondary" className="tnum">
              Progress gap {percent(preview.progressGap, 1)} {isEdit ? '' : '· burn updates once hours and budget are logged'}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !form.name}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
