-- ACME Budget & Resource Tracker — demo seed data (idempotent)

-- Demo employees
INSERT INTO employees (id, first_name, last_name, email, job_title, department, hourly_rate, weekly_capacity_hours)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'Alice', 'Johnson', 'alice@acme.com', 'Senior Developer', 'Engineering', 85.00, 40),
    ('11111111-1111-1111-1111-111111111102', 'Bob', 'Smith', 'bob@acme.com', 'Project Manager', 'PMO', 95.00, 40),
    ('11111111-1111-1111-1111-111111111103', 'Carol', 'Davis', 'carol@acme.com', 'UX Designer', 'Design', 75.00, 40)
ON CONFLICT (id) DO NOTHING;

-- Demo projects
INSERT INTO projects (id, name, description, stage, actual_completion_percent, project_manager_id, start_date, end_date)
VALUES
    ('22222222-2222-2222-2222-222222222201', 'Platform Modernization', 'Migrate legacy systems to cloud', 'active', 45.00,
     '11111111-1111-1111-1111-111111111102', '2025-01-01', '2025-12-31'),
    ('22222222-2222-2222-2222-222222222202', 'Customer Portal', 'Self-service customer portal MVP', 'active', 30.00,
     '11111111-1111-1111-1111-111111111102', '2025-03-01', '2025-09-30'),
    ('22222222-2222-2222-2222-222222222203', 'Data Warehouse', 'Centralized analytics platform', 'planning', 10.00,
     '11111111-1111-1111-1111-111111111102', '2025-06-01', '2026-06-30')
ON CONFLICT (id) DO NOTHING;

-- Demo budgets
INSERT INTO project_budgets (id, project_id, allocated_budget, budget_used, currency)
VALUES
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 500000.00, 0, 'USD'),
    ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', 250000.00, 0, 'USD'),
    ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222203', 750000.00, 0, 'USD')
ON CONFLICT (id) DO NOTHING;

-- Demo allocations
INSERT INTO project_resource_allocations (id, project_id, employee_id, allocated_hours, hourly_rate_snapshot, role_on_project)
VALUES
    ('44444444-4444-4444-4444-444444444401', '22222222-2222-2222-2222-222222222201',
     '11111111-1111-1111-1111-111111111101', 800.00, 85.00, 'Lead Developer'),
    ('44444444-4444-4444-4444-444444444402', '22222222-2222-2222-2222-222222222201',
     '11111111-1111-1111-1111-111111111103', 400.00, 75.00, 'Designer'),
    ('44444444-4444-4444-4444-444444444403', '22222222-2222-2222-2222-222222222202',
     '11111111-1111-1111-1111-111111111101', 600.00, 85.00, 'Developer'),
    ('44444444-4444-4444-4444-444444444404', '22222222-2222-2222-2222-222222222202',
     '11111111-1111-1111-1111-111111111103', 300.00, 75.00, 'Designer')
ON CONFLICT (id) DO NOTHING;

-- Demo usage (triggers will update budget_used and RAG)
INSERT INTO project_resource_usage (id, project_id, employee_id, usage_date, hours_used, cost_amount, description)
VALUES
    ('55555555-5555-5555-5555-555555555501', '22222222-2222-2222-2222-222222222201',
     '11111111-1111-1111-1111-111111111101', '2025-05-01', 120.00, 10200.00, 'Sprint 1 development'),
    ('55555555-5555-5555-5555-555555555502', '22222222-2222-2222-2222-222222222201',
     '11111111-1111-1111-1111-111111111103', '2025-05-01', 60.00, 4500.00, 'UI mockups'),
    ('55555555-5555-5555-5555-555555555503', '22222222-2222-2222-2222-222222222202',
     '11111111-1111-1111-1111-111111111101', '2025-05-15', 80.00, 6800.00, 'API integration')
ON CONFLICT (id) DO NOTHING;

-- Demo admin user (password: admin123)
INSERT INTO app_users (id, email, password_hash, role, employee_id)
VALUES (
    '66666666-6666-6666-6666-666666666601',
    'admin@acme.com',
    '$2b$12$Kwh7pCYTqgrU7FH/1J2q.uUZzVXjcV4fL/fus3x3Z.NFY/xsA8xpW',
    'admin',
    '11111111-1111-1111-1111-111111111102'
)
ON CONFLICT (id) DO NOTHING;

-- Demo dependency
INSERT INTO project_dependencies (id, project_id, depends_on_project_id, dependency_type)
VALUES (
    '77777777-7777-7777-7777-777777777701',
    '22222222-2222-2222-2222-222222222203',
    '22222222-2222-2222-2222-222222222201',
    'finish_to_start'
)
ON CONFLICT (id) DO NOTHING;

-- Recalculate RAG for all demo projects
SELECT fn_update_project_rag(id) FROM projects;
