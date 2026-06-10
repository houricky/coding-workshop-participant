// ---------------------------------------------------------------------------
// In-memory mock backend.
//
// Implements the documented API surface so the SPA is fully explorable with no
// server running (VITE_USE_MOCK=true). The shape of every response matches what
// the real FastAPI service is expected to return, so `api.js` can switch to the
// HTTP client without any page changes.
//
// Derived figures (budget_used, hours_used, allocated totals) are computed from
// allocation + usage records, exactly as the real services would.
// ---------------------------------------------------------------------------
import { computeRag } from '../utils/rag';

const delay = (ms = 280) => new Promise((r) => setTimeout(r, ms));
const uid = (() => {
  let n = 1000;
  return () => String(++n);
})();
const clone = (v) => JSON.parse(JSON.stringify(v));

// --- Seed data -------------------------------------------------------------
const db = {
  users: [
    { id: '1', name: 'ACME Admin', email: 'admin@acme.com', password: 'admin123', role: 'admin' },
  ],
  employees: [
    { id: 'e1', name: 'Priya Nair', email: 'priya@acme.test', role: 'manager', staff_type: 'direct', location: 'remote', title: 'Staff Engineer', hourly_rate: 145, capacity_hours: 320 },
    { id: 'e2', name: 'Marcus Lee', email: 'marcus@acme.test', role: 'employee', staff_type: 'direct', location: 'on_site', title: 'Product Designer', hourly_rate: 120, capacity_hours: 320 },
    { id: 'e3', name: 'Sofia Marin', email: 'sofia@acme.test', role: 'manager', staff_type: 'direct', location: 'remote', title: 'Data Engineer', hourly_rate: 135, capacity_hours: 320 },
    { id: 'e4', name: 'Tomas Berg', email: 'tomas@acme.test', role: 'employee', staff_type: 'non_direct', location: 'remote', title: 'Frontend Engineer', hourly_rate: 110, capacity_hours: 320 },
    { id: 'e5', name: 'Aisha Khan', email: 'aisha@acme.test', role: 'manager', staff_type: 'direct', location: 'on_site', title: 'Project Lead', hourly_rate: 160, capacity_hours: 320 },
  ],
  projects: [
    { id: 'p1', project_manager_id: 'e1', name: 'Customer Portal Revamp', description: 'Rebuild the self-service portal on a modern stack.', stage: 'In progress', start_date: '2025-09-01', end_date: '2026-03-31', actual_completion_percent: 60, allocated_budget: 320000 },
    { id: 'p2', project_manager_id: 'e3', name: 'Billing Migration', description: 'Migrate legacy billing to the new ledger.', stage: 'In progress', start_date: '2025-10-15', end_date: '2026-05-30', actual_completion_percent: 35, allocated_budget: 480000 },
    { id: 'p3', project_manager_id: 'e5', name: 'Mobile App v2', description: 'Native rewrite with offline support.', stage: 'In progress', start_date: '2026-01-05', end_date: '2026-08-01', actual_completion_percent: 20, allocated_budget: 260000 },
    { id: 'p4', project_manager_id: 'e3', name: 'Data Warehouse', description: 'Centralized analytics warehouse and pipelines.', stage: 'Planning', start_date: '2026-02-01', end_date: '2026-09-30', actual_completion_percent: 8, allocated_budget: 190000 },
    { id: 'p5', project_manager_id: 'e5', name: 'Security Hardening', description: 'Org-wide security and compliance uplift.', stage: 'In progress', start_date: '2025-11-01', end_date: '2026-04-15', actual_completion_percent: 78, allocated_budget: 150000 },
  ],
  // allocations: planned hours/cost per employee per project
  allocations: [
    { id: 'a1', project_id: 'p1', employee_id: 'e1', allocated_hours: 480, role_on_project: 'manager' },
    { id: 'a2', project_id: 'p1', employee_id: 'e2', allocated_hours: 360, role_on_project: 'employee' },
    { id: 'a3', project_id: 'p1', employee_id: 'e4', allocated_hours: 520, role_on_project: 'employee' },
    { id: 'a4', project_id: 'p2', employee_id: 'e3', allocated_hours: 600, role_on_project: 'manager' },
    { id: 'a5', project_id: 'p2', employee_id: 'e1', allocated_hours: 300, role_on_project: 'manager' },
    { id: 'a6', project_id: 'p3', employee_id: 'e4', allocated_hours: 420, role_on_project: 'employee' },
    { id: 'a7', project_id: 'p3', employee_id: 'e2', allocated_hours: 240, role_on_project: 'employee' },
    { id: 'a8', project_id: 'p4', employee_id: 'e3', allocated_hours: 200, role_on_project: 'manager' },
    { id: 'a9', project_id: 'p5', employee_id: 'e5', allocated_hours: 260, role_on_project: 'manager' },
    { id: 'a10', project_id: 'p5', employee_id: 'e1', allocated_hours: 180, role_on_project: 'manager' },
  ],
  // usage: actual hours logged
  usage: [
    { id: 'u1', project_id: 'p1', employee_id: 'e1', hours_used: 360, logged_on: '2026-01-20' },
    { id: 'u2', project_id: 'p1', employee_id: 'e2', hours_used: 300, logged_on: '2026-01-22' },
    { id: 'u3', project_id: 'p1', employee_id: 'e4', hours_used: 420, logged_on: '2026-02-01' },
    { id: 'u4', project_id: 'p2', employee_id: 'e3', hours_used: 380, logged_on: '2026-02-10' },
    { id: 'u5', project_id: 'p2', employee_id: 'e1', hours_used: 220, logged_on: '2026-02-12' },
    { id: 'u6', project_id: 'p3', employee_id: 'e4', hours_used: 130, logged_on: '2026-02-15' },
    { id: 'u7', project_id: 'p3', employee_id: 'e2', hours_used: 60, logged_on: '2026-02-18' },
    { id: 'u8', project_id: 'p4', employee_id: 'e3', hours_used: 24, logged_on: '2026-02-20' },
    { id: 'u9', project_id: 'p5', employee_id: 'e5', hours_used: 250, logged_on: '2026-02-22' },
    { id: 'u10', project_id: 'p5', employee_id: 'e1', hours_used: 175, logged_on: '2026-02-24' },
  ],
  dependencies: [
    { id: 'd1', project_id: 'p3', depends_on_project_id: 'p1' },
    { id: 'd2', project_id: 'p2', depends_on_project_id: 'p4' },
  ],
  deliverables: [
    { id: 'dl1', project_id: 'p1', title: 'Information architecture approved', description: 'Final navigation and content model.', due_date: '2026-01-30', assigned_employee_id: 'e2', status: 'completed' },
    { id: 'dl2', project_id: 'p1', title: 'Portal shell implemented', description: 'Responsive authenticated app frame.', due_date: '2026-02-28', assigned_employee_id: 'e4', status: 'in_progress' },
    { id: 'dl3', project_id: 'p1', title: 'UAT checklist', description: '', due_date: '2026-03-20', assigned_employee_id: null, status: 'pending' },
    { id: 'dl4', project_id: 'p2', title: 'Ledger mapping signed off', description: 'Field-level mapping from legacy billing.', due_date: '2026-03-15', assigned_employee_id: 'e3', status: 'in_progress' },
    { id: 'dl5', project_id: 'p3', title: 'Offline sync prototype', description: 'Conflict handling and sync retry behavior.', due_date: '2026-04-10', assigned_employee_id: 'e4', status: 'pending' },
    { id: 'dl6', project_id: 'p5', title: 'Access review complete', description: 'Review admin roles and privileged paths.', due_date: '2026-02-12', assigned_employee_id: 'e5', status: 'completed' },
  ],
};

