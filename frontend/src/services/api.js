// ---------------------------------------------------------------------------
// Public API surface used by every page/component.
//
// A single switch (VITE_USE_MOCK) decides whether calls hit the in-memory mock
// backend or the real FastAPI service via the axios client. Pages never import
// the mock or axios directly — they only depend on this module, so flipping to
// the live backend is a one-line env change.
//
// Endpoint paths follow the spec's "Recommended API Requirements".
// ---------------------------------------------------------------------------
import http, { tokenStore } from './httpClient';
import { mockBackend } from './mockBackend';

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

const unwrap = (p, key) => p.then((res) => (key ? res.data?.[key] : res.data));
const query = (params = {}) => ({ params });
const endpoint = {
  auth: '/api/auth-service',
  employees: '/api/employee-service',
  projects: '/api/project-service',
  allocations: '/api/allocation-service',
  usage: '/api/usage-service',
  dependencies: '/api/dependency-service',
  deliverables: '/api/deliverable-service',
  dashboard: '/api/dashboard-service',
};

const STAGE_TO_API = {
  Planning: 'planning',
  'In progress': 'active',
  'On hold': 'on_hold',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

const STAGE_FROM_API = {
  planning: 'Planning',
  active: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || parts[0] || '',
  };
}

function projectReadPayload(project) {
  if (!project || typeof project !== 'object') return project;
  return {
    ...project,
    stage: STAGE_FROM_API[project.stage] || project.stage,
    dependencies: project.dependencies?.map((dependency) => ({
      ...dependency,
      depends_on: projectReadPayload(dependency.depends_on),
    })),
    project: projectReadPayload(project.project),
  };
}

function projectWritePayload(body) {
  const allocatedBudget = Number(body.allocated_budget);
  return {
    ...body,
    stage: STAGE_TO_API[body.stage] || body.stage,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    allocated_budget: allocatedBudget > 0 ? allocatedBudget : undefined,
  };
}

function dashboardReadPayload(body) {
  if (!body || typeof body !== 'object') return body;
  return {
    ...body,
    at_risk_projects: body.at_risk_projects?.map(projectReadPayload) || [],
    projects: body.projects?.map(projectReadPayload),
  };
}

function employeeWritePayload(body) {
  const names = splitName(body.name);
  return {
    first_name: body.first_name ?? names.first_name,
    last_name: body.last_name ?? names.last_name,
    email: body.email,
    role: body.role || 'employee',
    job_title: body.job_title ?? body.title,
    department: body.department,
    is_direct_staff: body.is_direct_staff ?? body.staff_type !== 'non_direct',
    work_location: body.work_location ?? body.location ?? 'remote',
    hourly_rate: body.hourly_rate,
    weekly_capacity_hours: body.weekly_capacity_hours ?? body.capacity_hours,
    is_active: body.is_active,
  };
}

export const auth = {
  register: (body) =>
    USE_MOCK ? mockBackend.register(body) : unwrap(http.post(`${endpoint.auth}/register`, body)),
  login: (body) =>
    USE_MOCK ? mockBackend.login(body) : unwrap(http.post(`${endpoint.auth}/login`, body)),
  me: () =>
    USE_MOCK ? mockBackend.me(tokenStore.get()) : unwrap(http.get(`${endpoint.auth}/me`), 'user'),
};

export const employees = {
  list: (params) => (USE_MOCK ? mockBackend.listEmployees(params) : unwrap(http.get(endpoint.employees, query(params)), 'employees')),
  get: (id) => (USE_MOCK ? mockBackend.getEmployee(id) : unwrap(http.get(`${endpoint.employees}/${id}`), 'employee')),
  create: (b) => (USE_MOCK ? mockBackend.createEmployee(b) : unwrap(http.post(endpoint.employees, employeeWritePayload(b)), 'employee')),
  update: (id, b) => (USE_MOCK ? mockBackend.updateEmployee(id, b) : unwrap(http.put(`${endpoint.employees}/${id}`, employeeWritePayload(b)), 'employee')),
  remove: (id) => (USE_MOCK ? mockBackend.deleteEmployee(id) : unwrap(http.delete(`${endpoint.employees}/${id}`))),
};

