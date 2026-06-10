-- ACME Budget & Resource Tracker — RAG functions and triggers

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_project_allocated_hours(p_project_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(allocated_hours), 0)
    FROM project_resource_allocations
    WHERE project_id = p_project_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_project_hours_used(p_project_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(hours_used), 0)
    FROM project_resource_usage
    WHERE project_id = p_project_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_refresh_budget_used(p_project_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE project_budgets
    SET budget_used = COALESCE((
        SELECT SUM(cost_amount)
        FROM project_resource_usage
        WHERE project_id = p_project_id
    ), 0),
    updated_at = NOW()
    WHERE project_id = p_project_id;
END;
$$ LANGUAGE plpgsql;

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

    rag_status := v_status;
    progress_gap := ROUND(v_gap, 2);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_update_project_rag(p_project_id UUID)
RETURNS VOID AS $$
DECLARE
    v_rag rag_status;
    v_gap NUMERIC;
BEGIN
    SELECT r.rag_status, r.progress_gap
    INTO v_rag, v_gap
    FROM fn_calculate_rag(p_project_id) r;

    IF v_rag IS NOT NULL THEN
        UPDATE projects
        SET rag_status = v_rag,
            rag_progress_gap = COALESCE(v_gap, 0),
            updated_at = NOW()
        WHERE id = p_project_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_usage_changed()
RETURNS TRIGGER AS $$
DECLARE
    v_project_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    PERFORM fn_refresh_budget_used(v_project_id);
    PERFORM fn_update_project_rag(v_project_id);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_rag_relevant_change()
RETURNS TRIGGER AS $$
DECLARE
    v_project_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
    ELSIF TG_TABLE_NAME = 'projects' THEN
        v_project_id := NEW.id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    PERFORM fn_update_project_rag(v_project_id);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
    BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON project_budgets;
CREATE TRIGGER trg_budgets_updated_at
    BEFORE UPDATE ON project_budgets
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_allocations_updated_at ON project_resource_allocations;
CREATE TRIGGER trg_allocations_updated_at
    BEFORE UPDATE ON project_resource_allocations
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_usage_updated_at ON project_resource_usage;
CREATE TRIGGER trg_usage_updated_at
    BEFORE UPDATE ON project_resource_usage
    FOR EACH ROW EXECUTE PROCEDURE fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_usage_rag ON project_resource_usage;
CREATE TRIGGER trg_usage_rag
    AFTER INSERT OR UPDATE OR DELETE ON project_resource_usage
    FOR EACH ROW EXECUTE PROCEDURE fn_usage_changed();

DROP TRIGGER IF EXISTS trg_budgets_rag ON project_budgets;
CREATE TRIGGER trg_budgets_rag
    AFTER INSERT OR UPDATE OF allocated_budget, budget_used ON project_budgets
    FOR EACH ROW EXECUTE PROCEDURE fn_rag_relevant_change();

DROP TRIGGER IF EXISTS trg_allocations_rag ON project_resource_allocations;
CREATE TRIGGER trg_allocations_rag
    AFTER INSERT OR UPDATE OR DELETE ON project_resource_allocations
    FOR EACH ROW EXECUTE PROCEDURE fn_rag_relevant_change();

DROP TRIGGER IF EXISTS trg_projects_rag ON projects;
CREATE TRIGGER trg_projects_rag
    AFTER UPDATE OF actual_completion_percent ON projects
    FOR EACH ROW EXECUTE PROCEDURE fn_rag_relevant_change();