// --- Derivation helpers ----------------------------------------------------
const rateOf = (empId) => db.employees.find((e) => e.id === empId)?.hourly_rate ?? 0;

function deriveProject(p) {
  const allocs = db.allocations.filter((a) => a.project_id === p.id);
  const uses = db.usage.filter((u) => u.project_id === p.id);
  const deliverables = db.deliverables.filter((d) => d.project_id === p.id);
  const allocated_hours = allocs.reduce((s, a) => s + a.allocated_hours, 0);
  const allocated_cost = allocs.reduce((s, a) => s + a.allocated_hours * rateOf(a.employee_id), 0);
  const hours_used = uses.reduce((s, u) => s + u.hours_used, 0);
  const managerIds = new Set([p.project_manager_id, ...allocs.filter((a) => a.role_on_project === 'manager').map((a) => a.employee_id)].filter(Boolean));
  const budget_used = uses.reduce((s, u) => s + u.hours_used * rateOf(u.employee_id), 0);
  const ragInput = {
    allocated_budget: p.allocated_budget,
    budget_used,
    allocated_hours,
    hours_used,
    actual_completion_percent: p.actual_completion_percent,
  };
  const r = computeRag(ragInput);
  return {
    ...p,
    allocated_hours,
    allocated_cost,
    hours_used,
    budget_used,
    rag_status: r.status,
    progress_gap: Number(r.progressGap.toFixed(1)),
    burn_percent: Number(r.burn.toFixed(1)),
    budget_used_percent: Number(r.budgetUsedPercent.toFixed(1)),
    hours_used_percent: Number(r.hoursUsedPercent.toFixed(1)),
    team_size: new Set(allocs.map((a) => a.employee_id)).size,
    manager_count: managerIds.size,
    deliverable_count: deliverables.length,
    completed_deliverable_count: deliverables.filter((d) => d.status === 'completed').length,
    project_manager: db.employees.find((e) => e.id === p.project_manager_id) || null,
  };
}

