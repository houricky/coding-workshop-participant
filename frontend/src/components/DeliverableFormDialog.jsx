import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Stack,
} from '@mui/material';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

const empty = {
  project_id: '',
  title: '',
  description: '',
  due_date: '',
  employee_id: '',
  status: 'pending',
};

export default function DeliverableFormDialog({
  open,
  initial,
  projectId,
  projectOptions = [],
  assigneeOptions = [],
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        ...empty,
        ...initial,
        employee_id: initial.employee_id ?? initial.assigned_employee_id ?? '',
      } : empty);
    }
  }, [open, initial]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const selectedProjectId = projectId || form.project_id || initial?.project_id || '';
  const filteredAssignees = selectedProjectId
    ? assigneeOptions.filter((employee) => !employee.project_id || employee.project_id === selectedProjectId)
    : [];

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        project_id: selectedProjectId,
        title: form.title,
        description: form.description,
        due_date: form.due_date,
        employee_id: form.employee_id || null,
        status: form.status,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit deliverable' : 'Add deliverable'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {!projectId && (
            <TextField label="Project" select value={form.project_id || ''} onChange={set('project_id')} fullWidth disabled={isEdit}>
              {projectOptions.map((project) => (
                <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField label="Title" value={form.title} onChange={set('title')} fullWidth autoFocus />
          <TextField label="Description" value={form.description || ''} onChange={set('description')} fullWidth multiline minRows={3} />
          <TextField label="Due date" type="date" value={form.due_date || ''} onChange={set('due_date')}
            fullWidth InputLabelProps={{ shrink: true }} />
          <TextField label="Assigned to" select value={form.employee_id || ''} onChange={set('employee_id')} fullWidth>
            <MenuItem value="">Unassigned</MenuItem>
            {filteredAssignees.map((employee) => (
              <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Status" select value={form.status} onChange={set('status')} fullWidth>
            {STATUSES.map((status) => (
              <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !selectedProjectId || !form.title || !form.due_date}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add deliverable'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
