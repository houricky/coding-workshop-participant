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
    { id: '4', name: 'Sofia Marin', email: 'sofia@acme.test', password: 'admin123', role: 'manager', employee_id: 'e3' },
    { id: '5', name: 'Aisha Khan', email: 'aisha@acme.test', password: 'admin123', role: 'manager', employee_id: 'e5' },
  ],
  employees: [
    { id: 'e1', name: 'Priya Nair', email: 'priya@acme.test', role: 'manager', department: 'Platform Engineering', staff_type: 'direct', location: 'remote', title: 'Principal Platform Lead', hourly_rate: 165, capacity_hours: 320 },
    { id: 'e2', name: 'Marcus Lee', email: 'marcus@acme.test', role: 'employee', department: 'Product Design', staff_type: 'direct', location: 'on_site', title: 'Lead Product Designer', hourly_rate: 125, capacity_hours: 320 },
    { id: 'e3', name: 'Sofia Marin', email: 'sofia@acme.test', role: 'manager', department: 'Data & Analytics', staff_type: 'direct', location: 'remote', title: 'Data Platform Manager', hourly_rate: 150, capacity_hours: 320 },
    { id: 'e4', name: 'Tomas Berg', email: 'tomas@acme.test', role: 'employee', department: 'Frontend Engineering', staff_type: 'non_direct', location: 'remote', title: 'Frontend Engineer', hourly_rate: 115, capacity_hours: 300 },
    { id: 'e5', name: 'Aisha Khan', email: 'aisha@acme.test', role: 'manager', department: 'Delivery Operations', staff_type: 'direct', location: 'on_site', title: 'Program Director', hourly_rate: 170, capacity_hours: 320 },
    { id: 'e6', name: 'Elena Petrova', email: 'elena@acme.test', role: 'employee', department: 'Security', staff_type: 'direct', location: 'remote', title: 'Identity Architect', hourly_rate: 155, capacity_hours: 300 },
    { id: 'e7', name: 'Diego Ramos', email: 'diego@acme.test', role: 'employee', department: 'Finance Systems', staff_type: 'direct', location: 'on_site', title: 'ERP Analyst', hourly_rate: 118, capacity_hours: 320 },
    { id: 'e8', name: 'Nora Chen', email: 'nora@acme.test', role: 'employee', department: 'Mobile Engineering', staff_type: 'non_direct', location: 'remote', title: 'Mobile Engineer', hourly_rate: 122, capacity_hours: 300 },
    { id: 'e9', name: 'Owen Brooks', email: 'owen@acme.test', role: 'employee', department: 'Enterprise Architecture', staff_type: 'direct', location: 'remote', title: 'Integration Architect', hourly_rate: 148, capacity_hours: 320 },
    { id: 'e10', name: 'Maya Okafor', email: 'maya@acme.test', role: 'manager', department: 'Compliance', staff_type: 'direct', location: 'hybrid', title: 'Compliance Lead', hourly_rate: 140, capacity_hours: 320 },
    { id: 'e11', name: 'Jules Hart', email: 'jules@acme.test', role: 'employee', department: 'AI Enablement', staff_type: 'direct', location: 'remote', title: 'ML Engineer', hourly_rate: 160, capacity_hours: 300 },
    { id: 'e12', name: 'Samira Aziz', email: 'samira@acme.test', role: 'employee', department: 'Change Management', staff_type: 'direct', location: 'hybrid', title: 'Change Manager', hourly_rate: 105, capacity_hours: 320 },
  ],
  projects: [
    { id: 'p1', project_manager_id: 'e1', name: 'Identity Platform Modernization', description: 'Unify customer, workforce, and partner identity on a zero-trust foundation.', stage: 'In progress', start_date: '2025-09-01', end_date: '2026-05-31', actual_completion_percent: 52, allocated_budget: 620000 },
    { id: 'p2', project_manager_id: 'e3', name: 'Finance ERP Consolidation', description: 'Retire three regional ledgers into a single global ERP operating model.', stage: 'In progress', start_date: '2025-10-15', end_date: '2026-08-30', actual_completion_percent: 34, allocated_budget: 780000 },
    { id: 'p3', project_manager_id: 'e5', name: 'Mobile Field Operations', description: 'Offline-capable mobile workflows for technicians and site supervisors.', stage: 'In progress', start_date: '2026-01-05', end_date: '2026-09-15', actual_completion_percent: 22, allocated_budget: 410000 },
    { id: 'p4', project_manager_id: 'e3', name: 'Enterprise Data Mesh', description: 'Federated data products, lineage, and governance across core domains.', stage: 'In progress', start_date: '2025-11-01', end_date: '2026-10-30', actual_completion_percent: 28, allocated_budget: 560000 },
    { id: 'p5', project_manager_id: 'e10', name: 'Regulatory Controls Automation', description: 'Automate SOC2, SOX, and privacy evidence collection and attestation.', stage: 'Planning', start_date: '2026-02-01', end_date: '2026-12-15', actual_completion_percent: 0, allocated_budget: 300000 },
    { id: 'p6', project_manager_id: 'e5', name: 'AI Knowledge Assistant', description: 'Enterprise retrieval assistant using governed data products and policy-aware answers.', stage: 'In progress', start_date: '2026-01-20', end_date: '2026-07-31', actual_completion_percent: 18, allocated_budget: 350000 },
    { id: 'p7', project_manager_id: 'e10', name: 'Vendor Risk Portal', description: 'Supplier onboarding, control questionnaires, and residual risk workflows.', stage: 'On hold', start_date: '2025-12-01', end_date: '2026-06-30', actual_completion_percent: 41, allocated_budget: 220000 },
    { id: 'p8', project_manager_id: 'e1', name: 'API Gateway Rationalization', description: 'Consolidate legacy API gateways, policy enforcement, and observability.', stage: 'In progress', start_date: '2025-08-15', end_date: '2026-04-30', actual_completion_percent: 72, allocated_budget: 420000 },
    { id: 'p9', project_manager_id: 'e12', name: 'Global Change Enablement', description: 'Role-based training, adoption analytics, and cutover playbooks for enterprise rollout.', stage: 'Planning', start_date: '2026-03-01', end_date: '2026-11-30', actual_completion_percent: 0, allocated_budget: 180000 },
    { id: 'p10', project_manager_id: 'e1', name: 'Customer Experience Portal', description: 'New enterprise account workspace for customer success and self-service expansion.', stage: 'Planning', start_date: '2026-04-01', end_date: '2027-01-31', actual_completion_percent: 0, allocated_budget: 260000 },
    { id: 'p11', project_manager_id: 'e3', name: 'Manufacturing Quality Insights', description: 'Quality analytics product for plant operations, defects, and supplier traceability.', stage: 'Planning', start_date: '2026-04-15', end_date: '2026-12-20', actual_completion_percent: 0, allocated_budget: 240000 },
  ],
  // allocations: planned hours/cost per employee per project
  allocations: [
    { id: 'a1', project_id: 'p1', employee_id: 'e1', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a2', project_id: 'p1', employee_id: 'e6', allocated_hours: 120, role_on_project: 'employee' },
    { id: 'a3', project_id: 'p1', employee_id: 'e9', allocated_hours: 60, role_on_project: 'employee' },
    { id: 'a4', project_id: 'p2', employee_id: 'e3', allocated_hours: 100, role_on_project: 'manager' },
    { id: 'a5', project_id: 'p2', employee_id: 'e7', allocated_hours: 240, role_on_project: 'employee' },
    { id: 'a6', project_id: 'p2', employee_id: 'e9', allocated_hours: 60, role_on_project: 'employee' },
    { id: 'a7', project_id: 'p3', employee_id: 'e5', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a8', project_id: 'p3', employee_id: 'e2', allocated_hours: 160, role_on_project: 'employee' },
    { id: 'a9', project_id: 'p3', employee_id: 'e8', allocated_hours: 220, role_on_project: 'employee' },
    { id: 'a10', project_id: 'p4', employee_id: 'e3', allocated_hours: 120, role_on_project: 'manager' },
    { id: 'a11', project_id: 'p4', employee_id: 'e11', allocated_hours: 160, role_on_project: 'employee' },
    { id: 'a12', project_id: 'p4', employee_id: 'e9', allocated_hours: 80, role_on_project: 'employee' },
    { id: 'a13', project_id: 'p5', employee_id: 'e10', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a14', project_id: 'p5', employee_id: 'e6', allocated_hours: 100, role_on_project: 'employee' },
    { id: 'a15', project_id: 'p5', employee_id: 'e12', allocated_hours: 160, role_on_project: 'employee' },
    { id: 'a16', project_id: 'p6', employee_id: 'e5', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a17', project_id: 'p6', employee_id: 'e11', allocated_hours: 140, role_on_project: 'employee' },
    { id: 'a18', project_id: 'p6', employee_id: 'e3', allocated_hours: 100, role_on_project: 'manager' },
    { id: 'a19', project_id: 'p7', employee_id: 'e10', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a20', project_id: 'p7', employee_id: 'e12', allocated_hours: 80, role_on_project: 'employee' },
    { id: 'a21', project_id: 'p8', employee_id: 'e1', allocated_hours: 160, role_on_project: 'manager' },
    { id: 'a22', project_id: 'p8', employee_id: 'e4', allocated_hours: 180, role_on_project: 'employee' },
    { id: 'a23', project_id: 'p8', employee_id: 'e9', allocated_hours: 120, role_on_project: 'employee' },
    { id: 'a24', project_id: 'p9', employee_id: 'e12', allocated_hours: 120, role_on_project: 'manager' },
    { id: 'a25', project_id: 'p9', employee_id: 'e2', allocated_hours: 80, role_on_project: 'employee' },
    { id: 'a26', project_id: 'p10', employee_id: 'e4', allocated_hours: 120, role_on_project: 'employee' },
    { id: 'a27', project_id: 'p10', employee_id: 'e6', allocated_hours: 80, role_on_project: 'employee' },
    { id: 'a28', project_id: 'p11', employee_id: 'e7', allocated_hours: 80, role_on_project: 'employee' },
    { id: 'a29', project_id: 'p11', employee_id: 'e8', allocated_hours: 80, role_on_project: 'employee' },
  ],
  // usage: actual hours logged
  usage: [
    { id: 'u1', project_id: 'p1', employee_id: 'e1', hours_used: 85, logged_on: '2026-02-18' },
    { id: 'u2', project_id: 'p1', employee_id: 'e6', hours_used: 65, logged_on: '2026-02-19' },
    { id: 'u3', project_id: 'p1', employee_id: 'e9', hours_used: 30, logged_on: '2026-02-21' },
    { id: 'u4', project_id: 'p2', employee_id: 'e3', hours_used: 80, logged_on: '2026-02-18' },
    { id: 'u5', project_id: 'p2', employee_id: 'e7', hours_used: 140, logged_on: '2026-02-20' },
    { id: 'u6', project_id: 'p2', employee_id: 'e9', hours_used: 50, logged_on: '2026-02-21' },
    { id: 'u7', project_id: 'p3', employee_id: 'e5', hours_used: 60, logged_on: '2026-02-15' },
    { id: 'u8', project_id: 'p3', employee_id: 'e2', hours_used: 50, logged_on: '2026-02-16' },
    { id: 'u9', project_id: 'p3', employee_id: 'e8', hours_used: 80, logged_on: '2026-02-20' },
    { id: 'u10', project_id: 'p4', employee_id: 'e3', hours_used: 80, logged_on: '2026-02-22' },
    { id: 'u11', project_id: 'p4', employee_id: 'e11', hours_used: 80, logged_on: '2026-02-23' },
    { id: 'u12', project_id: 'p4', employee_id: 'e9', hours_used: 40, logged_on: '2026-02-24' },
    { id: 'u13', project_id: 'p6', employee_id: 'e5', hours_used: 50, logged_on: '2026-02-19' },
    { id: 'u14', project_id: 'p6', employee_id: 'e11', hours_used: 60, logged_on: '2026-02-20' },
    { id: 'u15', project_id: 'p6', employee_id: 'e3', hours_used: 40, logged_on: '2026-02-21' },
    { id: 'u16', project_id: 'p7', employee_id: 'e10', hours_used: 80, logged_on: '2026-02-05' },
    { id: 'u17', project_id: 'p7', employee_id: 'e12', hours_used: 30, logged_on: '2026-02-06' },
    { id: 'u18', project_id: 'p8', employee_id: 'e1', hours_used: 120, logged_on: '2026-02-18' },
    { id: 'u19', project_id: 'p8', employee_id: 'e4', hours_used: 140, logged_on: '2026-02-19' },
    { id: 'u20', project_id: 'p8', employee_id: 'e9', hours_used: 105, logged_on: '2026-02-20' },
  ],
  dependencies: [
    { id: 'd1', project_id: 'p2', depends_on_project_id: 'p1' },
    { id: 'd2', project_id: 'p3', depends_on_project_id: 'p1' },
    { id: 'd3', project_id: 'p5', depends_on_project_id: 'p1' },
    { id: 'd4', project_id: 'p6', depends_on_project_id: 'p4' },
    { id: 'd5', project_id: 'p7', depends_on_project_id: 'p5' },
    { id: 'd6', project_id: 'p9', depends_on_project_id: 'p2' },
    { id: 'd7', project_id: 'p9', depends_on_project_id: 'p3' },
    { id: 'd8', project_id: 'p8', depends_on_project_id: 'p1' },
    { id: 'd9', project_id: 'p10', depends_on_project_id: 'p8' },
    { id: 'd10', project_id: 'p11', depends_on_project_id: 'p4' },
  ],
  deliverables: [
    { id: 'dl1', project_id: 'p1', title: 'Identity tenant architecture approved', description: 'Target tenant model, zones, break-glass policy, and regional constraints.', due_date: '2026-01-30', assigned_employee_id: 'e1', status: 'completed' },
    { id: 'dl2', project_id: 'p1', title: 'Policy engine integration contract', description: 'Canonical authz contract consumed by finance, mobile, compliance, and API gateway teams.', due_date: '2026-03-15', assigned_employee_id: 'e6', status: 'in_progress' },
    { id: 'dl3', project_id: 'p1', title: 'Federated SSO pilot cutover', description: 'Pilot migration for workforce and customer identity cohorts.', due_date: '2026-04-20', assigned_employee_id: 'e9', status: 'pending' },
    { id: 'dl4', project_id: 'p2', title: 'Global chart of accounts mapping', description: 'Map regional ledgers into harmonized account structures.', due_date: '2026-03-10', assigned_employee_id: 'e7', status: 'completed' },
    { id: 'dl5', project_id: 'p2', title: 'ERP authorization rules configured', description: 'Finance role model wired to identity policy decisions.', due_date: '2026-04-05', assigned_employee_id: 'e7', status: 'in_progress' },
    { id: 'dl6', project_id: 'p2', title: 'Month-end close simulation', description: 'Dry run with consolidated ledger, approvals, and audit exports.', due_date: '2026-06-15', assigned_employee_id: 'e3', status: 'pending' },
    { id: 'dl7', project_id: 'p3', title: 'Offline work-order sync prototype', description: 'Conflict handling, retries, and local queue persistence.', due_date: '2026-04-10', assigned_employee_id: 'e8', status: 'pending' },
    { id: 'dl8', project_id: 'p3', title: 'Supervisor approval workflow', description: 'Mobile sign-off flow aligned with ERP approvals.', due_date: '2026-05-05', assigned_employee_id: 'e2', status: 'pending' },
    { id: 'dl9', project_id: 'p3', title: 'Field telemetry dashboard feed', description: 'Stream mobile health and adoption signals to analytics.', due_date: '2026-06-01', assigned_employee_id: 'e8', status: 'pending' },
    { id: 'dl10', project_id: 'p4', title: 'Customer domain data product', description: 'Certified customer profile model with ownership and lineage.', due_date: '2026-03-20', assigned_employee_id: 'e3', status: 'completed' },
    { id: 'dl11', project_id: 'p4', title: 'Governed feature store contract', description: 'Feature definitions, access controls, and lineage hooks for AI consumers.', due_date: '2026-04-18', assigned_employee_id: 'e11', status: 'in_progress' },
    { id: 'dl12', project_id: 'p4', title: 'Finance data quality scorecards', description: 'Exception reporting for ledger migration and close readiness.', due_date: '2026-05-20', assigned_employee_id: 'e9', status: 'pending' },
    { id: 'dl13', project_id: 'p5', title: 'Control evidence taxonomy', description: 'Normalized evidence catalog across SOC2, SOX, privacy, and vendor risk.', due_date: '2026-03-25', assigned_employee_id: 'e10', status: 'pending' },
    { id: 'dl14', project_id: 'p5', title: 'Automated access review package', description: 'Evidence workflow sourcing identity and ERP authorization state.', due_date: '2026-05-12', assigned_employee_id: 'e6', status: 'pending' },
    { id: 'dl15', project_id: 'p5', title: 'Auditor self-service workspace', description: 'Controlled evidence portal and attestation history.', due_date: '2026-07-20', assigned_employee_id: 'e12', status: 'pending' },
    { id: 'dl16', project_id: 'p6', title: 'Retrieval quality benchmark', description: 'Question set, acceptance scoring, and hallucination guardrails.', due_date: '2026-03-30', assigned_employee_id: 'e11', status: 'completed' },
    { id: 'dl17', project_id: 'p6', title: 'Governed knowledge index', description: 'Index pipeline for approved data products and policy-aware document sources.', due_date: '2026-04-30', assigned_employee_id: 'e11', status: 'pending' },
    { id: 'dl18', project_id: 'p6', title: 'Role-aware assistant pilot', description: 'Pilot chatbot answers constrained by identity roles and data entitlements.', due_date: '2026-06-10', assigned_employee_id: 'e3', status: 'pending' },
    { id: 'dl19', project_id: 'p7', title: 'Supplier questionnaire v2', description: 'Control mapping and residual risk scoring for onboarding.', due_date: '2026-03-18', assigned_employee_id: 'e10', status: 'completed' },
    { id: 'dl20', project_id: 'p7', title: 'Vendor evidence ingestion', description: 'Evidence ingestion aligned to automated controls taxonomy.', due_date: '2026-05-01', assigned_employee_id: 'e12', status: 'pending' },
    { id: 'dl21', project_id: 'p7', title: 'Residual risk approval board workflow', description: 'Executive review and exception approval path.', due_date: '2026-06-10', assigned_employee_id: 'e10', status: 'pending' },
    { id: 'dl22', project_id: 'p8', title: 'Gateway inventory reconciled', description: 'All public, partner, and internal API gateways mapped to owners.', due_date: '2026-01-25', assigned_employee_id: 'e9', status: 'completed' },
    { id: 'dl23', project_id: 'p8', title: 'Unified policy enforcement proxy', description: 'Shared gateway policy consuming the identity authorization contract.', due_date: '2026-03-28', assigned_employee_id: 'e4', status: 'in_progress' },
    { id: 'dl24', project_id: 'p8', title: 'API observability rollout', description: 'Gateway latency, error budgets, and consumer attribution dashboards.', due_date: '2026-04-22', assigned_employee_id: 'e9', status: 'pending' },
    { id: 'dl25', project_id: 'p9', title: 'Role impact assessment', description: 'Enterprise role-by-role change impact map for field, finance, and compliance teams.', due_date: '2026-04-08', assigned_employee_id: 'e12', status: 'pending' },
    { id: 'dl26', project_id: 'p9', title: 'Cutover training paths', description: 'Audience-specific training plans tied to ERP and mobile readiness.', due_date: '2026-06-01', assigned_employee_id: 'e2', status: 'pending' },
    { id: 'dl27', project_id: 'p9', title: 'Adoption telemetry executive pack', description: 'Adoption scorecards for leadership and regional deployment teams.', due_date: '2026-07-10', assigned_employee_id: 'e12', status: 'pending' },
    { id: 'dl28', project_id: 'p10', title: 'Customer success journey map', description: 'Not-started discovery artifact for target account teams and customer roles.', due_date: '2026-05-10', assigned_employee_id: 'e4', status: 'pending' },
    { id: 'dl29', project_id: 'p10', title: 'Portal integration spike plan', description: 'Scope candidate integrations with identity and API gateway teams.', due_date: '2026-06-05', assigned_employee_id: 'e6', status: 'pending' },
    { id: 'dl30', project_id: 'p11', title: 'Plant quality KPI catalog', description: 'Define initial defect, yield, and supplier traceability metrics.', due_date: '2026-05-20', assigned_employee_id: 'e7', status: 'pending' },
    { id: 'dl31', project_id: 'p11', title: 'Manufacturing data readiness review', description: 'Assess site-level source availability before implementation starts.', due_date: '2026-06-12', assigned_employee_id: 'e8', status: 'pending' },
  ],
  // Cross-project dependency graph designed to show enterprise blockers:
  // identity policy -> finance/API/compliance, data mesh -> AI/compliance,
  // finance/mobile readiness -> change enablement. Non-completed upstream work
  // auto-stalls downstream deliverables and demotes affected project RAG.
  deliverable_dependencies: [
    { id: 'dd1', deliverable_id: 'dl5', depends_on_deliverable_id: 'dl2' },
    { id: 'dd2', deliverable_id: 'dl23', depends_on_deliverable_id: 'dl2' },
    { id: 'dd3', deliverable_id: 'dl14', depends_on_deliverable_id: 'dl2' },
    { id: 'dd4', deliverable_id: 'dl17', depends_on_deliverable_id: 'dl11' },
    { id: 'dd5', deliverable_id: 'dl18', depends_on_deliverable_id: 'dl17' },
    { id: 'dd6', deliverable_id: 'dl20', depends_on_deliverable_id: 'dl13' },
    { id: 'dd7', deliverable_id: 'dl15', depends_on_deliverable_id: 'dl20' },
    { id: 'dd8', deliverable_id: 'dl7', depends_on_deliverable_id: 'dl23' },
    { id: 'dd9', deliverable_id: 'dl8', depends_on_deliverable_id: 'dl5' },
    { id: 'dd10', deliverable_id: 'dl25', depends_on_deliverable_id: 'dl6' },
    { id: 'dd11', deliverable_id: 'dl26', depends_on_deliverable_id: 'dl8' },
    { id: 'dd12', deliverable_id: 'dl27', depends_on_deliverable_id: 'dl18' },
  ],
};

let currentUserId = null;

// --- Derivation helpers ----------------------------------------------------
const rateOf = (empId) => db.employees.find((e) => e.id === empId)?.hourly_rate ?? 0;

// Recompute auto-stalled status for every deliverable, mirroring the DB triggers.
// A non-completed deliverable is 'stalled' when any upstream dependency is not yet
// completed; a stalled deliverable recovers to 'in_progress' once fully unblocked.
// Iterates to a fixpoint so stalls propagate through the (acyclic) dependency tree.
function recomputeStalled() {
  let changed = true;
  let guard = 0;
  while (changed && guard < 100) {
    changed = false;
    guard += 1;
    db.deliverables.forEach((d) => {
      if (d.status === 'completed') return;
      const hasBlocking = db.deliverable_dependencies
        .filter((e) => e.deliverable_id === d.id)
        .some((e) => {
          const up = db.deliverables.find((x) => x.id === e.depends_on_deliverable_id);
          return up && up.status !== 'completed';
        });
      if (hasBlocking && d.status !== 'stalled') {
        d.status = 'stalled';
        changed = true;
      } else if (!hasBlocking && d.status === 'stalled') {
        d.status = 'in_progress';
        changed = true;
      }
    });
  }
}

function demoteRag(status, stalledCount) {
  if (!stalledCount) return status;
  if (status === 'Green') return 'Amber';
  if (status === 'Amber') return 'Red';
  return status;
}

function wouldCreateDeliverableCycle(deliverableId, dependsOnId, excludeId = null) {
  const graph = new Map();
  db.deliverable_dependencies.forEach((e) => {
    if (excludeId && e.id === excludeId) return;
    if (!graph.has(e.deliverable_id)) graph.set(e.deliverable_id, []);
    graph.get(e.deliverable_id).push(e.depends_on_deliverable_id);
  });
  if (!graph.has(deliverableId)) graph.set(deliverableId, []);
  graph.get(deliverableId).push(dependsOnId);

  const visited = new Set();
  const stack = [dependsOnId];
  while (stack.length) {
    const node = stack.pop();
    if (node === deliverableId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    (graph.get(node) || []).forEach((n) => stack.push(n));
  }
  return false;
}

function depNode(edge, deliverableId, direction) {
  const otherId = direction === 'up' ? edge.depends_on_deliverable_id : edge.deliverable_id;
  const other = db.deliverables.find((x) => x.id === otherId);
  if (!other) return null;
  const project = db.projects.find((p) => p.id === other.project_id) || null;
  return {
    dependency_id: edge.id,
    id: other.id,
    title: other.title,
    status: other.status,
    project_id: other.project_id,
    project_name: project ? project.name : null,
  };
}

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
  const stalledCount = deliverables.filter((d) => d.status === 'stalled').length;
  // Cross-project blocking impact: distinct downstream deliverables in OTHER projects
  // blocked by this project's incomplete work.
  const blockingImpact = new Set();
  deliverables
    .filter((d) => d.status !== 'completed')
    .forEach((up) => {
      db.deliverable_dependencies
        .filter((e) => e.depends_on_deliverable_id === up.id)
        .forEach((e) => {
          const down = db.deliverables.find((x) => x.id === e.deliverable_id);
          if (down && down.project_id !== p.id) blockingImpact.add(down.id);
        });
    });
  return {
    ...p,
    allocated_hours,
    allocated_cost,
    hours_used,
    budget_used,
    rag_status: demoteRag(r.status, stalledCount),
    progress_gap: Number(r.progressGap.toFixed(1)),
    burn_percent: Number(r.burn.toFixed(1)),
    budget_used_percent: Number(r.budgetUsedPercent.toFixed(1)),
    hours_used_percent: Number(r.hoursUsedPercent.toFixed(1)),
    team_size: new Set(allocs.map((a) => a.employee_id)).size,
    manager_count: managerIds.size,
    deliverable_count: deliverables.length,
    completed_deliverable_count: deliverables.filter((d) => d.status === 'completed').length,
    stalled_deliverable_count: stalledCount,
    blocking_impact_count: blockingImpact.size,
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
  const blocked_by = db.deliverable_dependencies
    .filter((e) => e.deliverable_id === d.id)
    .map((e) => depNode(e, d.id, 'up'))
    .filter(Boolean);
  const blocks = db.deliverable_dependencies
    .filter((e) => e.depends_on_deliverable_id === d.id)
    .map((e) => depNode(e, d.id, 'down'))
    .filter(Boolean);
  return {
    ...d,
    employee_id: d.assigned_employee_id,
    employee,
    project: project ? { id: project.id, name: project.name, stage: project.stage } : null,
    blocked_by,
    blocks,
    blocks_count: blocks.length,
    is_blocked: blocked_by.some((node) => node.status !== 'completed'),
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
    recomputeStalled();
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
    db.deliverable_dependencies = db.deliverable_dependencies.filter(
      (e) => !removedDeliverableIds.has(e.deliverable_id) && !removedDeliverableIds.has(e.depends_on_deliverable_id),
    );
    recomputeStalled();
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
    recomputeStalled();
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
    const assignedEmployeeId = hasAssignee
      ? payload.employee_id ?? payload.assigned_employee_id ?? null
      : d.assigned_employee_id;
    assertDeliverableAssignment(d.project_id, assignedEmployeeId);
    Object.assign(d, payload, {
      assigned_employee_id: assignedEmployeeId || null,
      status: payload.status || d.status,
    });
    delete d.employee_id;
    recomputeStalled();
    return deriveDeliverable(d);
  },
  async deleteDeliverable(id) {
    await delay();
    const deliverable = db.deliverables.find((x) => x.id === id);
    if (!deliverable) throw notFound('Deliverable');
    assertCanLeadProject(deliverable.project_id);
    db.deliverables = db.deliverables.filter((x) => x.id !== id);
    db.deliverable_dependencies = db.deliverable_dependencies.filter(
      (e) => e.deliverable_id !== id && e.depends_on_deliverable_id !== id,
    );
    recomputeStalled();
    return { ok: true };
  },

  // Deliverable dependencies
  async listDeliverableDependencies(deliverableId) {
    await delay();
    return clone(
      db.deliverable_dependencies.filter(
        (e) => !deliverableId || e.deliverable_id === deliverableId,
      ),
    );
  },
  async createDeliverableDependency(payload) {
    await delay();
    const { deliverable_id: deliverableId, depends_on_deliverable_id: dependsOnId } = payload;
    const dependent = db.deliverables.find((x) => x.id === deliverableId);
    if (!dependent) throw notFound('Deliverable');
    if (!db.deliverables.find((x) => x.id === dependsOnId)) throw notFound('Upstream deliverable');
    assertCanLeadProject(dependent.project_id);
    if (deliverableId === dependsOnId) {
      const err = new Error('A deliverable cannot depend on itself.');
      err.status = 400;
      throw err;
    }
    if (db.deliverable_dependencies.some((e) => e.deliverable_id === deliverableId && e.depends_on_deliverable_id === dependsOnId)) {
      const err = new Error('Dependency already exists.');
      err.status = 400;
      throw err;
    }
    if (wouldCreateDeliverableCycle(deliverableId, dependsOnId)) {
      const err = new Error('Circular deliverable dependency detected.');
      err.status = 400;
      throw err;
    }
    const edge = { id: uid(), deliverable_id: deliverableId, depends_on_deliverable_id: dependsOnId };
    db.deliverable_dependencies.push(edge);
    recomputeStalled();
    return clone(edge);
  },
  async updateDeliverableDependency(id, payload) {
    await delay();
    const edge = db.deliverable_dependencies.find((x) => x.id === id);
    if (!edge) throw notFound('Dependency');
    const dependent = db.deliverables.find((x) => x.id === edge.deliverable_id);
    assertCanLeadProject(dependent.project_id);
    const deliverableId = payload.deliverable_id ?? edge.deliverable_id;
    const dependsOnId = payload.depends_on_deliverable_id ?? edge.depends_on_deliverable_id;
    if (deliverableId === dependsOnId) {
      const err = new Error('A deliverable cannot depend on itself.');
      err.status = 400;
      throw err;
    }
    if (wouldCreateDeliverableCycle(deliverableId, dependsOnId, id)) {
      const err = new Error('Circular deliverable dependency detected.');
      err.status = 400;
      throw err;
    }
    edge.deliverable_id = deliverableId;
    edge.depends_on_deliverable_id = dependsOnId;
    recomputeStalled();
    return clone(edge);
  },
  async deleteDeliverableDependency(id) {
    await delay();
    const edge = db.deliverable_dependencies.find((x) => x.id === id);
    if (!edge) throw notFound('Dependency');
    const dependent = db.deliverables.find((x) => x.id === edge.deliverable_id);
    if (dependent) assertCanLeadProject(dependent.project_id);
    db.deliverable_dependencies = db.deliverable_dependencies.filter((x) => x.id !== id);
    recomputeStalled();
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
    const totalAllocatedBudget = projects.reduce((s, p) => s + p.allocated_budget, 0);
    const totalBudgetUsed = projects.reduce((s, p) => s + p.budget_used, 0);
    const totalAllocatedHours = projects.reduce((s, p) => s + p.allocated_hours, 0);
    const totalHoursUsed = projects.reduce((s, p) => s + p.hours_used, 0);

    const scopedDeliverableIds = new Set(scopedDeliverables.map((d) => d.id));
    const impactMap = new Map();
    db.deliverable_dependencies.forEach((e) => {
      const up = db.deliverables.find((x) => x.id === e.depends_on_deliverable_id);
      const down = db.deliverables.find((x) => x.id === e.deliverable_id);
      if (!up || !down) return;
      if (up.status === 'completed') return;
      if (up.project_id === down.project_id) return;
      if (!scopedDeliverableIds.has(down.id)) return;
      if (!impactMap.has(down.project_id)) impactMap.set(down.project_id, new Set());
      impactMap.get(down.project_id).add(down.id);
    });
    const impactedProjects = Array.from(impactMap, ([projectId, downSet]) => {
      const project = projects.find((p) => p.id === projectId) || db.projects.find((p) => p.id === projectId);
      return {
        id: projectId,
        name: project ? project.name : 'Unknown',
        rag_status: project ? deriveProject(db.projects.find((p) => p.id === projectId)).rag_status : 'Green',
        blocked_deliverable_count: downSet.size,
      };
    }).sort((a, b) => b.blocked_deliverable_count - a.blocked_deliverable_count || a.name.localeCompare(b.name));
    const stallsImpactingOtherProjects = impactedProjects.reduce((s, p) => s + p.blocked_deliverable_count, 0);

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
      stalls_impacting_other_projects: stallsImpactingOtherProjects,
      impacted_projects: impactedProjects,
      at_risk_projects: projects.filter((p) => p.rag_status === 'Red'),
      projects,
    };
  },
};

// Normalize seed data so stalled propagation is reflected before the first read.
recomputeStalled();

function notFound(what) {
  const err = new Error(`${what} not found.`);
  err.status = 404;
  return err;
}