export const projects = {
  list: () => (USE_MOCK ? mockBackend.listProjects() : unwrap(http.get(endpoint.projects), 'projects').then((rows) => rows.map(projectReadPayload))),
  get: (id) => (USE_MOCK ? mockBackend.getProject(id) : unwrap(http.get(`${endpoint.projects}/${id}`), 'project').then(projectReadPayload)),
  create: (b) => (USE_MOCK ? mockBackend.createProject(b) : unwrap(http.post(endpoint.projects, projectWritePayload(b)), 'project').then(projectReadPayload)),
  update: (id, b) => (USE_MOCK ? mockBackend.updateProject(id, b) : unwrap(http.put(`${endpoint.projects}/${id}`, projectWritePayload(b)), 'project').then(projectReadPayload)),
  remove: (id) => (USE_MOCK ? mockBackend.deleteProject(id) : unwrap(http.delete(`${endpoint.projects}/${id}`))),
  summary: (id) => (USE_MOCK ? mockBackend.projectSummary(id) : unwrap(http.get(`${endpoint.projects}/${id}/summary`), 'summary').then(projectReadPayload)),
};

export const allocations = {
  list: () => (USE_MOCK ? mockBackend.listAllocations() : unwrap(http.get(endpoint.allocations), 'allocations')),
  create: (b) => (USE_MOCK ? mockBackend.createAllocation(b) : unwrap(http.post(endpoint.allocations, b), 'allocation')),
  update: (id, b) => (USE_MOCK ? mockBackend.updateAllocation(id, b) : unwrap(http.put(`${endpoint.allocations}/${id}`, b), 'allocation')),
  remove: (id) => (USE_MOCK ? mockBackend.deleteAllocation(id) : unwrap(http.delete(`${endpoint.allocations}/${id}`))),
};

export const usage = {
  list: () => (USE_MOCK ? mockBackend.listUsage() : unwrap(http.get(endpoint.usage), 'usage')),
  create: (b) => (USE_MOCK ? mockBackend.createUsage(b) : unwrap(http.post(endpoint.usage, b), 'usage')),
  update: (id, b) => (USE_MOCK ? mockBackend.updateUsage(id, b) : unwrap(http.put(`${endpoint.usage}/${id}`, b), 'usage')),
  remove: (id) => (USE_MOCK ? mockBackend.deleteUsage(id) : unwrap(http.delete(`${endpoint.usage}/${id}`))),
};

export const dependencies = {
  list: () => (USE_MOCK ? mockBackend.listDependencies() : unwrap(http.get(endpoint.dependencies), 'dependencies')),
  create: (b) => (USE_MOCK ? mockBackend.createDependency(b) : unwrap(http.post(endpoint.dependencies, b), 'dependency')),
  remove: (id) => (USE_MOCK ? mockBackend.deleteDependency(id) : unwrap(http.delete(`${endpoint.dependencies}/${id}`))),
};

export const deliverables = {
  list: (params) => (USE_MOCK ? mockBackend.listDeliverables(params) : unwrap(http.get(endpoint.deliverables, query(params)), 'deliverables')),
  get: (id) => (USE_MOCK ? mockBackend.getDeliverable(id) : unwrap(http.get(`${endpoint.deliverables}/${id}`), 'deliverable')),
  create: (b) => (USE_MOCK ? mockBackend.createDeliverable(b) : unwrap(http.post(endpoint.deliverables, b), 'deliverable')),
  update: (id, b) => (USE_MOCK ? mockBackend.updateDeliverable(id, b) : unwrap(http.put(`${endpoint.deliverables}/${id}`, b), 'deliverable')),
  remove: (id) => (USE_MOCK ? mockBackend.deleteDeliverable(id) : unwrap(http.delete(`${endpoint.deliverables}/${id}`))),
};

export const dashboard = {
  get: () => (USE_MOCK ? mockBackend.dashboard() : unwrap(http.get(endpoint.dashboard)).then(dashboardReadPayload)),
};

export const apiErrorMessage = (err) =>
  err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.';

export { USE_MOCK };
