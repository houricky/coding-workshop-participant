-- ACME Budget & Resource Tracker — deliverable dependency graph and stalled status automation

ALTER TYPE deliverable_status ADD VALUE IF NOT EXISTS 'stalled';

CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable_id              UUID NOT NULL REFERENCES project_deliverables(id) ON DELETE CASCADE,
    depends_on_deliverable_id   UUID NOT NULL REFERENCES project_deliverables(id) ON DELETE CASCADE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (deliverable_id <> depends_on_deliverable_id),
    UNIQUE (deliverable_id, depends_on_deliverable_id)
);

CREATE INDEX IF NOT EXISTS idx_deliverable_dependencies_deliverable
    ON deliverable_dependencies(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_dependencies_depends_on
    ON deliverable_dependencies(depends_on_deliverable_id);

CREATE OR REPLACE FUNCTION fn_deliverable_dep_has_cycle(
    p_deliverable_id UUID,
    p_depends_on_deliverable_id UUID,
    p_exclude_dependency_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_cycle BOOLEAN := FALSE;
BEGIN
    WITH RECURSIVE walk(node_id) AS (
        SELECT p_depends_on_deliverable_id
        UNION
        SELECT dd.depends_on_deliverable_id
        FROM deliverable_dependencies dd
        JOIN walk w ON w.node_id = dd.deliverable_id
        WHERE p_exclude_dependency_id IS NULL OR dd.id <> p_exclude_dependency_id
    )
    SELECT EXISTS (
        SELECT 1
        FROM walk
        WHERE node_id = p_deliverable_id
    ) INTO v_has_cycle;

    RETURN COALESCE(v_has_cycle, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_validate_deliverable_dependency()
RETURNS TRIGGER AS $$
BEGIN
    IF fn_deliverable_dep_has_cycle(NEW.deliverable_id, NEW.depends_on_deliverable_id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END) THEN
        RAISE EXCEPTION 'Circular deliverable dependency detected';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_recalculate_deliverable_status(p_deliverable_id UUID)
RETURNS VOID AS $$
DECLARE
    v_current_status deliverable_status;
    v_is_blocked BOOLEAN := FALSE;
BEGIN
    SELECT status
    INTO v_current_status
    FROM project_deliverables
    WHERE id = p_deliverable_id;

    IF v_current_status IS NULL OR v_current_status = 'completed' THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM deliverable_dependencies dd
        JOIN project_deliverables upstream ON upstream.id = dd.depends_on_deliverable_id
        WHERE dd.deliverable_id = p_deliverable_id
          AND upstream.status <> 'completed'
    ) INTO v_is_blocked;

    IF v_is_blocked AND v_current_status <> 'stalled' THEN
        UPDATE project_deliverables
        SET status = 'stalled'
        WHERE id = p_deliverable_id;
    ELSIF NOT v_is_blocked AND v_current_status = 'stalled' THEN
        UPDATE project_deliverables
        SET status = 'in_progress'
        WHERE id = p_deliverable_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_recalculate_impacted_deliverables(p_root_deliverable_id UUID)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN
        WITH RECURSIVE impacted(deliverable_id) AS (
            SELECT dd.deliverable_id
            FROM deliverable_dependencies dd
            WHERE dd.depends_on_deliverable_id = p_root_deliverable_id
            UNION
            SELECT dd.deliverable_id
            FROM deliverable_dependencies dd
            JOIN impacted i ON i.deliverable_id = dd.depends_on_deliverable_id
        )
        SELECT DISTINCT deliverable_id FROM impacted
    LOOP
        PERFORM fn_recalculate_deliverable_status(v_item.deliverable_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_deliverable_dependency_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalculate_deliverable_status(OLD.deliverable_id);
        PERFORM fn_recalculate_impacted_deliverables(OLD.deliverable_id);
        RETURN OLD;
    END IF;

    PERFORM fn_recalculate_deliverable_status(NEW.deliverable_id);
    PERFORM fn_recalculate_impacted_deliverables(NEW.deliverable_id);

    IF TG_OP = 'UPDATE' AND OLD.deliverable_id <> NEW.deliverable_id THEN
        PERFORM fn_recalculate_deliverable_status(OLD.deliverable_id);
        PERFORM fn_recalculate_impacted_deliverables(OLD.deliverable_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_deliverable_status_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM fn_recalculate_impacted_deliverables(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_deliverable_dependency ON deliverable_dependencies;
CREATE TRIGGER trg_validate_deliverable_dependency
    BEFORE INSERT OR UPDATE ON deliverable_dependencies
    FOR EACH ROW EXECUTE PROCEDURE fn_validate_deliverable_dependency();

DROP TRIGGER IF EXISTS trg_deliverable_dependency_changed ON deliverable_dependencies;
CREATE TRIGGER trg_deliverable_dependency_changed
    AFTER INSERT OR UPDATE OR DELETE ON deliverable_dependencies
    FOR EACH ROW EXECUTE PROCEDURE fn_deliverable_dependency_changed();

DROP TRIGGER IF EXISTS trg_deliverable_status_changed ON project_deliverables;
CREATE TRIGGER trg_deliverable_status_changed
    AFTER UPDATE OF status ON project_deliverables
    FOR EACH ROW EXECUTE PROCEDURE fn_deliverable_status_changed();

CREATE OR REPLACE FUNCTION fn_calculate_rag(p_project_id UUID)
RETURNS TABLE(rag_status rag_status, progress_gap NUMERIC) AS $$
DECLARE
    v_allocated_budget NUMERIC;
    v_budget_used NUMERIC;
    v_allocated_hours NUMERIC;
    v_hours_used NUMERIC;
    v_completion NUMERIC;
    v_budget_pct NUMERIC := 0;
    v_hours_pct NUMERIC := 0;
    v_gap NUMERIC;
    v_status rag_status;
    v_stalled_count INTEGER := 0;
BEGIN
    SELECT pb.allocated_budget, pb.budget_used
    INTO v_allocated_budget, v_budget_used
    FROM project_budgets pb
    WHERE pb.project_id = p_project_id;

    v_allocated_hours := fn_project_allocated_hours(p_project_id);
    v_hours_used := fn_project_hours_used(p_project_id);

    SELECT p.actual_completion_percent
    INTO v_completion
    FROM projects p
    WHERE p.id = p_project_id;

    IF v_completion IS NULL THEN
        v_completion := 0;
    END IF;

    IF v_allocated_budget IS NOT NULL AND v_allocated_budget > 0 THEN
        v_budget_pct := (v_budget_used / v_allocated_budget) * 100;
    END IF;

    IF v_allocated_hours > 0 THEN
        v_hours_pct := (v_hours_used / v_allocated_hours) * 100;
    END IF;

    v_gap := GREATEST(v_budget_pct, v_hours_pct) - v_completion;

    IF v_gap <= 10 THEN
        v_status := 'green';
    ELSIF v_gap <= 25 THEN
        v_status := 'amber';
    ELSE
        v_status := 'red';
    END IF;

    SELECT COUNT(*)
    INTO v_stalled_count
    FROM project_deliverables pd
    WHERE pd.project_id = p_project_id
      AND pd.status = 'stalled';

    IF v_stalled_count > 0 THEN
        IF v_status = 'green' THEN
            v_status := 'amber';
        ELSIF v_status = 'amber' THEN
            v_status := 'red';
        END IF;
    END IF;

    rag_status := v_status;
    progress_gap := ROUND(v_gap, 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

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
    p.project_manager_id,
    (
        SELECT COUNT(*)
        FROM project_deliverables pdv
        WHERE pdv.project_id = p.id AND pdv.status = 'stalled'
    ) AS stalled_deliverable_count
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
    (SELECT COUNT(*) FROM project_deliverables WHERE assigned_employee_id IS NULL) AS unassigned_deliverables,
    (SELECT COUNT(*) FROM project_deliverables WHERE status = 'stalled') AS stalled_deliverables
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;
