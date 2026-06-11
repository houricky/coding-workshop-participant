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
const DELIVERABLE_STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  stalled: 'Stalled',
};

// --- Seed data -------------------------------------------------------------
const db = {
  users: [
    { id: '1', name: 'ACME Admin', email: 'admin@acme.com', password: 'admin123', role: 'admin', employee_id: 'e1' },
    { id: '2', name: 'Priya Nair', email: 'priya@acme.test', password: 'admin123', role: 'manager', employee_id: 'e1' },
    { id: '3', name: 'Marcus Lee', email: 'marcus@acme.test', password: 'admin123', role: 'employee', employee_id: 'e2' },
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
    { id: 'dl5', project_id: 'p3', title: 'Offline sync prototype', description: 'Conflict handling and sync retry behavior.', due_date: '2026-04-10', assigned_employee_id: 'e4', status: 'stalled' },
    { id: 'dl6', project_id: 'p5', title: 'Access review complete', description: 'Review admin roles and privileged paths.', due_date: '2026-02-12', assigned_employee_id: 'e5', status: 'completed' },
  ],
  deliverableDependencies: [
    { id: 'dd1', deliverable_id: 'dl5', depends_on_deliverable_id: 'dl2' },
    { id: 'dd2', deliverable_id: 'dl4', depends_on_deliverable_id: 'dl2' },
  ],
};

let currentUserId = null;

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
  const hasStalledDeliverables = deliverables.some((item) => item.status === 'stalled');
  let ragStatus = r.status;
  if (hasStalledDeliverables) {
    if (ragStatus === 'Green') ragStatus = 'Amber';
    else if (ragStatus === 'Amber') ragStatus = 'Red';
  }
  return {
    ...p,
    allocated_hours,
    allocated_cost,
    hours_used,
    budget_used,
    rag_status: ragStatus,
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
  const blockedBy = db.deliverableDependencies.filter((dep) => dep.deliverable_id === d.id);
  const blocks = db.deliverableDependencies.filter((dep) => dep.depends_on_deliverable_id === d.id);
  const blockedProjectCount = new Set(
    blocks
      .map((dep) => db.deliverables.find((candidate) => candidate.id === dep.deliverable_id))
      .filter(Boolean)
      .map((candidate) => candidate.project_id)
      .filter((projectId) => projectId !== d.project_id),
  ).size;
  return {
    ...d,
    employee_id: d.assigned_employee_id,
    blocked_by_count: blockedBy.length,
    blocks_count: blocks.length,
    blocked_project_count: blockedProjectCount,
    employee,
    project: project ? { id: project.id, name: project.name, stage: project.stage } : null,
  };
}

function hasDeliverableCycle(deliverableId, dependsOnDeliverableId, excludeId = null) {
  const stack = [dependsOnDeliverableId];
  const seen = new Set();

  while (stack.length) {
    const node = stack.pop();
    if (node === deliverableId) return true;
    if (seen.has(node)) continue;
    seen.add(node);

    db.deliverableDependencies
      .filter((dep) => dep.deliverable_id === node && dep.id !== excludeId)
      .forEach((dep) => stack.push(dep.depends_on_deliverable_id));
  }

  return false;
}

function isDeliverableBlocked(deliverableId) {
  const blockedBy = db.deliverableDependencies.filter((dep) => dep.deliverable_id === deliverableId);
  return blockedBy.some((dep) => {
    const upstream = db.deliverables.find((candidate) => candidate.id === dep.depends_on_deliverable_id);
    return upstream && upstream.status !== 'completed';
  });
}

function recalculateDeliverableStatus(deliverableId) {
  const deliverable = db.deliverables.find((item) => item.id === deliverableId);
  if (!deliverable || deliverable.status === 'completed') return;

  if (isDeliverableBlocked(deliverableId)) {
    deliverable.status = 'stalled';
    return;
  }

  if (deliverable.status === 'stalled') {
    deliverable.status = 'in_progress';
  }
}