function deriveEmployee(e) {
  const allocs = db.allocations.filter((a) => a.employee_id === e.id);
  const uses = db.usage.filter((u) => u.employee_id === e.id);
  const allocated_hours = allocs.reduce((s, a) => s + a.allocated_hours, 0);
  const hours_used = uses.reduce((s, u) => s + u.hours_used, 0);
  return {
    ...e,
    project_count: new Set(allocs.map((a) => a.project_id)).size,
    allocated_hours,
    hours_used,
    utilization_percent: e.capacity_hours
      ? Number(((allocated_hours / e.capacity_hours) * 100).toFixed(0))
      : 0,
    overallocated: allocated_hours > e.capacity_hours,
  };
}

function deriveDeliverable(d) {
  const employee = d.assigned_employee_id
    ? db.employees.find((e) => e.id === d.assigned_employee_id) || null
    : null;
  const project = db.projects.find((p) => p.id === d.project_id) || null;
  return {
    ...d,
    employee_id: d.assigned_employee_id,
    employee,
    project: project ? { id: project.id, name: project.name, stage: project.stage } : null,
  };
}

function assertDeliverableAssignment(projectId, employeeId) {
  if (!employeeId) return;
  const isAllocated = db.allocations.some((a) => a.project_id === projectId && a.employee_id === employeeId);
  if (!isAllocated) {
    const err = new Error('Assigned employee must be allocated to this project.');
    err.status = 400;
    throw err;
  }
}

