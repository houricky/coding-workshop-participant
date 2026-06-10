-- ACME Budget & Resource Tracker — core tables

CREATE TABLE IF NOT EXISTS employees (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255) UNIQUE,
    role                    user_role NOT NULL DEFAULT 'employee',
    job_title               VARCHAR(100),
    department              VARCHAR(100),
    is_direct_staff         BOOLEAN NOT NULL DEFAULT TRUE,
    work_location           VARCHAR(20) NOT NULL DEFAULT 'remote',
    hourly_rate             NUMERIC(10, 2) NOT NULL DEFAULT 0,
    weekly_capacity_hours   NUMERIC(5, 2) NOT NULL DEFAULT 40,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'employee';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_direct_staff BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_location VARCHAR(20) NOT NULL DEFAULT 'remote';

DO $$ BEGIN
    ALTER TABLE employees ADD CONSTRAINT chk_employees_work_location
        CHECK (work_location IN ('remote', 'on_site'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS projects (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR(200) NOT NULL,
    description                 TEXT,
    stage                       project_stage NOT NULL DEFAULT 'planning',
    actual_completion_percent   NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (actual_completion_percent >= 0 AND actual_completion_percent <= 100),
    rag_status                  rag_status NOT NULL DEFAULT 'green',
    rag_progress_gap            NUMERIC(5, 2) NOT NULL DEFAULT 0,
    start_date                  DATE,
    end_date                    DATE,
    project_manager_id          UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'employee',
    employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'employee';

CREATE TABLE IF NOT EXISTS project_budgets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    allocated_budget    NUMERIC(15, 2) NOT NULL CHECK (allocated_budget > 0),
    budget_used         NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (budget_used >= 0),
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_allocations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    allocated_hours         NUMERIC(10, 2) NOT NULL CHECK (allocated_hours > 0),
    hourly_rate_snapshot    NUMERIC(10, 2),
    role_on_project         VARCHAR(100),
    start_date              DATE,
    end_date                DATE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, employee_id)
);

CREATE TABLE IF NOT EXISTS project_resource_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    usage_date      DATE NOT NULL,
    hours_used      NUMERIC(10, 2) NOT NULL CHECK (hours_used > 0),
    cost_amount     NUMERIC(15, 2) NOT NULL CHECK (cost_amount >= 0),
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_dependencies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    depends_on_project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dependency_type         dependency_type NOT NULL DEFAULT 'finish_to_start',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (project_id != depends_on_project_id),
    UNIQUE (project_id, depends_on_project_id)
);