function recalculateImpactedDeliverables(rootDeliverableId) {
  const queue = [rootDeliverableId];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);

    const downstream = db.deliverableDependencies
      .filter((dep) => dep.depends_on_deliverable_id === current)
      .map((dep) => dep.deliverable_id);

    downstream.forEach((deliverableId) => {
      recalculateDeliverableStatus(deliverableId);
      queue.push(deliverableId);
    });
  }
}

function deriveDeliverableDependency(dep) {
  const downstream = db.deliverables.find((d) => d.id === dep.deliverable_id);
  const upstream = db.deliverables.find((d) => d.id === dep.depends_on_deliverable_id);
  const downstreamProject = downstream ? db.projects.find((project) => project.id === downstream.project_id) : null;
  const upstreamProject = upstream ? db.projects.find((project) => project.id === upstream.project_id) : null;

  return {
    ...clone(dep),
    deliverable: downstream ? {
      id: downstream.id,
      title: downstream.title,
      project_id: downstream.project_id,
      project: downstreamProject ? { id: downstreamProject.id, name: downstreamProject.name, stage: downstreamProject.stage } : null,
    } : null,
    depends_on: upstream ? {
      id: upstream.id,
      title: upstream.title,
      status: upstream.status,
      project_id: upstream.project_id,
      project: upstreamProject ? { id: upstreamProject.id, name: upstreamProject.name, stage: upstreamProject.stage } : null,
    } : null,
  };
}

