import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Stack, Autocomplete,
} from '@mui/material';
import { EntityAutocomplete } from './ui';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'stalled', label: 'Stalled (auto)' },
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
  dependencyOptions = [],
  initialDependencyIds = [],
  currentUser,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(empty);
  const [dependsOnIds, setDependsOnIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;
  const isEmployee = currentUser?.role === 'employee';
  const initialAssigneeId = initial?.employee_id ?? initial?.assigned_employee_id ?? '';
  const employeeClaimRequired = isEmployee && isEdit && !initialAssigneeId && form.employee_id !== currentUser?.employee_id;

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        ...empty,
        ...initial,
        employee_id: initial.employee_id ?? initial.assigned_employee_id ?? '',
      } : empty);
      setDependsOnIds(initial?.id ? initialDependencyIds : []);
    }
  }, [open, initial, initialDependencyIds]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setValue = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedProjectId = projectId || form.project_id || initial?.project_id || '';
  const projectAssignees = selectedProjectId
    ? assigneeOptions.filter((employee) => !employee.project_id || employee.project_id === selectedProjectId)
    : [];
  const selfOption = currentUser?.employee_id
    ? projectAssignees.find((employee) => employee.id === currentUser.employee_id) || {
      id: currentUser.employee_id,
      name: currentUser.name || currentUser.email,
    }
    : null;
  const selectedAssignee = initialAssigneeId
    ? projectAssignees.find((employee) => employee.id === initialAssigneeId) || initial?.employee
    : null;
  const filteredAssignees = isEmployee
    ? [selectedAssignee || selfOption].filter(Boolean)
    : projectAssignees;
  const lockEmployeeFields = isEmployee && isEdit;
  const lockEmployeeAssignee = isEmployee && isEdit && !!initialAssigneeId;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = lockEmployeeFields
        ? {
          employee_id: form.employee_id || null,
          status: form.status,
        }
        : {
          project_id: selectedProjectId,
          title: form.title,
          description: form.description,
          due_date: form.due_date,
          employee_id: form.employee_id || null,
          status: form.status,
        };
      await onSubmit(payload, dependsOnIds);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const availableDependencyOptions = dependencyOptions
    .filter((option) => option.id !== initial?.id)
    .sort((a, b) => `${a.project_name} ${a.title}`.localeCompare(`${b.project_name} ${b.title}`));
  const selectedDependencies = dependsOnIds
    .map((dependencyId) => availableDependencyOptions.find((option) => option.id === dependencyId))
    .filter(Boolean);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit deliverable' : 'Add deliverable'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {!projectId && (
            <EntityAutocomplete
              label="Project"
              options={projectOptions}
              value={form.project_id}
              onChange={setValue('project_id')}
              placeholder="Search projects"
              size="medium"
              disabled={isEdit}
            />
          )}
          <TextField label="Title" value={form.title} onChange={set('title')} fullWidth autoFocus disabled={lockEmployeeFields} />
          <TextField label="Description" value={form.description || ''} onChange={set('description')} fullWidth multiline minRows={3} disabled={lockEmployeeFields} />
          <TextField label="Due date" type="date" value={form.due_date || ''} onChange={set('due_date')}
            fullWidth InputLabelProps={{ shrink: true }} disabled={lockEmployeeFields} />
          <EntityAutocomplete
            label="Assigned to"
            options={filteredAssignees}
            value={form.employee_id}
            onChange={setValue('employee_id')}
            placeholder="Search assignees"
            size="medium"
            disabled={lockEmployeeAssignee}
            allowNone
            noneLabel="Unassigned"
          />
          <TextField label="Status" select value={form.status} onChange={set('status')} fullWidth>
            {STATUSES.map((status) => (
              <MenuItem key={status.value} value={status.value} disabled={status.value === 'stalled'}>{status.label}</MenuItem>
            ))}
          </TextField>
          {!lockEmployeeFields && (
            <Autocomplete
              multiple
              options={availableDependencyOptions}
              value={selectedDependencies}
              onChange={(_, options) => setDependsOnIds(options.map((option) => option.id))}
              isOptionEqualToValue={(option, selected) => option.id === selected.id}
              getOptionLabel={(option) => `${option.project_name}: ${option.title}`}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Depends On Deliverables"
                  placeholder="Select upstream deliverables"
                />
              )}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !selectedProjectId || !form.title || !form.due_date || employeeClaimRequired}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add deliverable'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
