-- ACME Budget & Resource Tracker — project deliverables

DO $$ BEGIN
    CREATE TYPE deliverable_status AS ENUM ('pending', 'in_progress', 'completed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_deliverables (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title                   VARCHAR(255) NOT NULL,
    description             TEXT,
    due_date                DATE NOT NULL,
    assigned_employee_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
    status                  deliverable_status NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_project ON project_deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_employee ON project_deliverables(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_status ON project_deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_due_date ON project_deliverables(due_date);

DROP TRIGGER IF EXISTS trg_deliverables_updated_at ON project_deliverables;
CREATE TRIGGER trg_deliverables_updated_at
    BEFORE UPDATE ON project_deliverables
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP VIEW IF EXISTS v_portfolio_dashboard;
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
    (SELECT COUNT(*) FROM project_deliverables pdv WHERE pdv.project_id = p.id) AS deliverable_count,
    (
        SELECT COUNT(*)
        FROM project_deliverables pdv
        WHERE pdv.project_id = p.id AND pdv.status = 'completed'
    ) AS completed_deliverable_count,
    p.start_date,
    p.end_date,
    p.project_manager_id
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;

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
    (SELECT COUNT(*) FROM employees WHERE is_active = TRUE) AS active_employee_count,
    (SELECT COUNT(*) FROM project_deliverables) AS total_deliverables,
    (SELECT COUNT(*) FROM project_deliverables WHERE status = 'completed') AS completed_deliverables,
    (SELECT COUNT(*) FROM project_deliverables WHERE assigned_employee_id IS NULL) AS unassigned_deliverables
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;