// --- Mock API --------------------------------------------------------------
export const mockBackend = {
  async register({ name, email, password, role = 'employee' }) {
    await delay();
    if (role === 'admin') {
      const err = new Error('The admin account is managed by the system.');
      err.status = 400;
      throw err;
    }
    if (!['manager', 'employee'].includes(role)) {
      const err = new Error('Invalid role.');
      err.status = 400;
      throw err;
    }
    if (db.users.some((u) => u.email === email)) {
      const err = new Error('A user with that email already exists.');
      err.status = 409;
      throw err;
    }
    const user = { id: uid(), name, email, password, role };
    db.users.push(user);
    return { token: `mock.${user.id}`, user: { id: user.id, name, email, role } };
  },

  async login({ email, password }) {
    await delay();
    const user = db.users.find((u) => u.email === email && u.password === password);
    if (!user) {
      const err = new Error('Incorrect email or password.');
      err.status = 401;
      throw err;
    }
    return { token: `mock.${user.id}`, user: { id: user.id, name: user.name, email, role: user.role } };
  },

  async me(token) {
    await delay(120);
    const id = String(token || '').replace('mock.', '');
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      const err = new Error('Session expired.');
      err.status = 401;
      throw err;
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  },

  // Employees
  async listEmployees(filters = {}) {
    await delay();
    return db.employees
      .filter((e) => !filters?.role || e.role === filters.role)
      .filter((e) => filters?.is_direct_staff === undefined || filters?.is_direct_staff === '' || (e.staff_type === 'direct') === (filters.is_direct_staff === true || filters.is_direct_staff === 'true'))
      .filter((e) => !filters?.work_location || e.location === filters.work_location)
      .filter((e) => !filters?.search || e.name.toLowerCase().includes(String(filters.search).toLowerCase()) || e.email.toLowerCase().includes(String(filters.search).toLowerCase()))
      .map(deriveEmployee);
  },
  async getEmployee(id) {
    await delay();
    const e = db.employees.find((x) => x.id === id);
    if (!e) throw notFound('Employee');
    const allocations = db.allocations
      .filter((a) => a.employee_id === id)
      .map((a) => ({ ...a, project: deriveProject(db.projects.find((p) => p.id === a.project_id)) }));
    const usage = db.usage.filter((u) => u.employee_id === id);
    const deliverables = db.deliverables
      .filter((d) => d.assigned_employee_id === id)
      .map(deriveDeliverable);
    return { ...deriveEmployee(e), allocations, usage, deliverables };
  },
  async createEmployee(payload) {
    await delay();
    const e = { id: uid(), role: 'employee', staff_type: 'direct', location: 'remote', capacity_hours: 320, hourly_rate: 100, ...payload };
    db.employees.push(e);
    return deriveEmployee(e);
  },
  async updateEmployee(id, payload) {
    await delay();
    const e = db.employees.find((x) => x.id === id);
    if (!e) throw notFound('Employee');
    Object.assign(e, payload);
    return deriveEmployee(e);
  },
  async deleteEmployee(id) {
    await delay();
    db.employees = db.employees.filter((x) => x.id !== id);
    db.allocations = db.allocations.filter((a) => a.employee_id !== id);
    db.usage = db.usage.filter((u) => u.employee_id !== id);
    db.deliverables = db.deliverables.map((d) => (d.assigned_employee_id === id ? { ...d, assigned_employee_id: null } : d));
    return { ok: true };
  },

  // Projects
  async listProjects() {
    await delay();
    return db.projects.map(deriveProject);
  },
  async getProject(id) {
    await delay();
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw notFound('Project');
    const allocations = db.allocations
      .filter((a) => a.project_id === id)
      .map((a) => ({ ...a, employee: db.employees.find((e) => e.id === a.employee_id) }));
    const usage = db.usage
      .filter((u) => u.project_id === id)
      .map((u) => ({ ...u, employee: db.employees.find((e) => e.id === u.employee_id) }));
    const dependencies = db.dependencies
      .filter((d) => d.project_id === id)
      .map((d) => ({ ...d, depends_on: deriveProject(db.projects.find((p2) => p2.id === d.depends_on_project_id)) }));
    const deliverables = db.deliverables
      .filter((d) => d.project_id === id)
      .map(deriveDeliverable);
    return { ...deriveProject(p), allocations, usage, dependencies, deliverables };
  },
  async createProject(payload) {
    await delay();
    if (!payload.project_manager_id) {
      const err = new Error('Project manager is required.');
      err.status = 400;
      throw err;
    }
    if (db.employees.find((e) => e.id === payload.project_manager_id)?.role !== 'manager') {
      const err = new Error('Project manager must have the manager role.');
      err.status = 400;
      throw err;
    }
    const initialDeliverables = Array.isArray(payload.deliverables) ? payload.deliverables : [];
    const p = { id: uid(), actual_completion_percent: 0, stage: 'Planning', ...payload };
    delete p.deliverables;
    initialDeliverables.forEach((d) => assertDeliverableAssignment(p.id, d.employee_id ?? d.assigned_employee_id));
    db.projects.push(p);
    initialDeliverables.forEach((d) => {
      db.deliverables.push({
        id: uid(),
        project_id: p.id,
        title: d.title,
        description: d.description || '',
        due_date: d.due_date,
        assigned_employee_id: d.employee_id ?? d.assigned_employee_id ?? null,
        status: d.status || 'pending',
      });
    });
    return this.getProject(p.id);
  },
  async updateProject(id, payload) {
    await delay();
    const p = db.projects.find((x) => x.id === id);
    if (!p) throw notFound('Project');
    if ('project_manager_id' in payload && !payload.project_manager_id) {
      const err = new Error('Project manager is required.');
      err.status = 400;
      throw err;
    }
    if (payload.project_manager_id && db.employees.find((e) => e.id === payload.project_manager_id)?.role !== 'manager') {
      const err = new Error('Project manager must have the manager role.');
      err.status = 400;
      throw err;
    }
    Object.assign(p, payload);
    return deriveProject(p);
  },
  async deleteProject(id) {
    await delay();
    db.projects = db.projects.filter((x) => x.id !== id);
    db.allocations = db.allocations.filter((a) => a.project_id !== id);
    db.usage = db.usage.filter((u) => u.project_id !== id);
    db.dependencies = db.dependencies.filter((d) => d.project_id !== id && d.depends_on_project_id !== id);
    db.deliverables = db.deliverables.filter((d) => d.project_id !== id);
    return { ok: true };
  },
  async projectSummary(id) {
    await delay();
    return this.getProject(id);
  },

  // Allocations
  async listAllocations() {
    await delay();
    return db.allocations.map((a) => ({
      ...a,
      employee: db.employees.find((e) => e.id === a.employee_id),
      project: db.projects.find((p) => p.id === a.project_id),
    }));
  },
  async createAllocation(payload) {
    await delay();
    const a = { id: uid(), ...payload, allocated_hours: Number(payload.allocated_hours) };
    db.allocations.push(a);
    return a;
  },
  async updateAllocation(id, payload) {
    await delay();
    const a = db.allocations.find((x) => x.id === id);
    if (!a) throw notFound('Allocation');
    Object.assign(a, payload, { allocated_hours: Number(payload.allocated_hours ?? a.allocated_hours) });
    return a;
  },
  async deleteAllocation(id) {
    await delay();
    db.allocations = db.allocations.filter((x) => x.id !== id);
    return { ok: true };
  },

  // Usage
  async listUsage() {
    await delay();
    return db.usage.map((u) => ({
      ...u,
      employee: db.employees.find((e) => e.id === u.employee_id),
      project: db.projects.find((p) => p.id === u.project_id),
    }));
  },
  async createUsage(payload) {
    await delay();
    const u = { id: uid(), ...payload, hours_used: Number(payload.hours_used) };
    db.usage.push(u);
    return u;
  },
  async updateUsage(id, payload) {
    await delay();
    const u = db.usage.find((x) => x.id === id);
    if (!u) throw notFound('Usage');
    Object.assign(u, payload, { hours_used: Number(payload.hours_used ?? u.hours_used) });
    return u;
  },
  async deleteUsage(id) {
    await delay();
    db.usage = db.usage.filter((x) => x.id !== id);
    return { ok: true };
  },

  // Dependencies
  async listDependencies() {
    await delay();
    return clone(db.dependencies);
  },
  async createDependency(payload) {
    await delay();
    const d = { id: uid(), ...payload };
    db.dependencies.push(d);
    return d;
  },
  async deleteDependency(id) {
    await delay();
    db.dependencies = db.dependencies.filter((x) => x.id !== id);
    return { ok: true };
  },

  // Deliverables
  async listDeliverables(filters = {}) {
    await delay();
    return db.deliverables
      .filter((d) => !filters?.project_id || d.project_id === filters.project_id)
      .filter((d) => !filters?.employee_id || d.assigned_employee_id === filters.employee_id)
      .filter((d) => !filters?.status || d.status === filters.status)
      .map(deriveDeliverable);
  },
  async getDeliverable(id) {
    await delay();
    const d = db.deliverables.find((x) => x.id === id);
    if (!d) throw notFound('Deliverable');
    return deriveDeliverable(d);
  },
  async createDeliverable(payload) {
    await delay();
    const assignedEmployeeId = payload.employee_id ?? payload.assigned_employee_id ?? null;
    assertDeliverableAssignment(payload.project_id, assignedEmployeeId);
    const d = {
      id: uid(),
      project_id: payload.project_id,
      title: payload.title,
      description: payload.description || '',
      due_date: payload.due_date,
      assigned_employee_id: assignedEmployeeId || null,
      status: payload.status || 'pending',
    };
    db.deliverables.push(d);
    return deriveDeliverable(d);
  },
  async updateDeliverable(id, payload) {
    await delay();
    const d = db.deliverables.find((x) => x.id === id);
    if (!d) throw notFound('Deliverable');
    const hasAssignee = Object.prototype.hasOwnProperty.call(payload, 'employee_id')
      || Object.prototype.hasOwnProperty.call(payload, 'assigned_employee_id');
    const assignedEmployeeId = hasAssignee
      ? payload.employee_id ?? payload.assigned_employee_id ?? null
      : d.assigned_employee_id;
    assertDeliverableAssignment(d.project_id, assignedEmployeeId);
    Object.assign(d, payload, {
      assigned_employee_id: assignedEmployeeId || null,
      status: payload.status || d.status,
    });
    delete d.employee_id;
    return deriveDeliverable(d);
  },
  async deleteDeliverable(id) {
    await delay();
    db.deliverables = db.deliverables.filter((x) => x.id !== id);
    return { ok: true };
  },

  // Dashboard
  async dashboard() {
    await delay();
    const projects = db.projects.map(deriveProject);
    const employees = db.employees.map(deriveEmployee);
    const byStatus = { Green: 0, Amber: 0, Red: 0 };
    const activeByStatus = { Green: 0, Amber: 0, Red: 0 };
    const activeProjects = projects.filter((p) => {
      const stage = String(p.stage || '').toLowerCase();
      return stage === 'active' || stage === 'in progress';
    });
    projects.forEach((p) => { byStatus[p.rag_status] += 1; });
    activeProjects.forEach((p) => { activeByStatus[p.rag_status] += 1; });
    return {
      project_count: activeProjects.length,
      active_project_count: activeProjects.length,
      total_project_count: projects.length,
      rag_breakdown: byStatus,
      active_rag_breakdown: activeByStatus,
      total_allocated_budget: projects.reduce((s, p) => s + p.allocated_budget, 0),
      total_budget_used: projects.reduce((s, p) => s + p.budget_used, 0),
      total_allocated_hours: projects.reduce((s, p) => s + p.allocated_hours, 0),
      total_hours_used: projects.reduce((s, p) => s + p.hours_used, 0),
      overallocated_employees: employees.filter((e) => e.overallocated).length,
      total_deliverables: db.deliverables.length,
      completed_deliverables: db.deliverables.filter((d) => d.status === 'completed').length,
      unassigned_deliverables: db.deliverables.filter((d) => !d.assigned_employee_id).length,
      at_risk_projects: projects.filter((p) => p.rag_status === 'Red'),
      projects,
    };
  },
};

function notFound(what) {
  const err = new Error(`${what} not found.`);
  err.status = 404;
  return err;
}
