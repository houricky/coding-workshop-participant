import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Stack, Autocomplete, Chip, Alert,
} from '@mui/material';
import { EntityAutocomplete } from './ui';

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
  dependency_ids: [],
};

export default function DeliverableFormDialog({
  open,
  initial,
  projectId,
  projectOptions = [],
  assigneeOptions = [],
  dependencyOptions = [],
  currentUser,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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
        dependency_ids: initial.blocked_by?.map((node) => node.id) || [],
      } : empty);
      setSaveError('');
    }
  }, [open, initial]);

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
  const canManageDependencies = !lockEmployeeFields;
  const blockedByOptions = initial?.blocked_by?.map((node) => ({
    id: node.id,
    title: node.title,
    project_id: node.project_id,
    project: { name: node.project_name },
    project_name: node.project_name,
    status: node.status,
  })) || [];
  const dependencyOptionMap = new Map([...dependencyOptions, ...blockedByOptions]
    .filter((option) => option?.id && option.id !== initial?.id)
    .map((option) => [String(option.id), option]));
  const availableDependencies = [...dependencyOptionMap.values()].sort((a, b) => (
    (a?.project?.name || a?.project_name || '').localeCompare(b?.project?.name || b?.project_name || '')
    || (a?.title || '').localeCompare(b?.title || '')
  ));
  const selectedDependencies = form.dependency_ids
    .map((id) => dependencyOptionMap.get(String(id)))
    .filter(Boolean);
  const dependencyLabel = (option) => {
    const projectName = option?.project?.name || option?.project_name;
    return [option?.title, projectName].filter(Boolean).join(' · ');
  };

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError('');
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
      await onSubmit(payload, { dependencyIds: form.dependency_ids });
      onClose();
    } catch (error) {
      setSaveError(error?.response?.data?.detail || error?.message || 'Unable to save deliverable.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit deliverable' : 'Add deliverable'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {saveError && <Alert severity="error">{saveError}</Alert>}
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
          {canManageDependencies && (
            <Autocomplete
              multiple
              options={availableDependencies}
              value={selectedDependencies}
              onChange={(_, value) => setForm((current) => ({ ...current, dependency_ids: value.map((option) => option.id) }))}
              getOptionLabel={dependencyLabel}
              isOptionEqualToValue={(option, selectedOption) => String(option.id) === String(selectedOption.id)}
              groupBy={(option) => option?.project?.name || option?.project_name || 'Other projects'}
              filterSelectedOptions
              autoHighlight
              openOnFocus
              renderTags={(value, getTagProps) => value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.id} label={dependencyLabel(option)} size="small" />
              ))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Depends on"
                  placeholder={selectedDependencies.length ? '' : 'Search deliverables'}
                  inputProps={{
                    ...params.inputProps,
                    autoComplete: 'new-password',
                  }}
                />
              )}
            />
          )}
          <TextField label="Status" select value={form.status} onChange={set('status')} fullWidth>
            {STATUSES.map((status) => (
              <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>
            ))}
          </TextField>
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