function projectBurnRow(p) {
  return {
    id: p.id,
    name: p.name,
    stage: p.stage,
    rag_status: p.rag_status,
    allocated_budget: p.allocated_budget,
    budget_used: p.budget_used,
    budget_remaining: Math.max(p.allocated_budget - p.budget_used, 0),
    allocated_hours: p.allocated_hours,
    hours_used: p.hours_used,
    hours_remaining: Math.max(p.allocated_hours - p.hours_used, 0),
    budget_used_percent: p.budget_used_percent,
    hours_used_percent: p.hours_used_percent,
    burn_percent: p.burn_percent,
    completion_percent: p.actual_completion_percent,
    progress_gap: p.progress_gap,
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

function employeeForEmail(email) {
  return db.employees.find((employee) => employee.email?.toLowerCase() === String(email || '').toLowerCase()) || null;
}

function publicUser(user) {
  const employee = user.employee_id ? db.employees.find((e) => e.id === user.employee_id) : employeeForEmail(user.email);
  return {
    id: user.id,
    name: user.name || employee?.name || user.email,
    email: user.email,
    role: user.role,
    employee_id: user.employee_id || employee?.id || null,
  };
}

function authUser() {
  const user = db.users.find((u) => u.id === currentUserId);
  if (!user) {
    const err = new Error('Session expired.');
    err.status = 401;
    throw err;
  }
  return publicUser(user);
}

function forbidden() {
  const err = new Error('You do not have permission to perform this action.');
  err.status = 403;
  return err;
}

function isAllocated(projectId, employeeId) {
  return !!employeeId && db.allocations.some((a) => a.project_id === projectId && a.employee_id === employeeId);
}

function isProjectLead(projectId, employeeId) {
  if (!employeeId) return false;
  const project = db.projects.find((p) => p.id === projectId);
  return project?.project_manager_id === employeeId
    || db.allocations.some((a) => a.project_id === projectId && a.employee_id === employeeId && a.role_on_project === 'manager');
}

function projectIdsForEmployee(employeeId) {
  return new Set(db.allocations.filter((a) => a.employee_id === employeeId).map((a) => a.project_id));
}

function assertCanViewProject(projectId, user = authUser()) {
  if (user.role === 'employee' && !isAllocated(projectId, user.employee_id)) throw forbidden();
}

function assertCanLeadProject(projectId, user = authUser()) {
  if (user.role === 'employee') throw forbidden();
  if (user.role === 'manager' && !isProjectLead(projectId, user.employee_id)) throw forbidden();
}

// --- Mock API --------------------------------------------------------------
export const mockBackend = {
  async register({ name, email, password, role = 'employee', employee_id }) {
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
    const employee = employee_id ? db.employees.find((e) => e.id === employee_id) : employeeForEmail(email);
    const user = { id: uid(), name: name || employee?.name, email, password, role, employee_id: employee_id || employee?.id || null };
    db.users.push(user);
    currentUserId = user.id;
    return { token: `mock.${user.id}`, user: publicUser(user) };
  },

  async login({ email, password }) {
    await delay();
    const user = db.users.find((u) => u.email === email && u.password === password);
    if (!user) {
      const err = new Error('Incorrect email or password.');
      err.status = 401;
      throw err;
    }
    currentUserId = user.id;
    return { token: `mock.${user.id}`, user: publicUser(user) };
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
    currentUserId = user.id;
    return publicUser(user);
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
    if (authUser().role !== 'admin') throw forbidden();
    const e = { id: uid(), role: 'employee', staff_type: 'direct', location: 'remote', capacity_hours: 320, hourly_rate: 100, ...payload };
    db.employees.push(e);
    return deriveEmployee(e);
  },
  async updateEmployee(id, payload) {
    await delay();
    if (authUser().role !== 'admin') throw forbidden();
    const e = db.employees.find((x) => x.id === id);
    if (!e) throw notFound('Employee');
    Object.assign(e, payload);
    return deriveEmployee(e);
  },
  async deleteEmployee(id) {
    await delay();
    if (authUser().role !== 'admin') throw forbidden();
    db.employees = db.employees.filter((x) => x.id !== id);
    db.allocations = db.allocations.filter((a) => a.employee_id !== id);
    db.usage = db.usage.filter((u) => u.employee_id !== id);
    db.deliverables = db.deliverables.map((d) => (d.assigned_employee_id === id ? { ...d, assigned_employee_id: null } : d));
    return { ok: true };
  },

  // Projects
  async listProjects() {
    await delay();
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    return db.projects
      .filter((p) => !allowedProjectIds || allowedProjectIds.has(p.id))
      .map(deriveProject);
  },
  async getProject(id) {
    await delay();
    assertCanViewProject(id);
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
    if (authUser().role !== 'admin') throw forbidden();
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
    assertCanLeadProject(id);
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
    if (authUser().role !== 'admin') throw forbidden();
    db.projects = db.projects.filter((x) => x.id !== id);
    db.allocations = db.allocations.filter((a) => a.project_id !== id);
    db.usage = db.usage.filter((u) => u.project_id !== id);
    db.dependencies = db.dependencies.filter((d) => d.project_id !== id && d.depends_on_project_id !== id);
    const removedDeliverableIds = new Set(db.deliverables.filter((d) => d.project_id === id).map((d) => d.id));
    db.deliverables = db.deliverables.filter((d) => d.project_id !== id);
    db.deliverableDependencies = db.deliverableDependencies.filter(
      (dep) => !removedDeliverableIds.has(dep.deliverable_id) && !removedDeliverableIds.has(dep.depends_on_deliverable_id),
    );
    return { ok: true };
  },
  async projectSummary(id) {
    await delay();
    return this.getProject(id);
  },

  // Allocations
  async listAllocations() {
    await delay();
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    return db.allocations.map((a) => ({
      ...a,
      employee: db.employees.find((e) => e.id === a.employee_id),
      project: db.projects.find((p) => p.id === a.project_id),
    })).filter((a) => !allowedProjectIds || allowedProjectIds.has(a.project_id));
  },
  async createAllocation(payload) {
    await delay();
    assertCanLeadProject(payload.project_id);
    const a = { id: uid(), ...payload, allocated_hours: Number(payload.allocated_hours) };
    db.allocations.push(a);
    return a;
  },
  async updateAllocation(id, payload) {
    await delay();
    const a = db.allocations.find((x) => x.id === id);
    if (!a) throw notFound('Allocation');
    assertCanLeadProject(a.project_id);
    Object.assign(a, payload, { allocated_hours: Number(payload.allocated_hours ?? a.allocated_hours) });
    return a;
  },
  async deleteAllocation(id) {
    await delay();
    const allocation = db.allocations.find((x) => x.id === id);
    if (!allocation) throw notFound('Allocation');
    assertCanLeadProject(allocation.project_id);
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
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    return clone(db.dependencies.filter((d) => !allowedProjectIds || allowedProjectIds.has(d.project_id)));
  },
  async createDependency(payload) {
    await delay();
    assertCanLeadProject(payload.project_id);
    const d = { id: uid(), ...payload };
    db.dependencies.push(d);
    return d;
  },
  async deleteDependency(id) {
    await delay();
    const dependency = db.dependencies.find((x) => x.id === id);
    if (!dependency) throw notFound('Dependency');
    assertCanLeadProject(dependency.project_id);
    db.dependencies = db.dependencies.filter((x) => x.id !== id);
    return { ok: true };
  },

  // Deliverable dependencies
  async listDeliverableDependencies(filters = {}) {
    await delay();
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    return db.deliverableDependencies
      .filter((dep) => {
        const downstream = db.deliverables.find((d) => d.id === dep.deliverable_id);
        return !allowedProjectIds || (downstream && allowedProjectIds.has(downstream.project_id));
      })
      .filter((dep) => !filters?.deliverable_id || dep.deliverable_id === filters.deliverable_id || dep.depends_on_deliverable_id === filters.deliverable_id)
      .filter((dep) => {
        if (!filters?.project_id) return true;
        const downstream = db.deliverables.find((d) => d.id === dep.deliverable_id);
        return downstream?.project_id === filters.project_id;
      })
      .map((dep) => deriveDeliverableDependency(dep));
  },
  async getDeliverableDependency(id) {
    await delay();
    const dep = db.deliverableDependencies.find((item) => item.id === id);
    if (!dep) throw notFound('Dependency');
    const downstream = db.deliverables.find((d) => d.id === dep.deliverable_id);
    const upstream = db.deliverables.find((d) => d.id === dep.depends_on_deliverable_id);
    if (!downstream || !upstream) throw notFound('Dependency');
    assertCanViewProject(downstream.project_id);
    return deriveDeliverableDependency(dep);
  },
  async createDeliverableDependency(payload) {
    await delay();
    const downstream = db.deliverables.find((d) => d.id === payload.deliverable_id);
    const upstream = db.deliverables.find((d) => d.id === payload.depends_on_deliverable_id);
    if (!downstream || !upstream) throw notFound('Deliverable');
    assertCanLeadProject(downstream.project_id);
    if (downstream.id === upstream.id) {
      const err = new Error('A deliverable cannot depend on itself.');
      err.status = 400;
      throw err;
    }
    if (db.deliverableDependencies.some(
      (dep) => dep.deliverable_id === downstream.id && dep.depends_on_deliverable_id === upstream.id,
    )) {
      const err = new Error('Dependency already exists.');
      err.status = 409;
      throw err;
    }
    if (hasDeliverableCycle(downstream.id, upstream.id)) {
      const err = new Error('Circular deliverable dependency detected.');
      err.status = 400;
      throw err;
    }
    const dep = { id: uid(), deliverable_id: downstream.id, depends_on_deliverable_id: upstream.id };
    db.deliverableDependencies.push(dep);
    recalculateDeliverableStatus(downstream.id);
    recalculateImpactedDeliverables(downstream.id);
    return this.getDeliverableDependency(dep.id);
  },
  async updateDeliverableDependency(id, payload) {
    await delay();
    const dep = db.deliverableDependencies.find((item) => item.id === id);
    if (!dep) throw notFound('Dependency');
    const nextDeliverableId = payload.deliverable_id || dep.deliverable_id;
    const nextDependsOnId = payload.depends_on_deliverable_id || dep.depends_on_deliverable_id;
    const downstream = db.deliverables.find((d) => d.id === nextDeliverableId);
    const upstream = db.deliverables.find((d) => d.id === nextDependsOnId);
    if (!downstream || !upstream) throw notFound('Deliverable');
    assertCanLeadProject(downstream.project_id);
    if (nextDeliverableId === nextDependsOnId) {
      const err = new Error('A deliverable cannot depend on itself.');
      err.status = 400;
      throw err;
    }
    if (db.deliverableDependencies.some(
      (item) => item.id !== id
        && item.deliverable_id === nextDeliverableId
        && item.depends_on_deliverable_id === nextDependsOnId,
    )) {
      const err = new Error('Dependency already exists.');
      err.status = 409;
      throw err;
    }
    if (hasDeliverableCycle(nextDeliverableId, nextDependsOnId, id)) {
      const err = new Error('Circular deliverable dependency detected.');
      err.status = 400;
      throw err;
    }
    dep.deliverable_id = nextDeliverableId;
    dep.depends_on_deliverable_id = nextDependsOnId;
    recalculateDeliverableStatus(dep.deliverable_id);
    recalculateImpactedDeliverables(dep.deliverable_id);
    return this.getDeliverableDependency(dep.id);
  },
  async deleteDeliverableDependency(id) {
    await delay();
    const dep = db.deliverableDependencies.find((item) => item.id === id);
    if (!dep) throw notFound('Dependency');
    const downstream = db.deliverables.find((d) => d.id === dep.deliverable_id);
    if (!downstream) throw notFound('Deliverable');
    assertCanLeadProject(downstream.project_id);
    db.deliverableDependencies = db.deliverableDependencies.filter((item) => item.id !== id);
    recalculateDeliverableStatus(dep.deliverable_id);
    recalculateImpactedDeliverables(dep.deliverable_id);
    return { ok: true };
  },

  // Deliverables
  async listDeliverables(filters = {}) {
    await delay();
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    return db.deliverables
      .filter((d) => !allowedProjectIds || allowedProjectIds.has(d.project_id))
      .filter((d) => !filters?.project_id || d.project_id === filters.project_id)
      .filter((d) => !filters?.employee_id || d.assigned_employee_id === filters.employee_id)
      .filter((d) => !filters?.status || d.status === filters.status)
      .map(deriveDeliverable);
  },
  async getDeliverable(id) {
    await delay();
    const d = db.deliverables.find((x) => x.id === id);
    if (!d) throw notFound('Deliverable');
    assertCanViewProject(d.project_id);
    return deriveDeliverable(d);
  },
  async createDeliverable(payload) {
    await delay();
    assertCanLeadProject(payload.project_id);
    if (payload.status === 'stalled') {
      const err = new Error('status=stalled is system-managed.');
      err.status = 400;
      throw err;
    }
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
    recalculateDeliverableStatus(d.id);
    return deriveDeliverable(d);
  },
  async updateDeliverable(id, payload) {
    await delay();
    const user = authUser();
    const d = db.deliverables.find((x) => x.id === id);
    if (!d) throw notFound('Deliverable');
    if (user.role === 'employee') {
      if (!isAllocated(d.project_id, user.employee_id)) throw forbidden();
      const allowed = ['status', 'employee_id', 'assigned_employee_id'];
      if (Object.keys(payload).some((key) => !allowed.includes(key))) throw forbidden();
      const requestedAssignee = payload.employee_id ?? payload.assigned_employee_id ?? null;
      if (d.assigned_employee_id === user.employee_id) {
        if (requestedAssignee && requestedAssignee !== user.employee_id) throw forbidden();
      } else if (!d.assigned_employee_id && requestedAssignee === user.employee_id) {
        payload = { ...payload, assigned_employee_id: user.employee_id };
      } else {
        throw forbidden();
      }
    } else {
      assertCanLeadProject(d.project_id, user);
    }
    const hasAssignee = Object.prototype.hasOwnProperty.call(payload, 'employee_id')
      || Object.prototype.hasOwnProperty.call(payload, 'assigned_employee_id');
    if (payload.status === 'stalled') {
      const err = new Error('status=stalled is system-managed.');
      err.status = 400;
      throw err;
    }
    const assignedEmployeeId = hasAssignee
      ? payload.employee_id ?? payload.assigned_employee_id ?? null
      : d.assigned_employee_id;
    assertDeliverableAssignment(d.project_id, assignedEmployeeId);
    Object.assign(d, payload, {
      assigned_employee_id: assignedEmployeeId || null,
      status: payload.status || d.status,
    });
    delete d.employee_id;
    recalculateImpactedDeliverables(d.id);
    return deriveDeliverable(d);
  },
  async deleteDeliverable(id) {
    await delay();
    const deliverable = db.deliverables.find((x) => x.id === id);
    if (!deliverable) throw notFound('Deliverable');
    assertCanLeadProject(deliverable.project_id);
    db.deliverables = db.deliverables.filter((x) => x.id !== id);
    db.deliverableDependencies = db.deliverableDependencies.filter(
      (dep) => dep.deliverable_id !== id && dep.depends_on_deliverable_id !== id,
    );
    recalculateImpactedDeliverables(id);
    return { ok: true };
  },

  // Dashboard
  async dashboard() {
    await delay();
    const user = authUser();
    const allowedProjectIds = user.role === 'employee' ? projectIdsForEmployee(user.employee_id) : null;
    const scopedProjectRows = db.projects.filter((p) => !allowedProjectIds || allowedProjectIds.has(p.id));
    const scopedDeliverables = db.deliverables.filter((d) => !allowedProjectIds || allowedProjectIds.has(d.project_id));
    const scopedEmployeeIds = allowedProjectIds
      ? new Set(db.allocations.filter((a) => allowedProjectIds.has(a.project_id)).map((a) => a.employee_id))
      : null;
    const projects = scopedProjectRows.map(deriveProject);
    const employees = db.employees.filter((e) => !scopedEmployeeIds || scopedEmployeeIds.has(e.id)).map(deriveEmployee);
    const byStatus = { Green: 0, Amber: 0, Red: 0 };
    const activeByStatus = { Green: 0, Amber: 0, Red: 0 };
    const stageCounts = new Map();
    const deliverableStatusCounts = new Map();
    const activeProjects = projects.filter((p) => {
      const stage = String(p.stage || '').toLowerCase();
      return stage === 'active' || stage === 'in progress';
    });
    projects.forEach((p) => { byStatus[p.rag_status] += 1; });
    activeProjects.forEach((p) => { activeByStatus[p.rag_status] += 1; });
    projects.forEach((p) => {
      stageCounts.set(p.stage, (stageCounts.get(p.stage) || 0) + 1);
    });
    scopedDeliverables.forEach((d) => {
      const label = DELIVERABLE_STATUS_LABELS[d.status] || d.status;
      deliverableStatusCounts.set(label, (deliverableStatusCounts.get(label) || 0) + 1);
    });
    const stalledBlockerMap = new Map();
    db.deliverableDependencies.forEach((dep) => {
      const upstream = scopedDeliverables.find((item) => item.id === dep.depends_on_deliverable_id);
      const downstream = scopedDeliverables.find((item) => item.id === dep.deliverable_id);
      if (!upstream || !downstream) return;
      if (upstream.project_id === downstream.project_id) return;
      if (downstream.status !== 'stalled') return;
      if (!['pending', 'in_progress', 'stalled'].includes(upstream.status)) return;
      const key = upstream.id;
      if (!stalledBlockerMap.has(key)) {
        stalledBlockerMap.set(key, {
          deliverable_id: upstream.id,
          title: upstream.title,
          project_id: upstream.project_id,
          project_name: db.projects.find((project) => project.id === upstream.project_id)?.name,
          status: DELIVERABLE_STATUS_LABELS[upstream.status] || upstream.status,
          stalled_downstream_count: 0,
          stalled_downstream_project_ids: new Set(),
        });
      }
      const item = stalledBlockerMap.get(key);
      item.stalled_downstream_count += 1;
      item.stalled_downstream_project_ids.add(downstream.project_id);
    });

    const stalledBlockers = Array.from(stalledBlockerMap.values()).map((item) => ({
      deliverable_id: item.deliverable_id,
      title: item.title,
      project_id: item.project_id,
      project_name: item.project_name,
      status: item.status,
      stalled_downstream_count: item.stalled_downstream_count,
      stalled_downstream_project_count: item.stalled_downstream_project_ids.size,
    }));
    const stalledBlockingProjectCount = new Set(
      stalledBlockers.flatMap((item) => db.deliverableDependencies
        .filter((dep) => dep.depends_on_deliverable_id === item.deliverable_id)
        .map((dep) => scopedDeliverables.find((deliverable) => deliverable.id === dep.deliverable_id))
        .filter((deliverable) => deliverable && deliverable.status === 'stalled' && deliverable.project_id !== item.project_id)
        .map((deliverable) => deliverable.project_id)),
    ).size;
    const totalAllocatedBudget = projects.reduce((s, p) => s + p.allocated_budget, 0);
    const totalBudgetUsed = projects.reduce((s, p) => s + p.budget_used, 0);
    const totalAllocatedHours = projects.reduce((s, p) => s + p.allocated_hours, 0);
    const totalHoursUsed = projects.reduce((s, p) => s + p.hours_used, 0);
    return {
      project_count: activeProjects.length,
      active_project_count: activeProjects.length,
      total_project_count: projects.length,
      rag_breakdown: byStatus,
      active_rag_breakdown: activeByStatus,
      stage_breakdown: Array.from(stageCounts, ([stage, count]) => ({ stage, count })),
      deliverable_status_breakdown: Array.from(deliverableStatusCounts, ([status, count]) => ({ status, count })),
      project_burn: projects
        .map(projectBurnRow)
        .sort((a, b) => b.burn_percent - a.burn_percent || a.name.localeCompare(b.name)),
      team_utilization: employees
        .map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          department: e.department,
          allocated_hours: e.allocated_hours,
          capacity_hours: e.capacity_hours,
          utilization_percent: e.utilization_percent,
          overallocated: e.overallocated,
          project_count: e.project_count,
        }))
        .sort((a, b) => b.utilization_percent - a.utilization_percent || a.name.localeCompare(b.name)),
      total_allocated_budget: totalAllocatedBudget,
      total_budget_used: totalBudgetUsed,
      total_budget_remaining: Math.max(totalAllocatedBudget - totalBudgetUsed, 0),
      budget_used_percent: totalAllocatedBudget ? (totalBudgetUsed / totalAllocatedBudget) * 100 : 0,
      total_allocated_hours: totalAllocatedHours,
      total_hours_used: totalHoursUsed,
      total_hours_remaining: Math.max(totalAllocatedHours - totalHoursUsed, 0),
      hours_used_percent: totalAllocatedHours ? (totalHoursUsed / totalAllocatedHours) * 100 : 0,
      overallocated_employees: employees.filter((e) => e.overallocated).length,
      total_deliverables: scopedDeliverables.length,
      completed_deliverables: scopedDeliverables.filter((d) => d.status === 'completed').length,
      stalled_deliverables: scopedDeliverables.filter((d) => d.status === 'stalled').length,
      unassigned_deliverables: scopedDeliverables.filter((d) => !d.assigned_employee_id).length,
      stalling_deliverables_count: stalledBlockers.length,
      stalled_blocking_project_count: stalledBlockingProjectCount,
      stalled_blockers: stalledBlockers,
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
