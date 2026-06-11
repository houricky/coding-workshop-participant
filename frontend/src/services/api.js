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

const unwrap = (p) => p.then((res) => res.data);

export const auth = {
  register: (body) =>
    USE_MOCK ? mockBackend.register(body) : unwrap(http.post('/auth/register', body)),
  login: (body) =>
    USE_MOCK ? mockBackend.login(body) : unwrap(http.post('/auth/login', body)),
  me: () =>
    USE_MOCK ? mockBackend.me(tokenStore.get()) : unwrap(http.get('/auth/me')),
};

export const employees = {
  list: () => (USE_MOCK ? mockBackend.listEmployees() : unwrap(http.get('/employees'))),
  get: (id) => (USE_MOCK ? mockBackend.getEmployee(id) : unwrap(http.get(`/employees/${id}`))),
  create: (b) => (USE_MOCK ? mockBackend.createEmployee(b) : unwrap(http.post('/employees', b))),
  update: (id, b) => (USE_MOCK ? mockBackend.updateEmployee(id, b) : unwrap(http.put(`/employees/${id}`, b))),
  remove: (id) => (USE_MOCK ? mockBackend.deleteEmployee(id) : unwrap(http.delete(`/employees/${id}`))),
};

export const projects = {
  list: () => (USE_MOCK ? mockBackend.listProjects() : unwrap(http.get('/projects'))),
  get: (id) => (USE_MOCK ? mockBackend.getProject(id) : unwrap(http.get(`/projects/${id}`))),
  create: (b) => (USE_MOCK ? mockBackend.createProject(b) : unwrap(http.post('/projects', b))),
  update: (id, b) => (USE_MOCK ? mockBackend.updateProject(id, b) : unwrap(http.put(`/projects/${id}`, b))),
  remove: (id) => (USE_MOCK ? mockBackend.deleteProject(id) : unwrap(http.delete(`/projects/${id}`))),
  summary: (id) => (USE_MOCK ? mockBackend.projectSummary(id) : unwrap(http.get(`/projects/${id}/summary`))),
};

export const allocations = {
  list: () => (USE_MOCK ? mockBackend.listAllocations() : unwrap(http.get('/allocations'))),
  create: (b) => (USE_MOCK ? mockBackend.createAllocation(b) : unwrap(http.post('/allocations', b))),
  update: (id, b) => (USE_MOCK ? mockBackend.updateAllocation(id, b) : unwrap(http.put(`/allocations/${id}`, b))),
  remove: (id) => (USE_MOCK ? mockBackend.deleteAllocation(id) : unwrap(http.delete(`/allocations/${id}`))),
};

export const usage = {
  list: () => (USE_MOCK ? mockBackend.listUsage() : unwrap(http.get('/usage'))),
  create: (b) => (USE_MOCK ? mockBackend.createUsage(b) : unwrap(http.post('/usage', b))),
  update: (id, b) => (USE_MOCK ? mockBackend.updateUsage(id, b) : unwrap(http.put(`/usage/${id}`, b))),
  remove: (id) => (USE_MOCK ? mockBackend.deleteUsage(id) : unwrap(http.delete(`/usage/${id}`))),
};

export const dependencies = {
  list: () => (USE_MOCK ? mockBackend.listDependencies() : unwrap(http.get('/dependencies'))),
  create: (b) => (USE_MOCK ? mockBackend.createDependency(b) : unwrap(http.post('/dependencies', b))),
  remove: (id) => (USE_MOCK ? mockBackend.deleteDependency(id) : unwrap(http.delete(`/dependencies/${id}`))),
};

export const dashboard = {
  get: () => (USE_MOCK ? mockBackend.dashboard() : unwrap(http.get('/dashboard'))),
};

export const ai = {
  explainProject: (projectId) =>
    USE_MOCK ? mockBackend.explainProject(projectId) : unwrap(http.post('/ai/explain-project', { project_id: projectId })),
  chat: (message, history = []) =>
    USE_MOCK ? mockBackend.aiChat(message, history) : unwrap(http.post('/ai/chat', { message, history })),
  parseUsage: (text) =>
    USE_MOCK ? mockBackend.parseUsage(text) : unwrap(http.post('/ai/parse-usage', { text })),
};

export const apiErrorMessage = (err) =>
  err?.response?.data?.message || err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.';

export { USE_MOCK };
