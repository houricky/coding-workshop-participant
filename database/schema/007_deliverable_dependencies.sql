-- ACME Budget & Resource Tracker — deliverable-to-deliverable dependencies + auto-stalled status

-- 1. Extend the deliverable status enum with an auto-computed 'stalled' state.
--    Guarded so repeated migrations do not error on the existing value.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'deliverable_status' AND e.enumlabel = 'stalled'
    ) THEN
        ALTER TYPE deliverable_status ADD VALUE 'stalled';
    END IF;
END $$;

-- 2. Cross-project deliverable dependency edges.
--    deliverable_id (dependent / downstream) depends on depends_on_deliverable_id (upstream blocker).
CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable_id              UUID NOT NULL REFERENCES project_deliverables(id) ON DELETE CASCADE,
    depends_on_deliverable_id   UUID NOT NULL REFERENCES project_deliverables(id) ON DELETE CASCADE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (deliverable_id != depends_on_deliverable_id),
    UNIQUE (deliverable_id, depends_on_deliverable_id)
);

CREATE INDEX IF NOT EXISTS idx_deliverable_deps_deliverable ON deliverable_dependencies(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_deps_upstream ON deliverable_dependencies(depends_on_deliverable_id);

-- 3. Cycle prevention: reject any edge that would create a cycle in the dependency graph.
CREATE OR REPLACE FUNCTION fn_deliverable_dep_no_cycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Walk upstream from the proposed blocker; if we reach the dependent, the edge closes a cycle.
    IF EXISTS (
        WITH RECURSIVE upstream AS (
            SELECT NEW.depends_on_deliverable_id AS node
            UNION
            SELECT dd.depends_on_deliverable_id
            FROM deliverable_dependencies dd
            JOIN upstream u ON dd.deliverable_id = u.node
        )
        SELECT 1 FROM upstream WHERE node = NEW.deliverable_id
    ) THEN
        RAISE EXCEPTION 'Circular deliverable dependency detected';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliverable_dep_no_cycle ON deliverable_dependencies;
CREATE TRIGGER trg_deliverable_dep_no_cycle
    BEFORE INSERT OR UPDATE ON deliverable_dependencies
    FOR EACH ROW EXECUTE PROCEDURE fn_deliverable_dep_no_cycle();

-- 4. Recompute the stalled state of a single deliverable.
--    Rule: a non-completed deliverable is 'stalled' when ANY upstream dependency is not yet completed
--    (i.e. pending, in_progress, or stalled). When all upstream dependencies complete, a stalled
--    deliverable recovers to 'in_progress'. Completed deliverables are never touched.
CREATE OR REPLACE FUNCTION fn_recalc_deliverable_stalled(p_deliverable_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status        deliverable_status;
    v_has_blocking  BOOLEAN;
BEGIN
    SELECT status INTO v_status
    FROM project_deliverables
    WHERE id = p_deliverable_id;

    IF v_status IS NULL OR v_status = 'completed' THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM deliverable_dependencies dd
        JOIN project_deliverables up ON up.id = dd.depends_on_deliverable_id
        WHERE dd.deliverable_id = p_deliverable_id
          AND up.status <> 'completed'
    ) INTO v_has_blocking;

    IF v_has_blocking AND v_status <> 'stalled' THEN
        UPDATE project_deliverables SET status = 'stalled' WHERE id = p_deliverable_id;
    ELSIF NOT v_has_blocking AND v_status = 'stalled' THEN
        -- Auto-recovery: stalled dependents return to in_progress once unblocked.
        UPDATE project_deliverables SET status = 'in_progress' WHERE id = p_deliverable_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Refresh the direct dependents of a deliverable. Transitive propagation happens because each
--    status change re-fires the deliverable status trigger, cascading down the (acyclic) graph.
CREATE OR REPLACE FUNCTION fn_recalc_downstream(p_deliverable_id UUID)
RETURNS VOID AS $$
DECLARE
    v_child UUID;
BEGIN
    FOR v_child IN
        SELECT deliverable_id
        FROM deliverable_dependencies
        WHERE depends_on_deliverable_id = p_deliverable_id
    LOOP
        PERFORM fn_recalc_deliverable_stalled(v_child);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger on deliverable status changes: refresh project RAG and cascade to dependents.
CREATE OR REPLACE FUNCTION fn_deliverable_status_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    PERFORM fn_update_project_rag(NEW.project_id);
    PERFORM fn_recalc_downstream(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliverable_status_changed ON project_deliverables;
CREATE TRIGGER trg_deliverable_status_changed
    AFTER INSERT OR UPDATE OF status ON project_deliverables
    FOR EACH ROW EXECUTE PROCEDURE fn_deliverable_status_changed();

-- 7. Trigger on dependency edge changes: recompute the affected dependent.
CREATE OR REPLACE FUNCTION fn_deliverable_dep_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalc_deliverable_stalled(OLD.deliverable_id);
        RETURN OLD;
    END IF;

    PERFORM fn_recalc_deliverable_stalled(NEW.deliverable_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliverable_dep_changed ON deliverable_dependencies;
CREATE TRIGGER trg_deliverable_dep_changed
    AFTER INSERT OR UPDATE OR DELETE ON deliverable_dependencies
    FOR EACH ROW EXECUTE PROCEDURE fn_deliverable_dep_changed();

-- 8. RAG integration: stalled deliverables demote a project's health one level
--    (Green -> Amber, Amber -> Red, Red stays Red). progress_gap is unchanged.
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

    -- Demote one level when the project has any stalled deliverables.
    IF to_regclass('project_deliverables') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_stalled_count
        FROM project_deliverables
        WHERE project_id = p_project_id AND status = 'stalled';

        IF v_stalled_count > 0 THEN
            IF v_status = 'green' THEN
                v_status := 'amber';
            ELSIF v_status = 'amber' THEN
                v_status := 'red';
            END IF;
        END IF;
    END IF;

    rag_status := v_status;
    progress_gap := ROUND(v_gap, 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 9. View refresh: expose stalled counts and cross-project blocking impact.
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
    (
        SELECT COUNT(*)
        FROM project_deliverables pdv
        WHERE pdv.project_id = p.id AND pdv.status = 'stalled'
    ) AS stalled_deliverable_count,
    (
        -- Distinct downstream deliverables in OTHER projects blocked by this project's incomplete work.
        SELECT COUNT(DISTINCT dd.deliverable_id)
        FROM deliverable_dependencies dd
        JOIN project_deliverables up ON up.id = dd.depends_on_deliverable_id
        JOIN project_deliverables down ON down.id = dd.deliverable_id
        WHERE up.project_id = p.id
          AND up.status <> 'completed'
          AND down.project_id <> p.id
    ) AS blocking_impact_count,
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
    (SELECT COUNT(*) FROM project_deliverables WHERE status = 'stalled') AS stalled_deliverables,
    (SELECT COUNT(*) FROM project_deliverables WHERE assigned_employee_id IS NULL) AS unassigned_deliverables
FROM projects p
LEFT JOIN project_budgets pb ON pb.project_id = p.id;

-- 10. Normalize existing data: recompute stalled state for all deliverables (cascades downstream),
--     then refresh RAG for every project so demotion is reflected immediately.
DO $$
DECLARE
    v_id UUID;
BEGIN
    IF to_regclass('deliverable_dependencies') IS NOT NULL THEN
        FOR v_id IN SELECT id FROM project_deliverables LOOP
            PERFORM fn_recalc_deliverable_stalled(v_id);
        END LOOP;
        PERFORM fn_update_project_rag(id) FROM projects;
    END IF;
END $$;
