-- ACME Budget & Resource Tracker — reporting views

DROP VIEW IF EXISTS v_portfolio_dashboard;
DROP VIEW IF EXISTS v_employee_allocation_summary;
DROP VIEW IF EXISTS v_project_summary;

CREATE OR REPLACE VIEW v_project_summary AS
SELECT
    p.id AS project_id,
    p.name,
    p.stage,
    p.actual_completion_percent,
    p.rag_status,
    p.rag_progress_gap,
    pb.allocated_budget,
    pb.budget_used,
    CASE
        WHEN pb.allocated_budget > 0
        THEN ROUND((pb.budget_used / pb.allocated_budget) * 100, 2)
        ELSE 0
    END AS budget_used_percent,
    fn_project_allocated_hours(p.id) AS allocated_hours,
    fn_project_hours_used(p.id) AS hours_used,
    CASE
        WHEN fn_project_allocated_hours(p.id) > 0
        THEN ROUND((fn_project_hours_used(p.id) / fn_project_allocated_hours(p.id)) * 100, 2)
        ELSE 0
    END AS hours_used_percent,
    (SELECT COUNT(*) FROM project_resource_allocations pra WHERE pra.project_id = p.id) AS allocation_count,
    (
        CASE WHEN p.project_manager_id IS NULL THEN 0 ELSE 1 END
        + (SELECT COUNT(*) FROM project_resource_allocations pra WHERE pra.project_id = p.id AND pra.role_on_project = 'manager')
    ) AS manager_count,
    (SELECT COUNT(*) FROM project_dependencies pd WHERE pd.project_id = p.id) AS dependency_count,
    p.start_date,
    p.end_date,
    p.project_manager_id
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;

CREATE OR REPLACE VIEW v_employee_allocation_summary AS
SELECT
    e.id AS employee_id,
    e.first_name,
    e.last_name,
    e.email,
    e.role,
    e.department,
    e.is_direct_staff,
    e.work_location,
    e.weekly_capacity_hours,
    COALESCE(SUM(pra.allocated_hours), 0) AS total_allocated_hours,
    CASE
        WHEN e.weekly_capacity_hours > 0
        THEN ROUND((COALESCE(SUM(pra.allocated_hours), 0) / e.weekly_capacity_hours) * 100, 2)
        ELSE 0
    END AS allocation_percent,
    COALESCE(SUM(pra.allocated_hours), 0) > e.weekly_capacity_hours AS is_overallocated,
    COUNT(DISTINCT pra.project_id) AS project_count
FROM employees e
LEFT JOIN project_resource_allocations pra ON pra.employee_id = e.id
WHERE e.is_active = TRUE
GROUP BY e.id, e.first_name, e.last_name, e.email, e.role, e.department, e.is_direct_staff, e.work_location, e.weekly_capacity_hours;

CREATE OR REPLACE VIEW v_portfolio_dashboard AS
SELECT
    COUNT(*) AS total_projects,
    COUNT(*) FILTER (WHERE stage = 'active') AS active_projects,
    COUNT(*) FILTER (WHERE rag_status = 'green') AS green_projects,
    COUNT(*) FILTER (WHERE rag_status = 'amber') AS amber_projects,
    COUNT(*) FILTER (WHERE rag_status = 'red') AS red_projects,
    COALESCE(SUM(pb.allocated_budget), 0) AS total_allocated_budget,
    COALESCE(SUM(pb.budget_used), 0) AS total_budget_used,
    COALESCE((
        SELECT SUM(pra.allocated_hours)
        FROM project_resource_allocations pra
    ), 0) AS total_allocated_hours,
    COALESCE((
        SELECT SUM(pru.hours_used)
        FROM project_resource_usage pru
    ), 0) AS total_hours_used,
    (SELECT COUNT(*) FROM v_employee_allocation_summary WHERE is_overallocated = TRUE) AS overallocated_employee_count,
    (SELECT COUNT(*) FROM employees WHERE is_active = TRUE) AS active_employee_count
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;
