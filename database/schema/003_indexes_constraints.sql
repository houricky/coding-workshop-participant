-- ACME Budget & Resource Tracker — indexes

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);
CREATE INDEX IF NOT EXISTS idx_projects_rag_status ON projects(rag_status);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(project_manager_id);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_employee ON app_users(employee_id);

CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets(project_id);

CREATE INDEX IF NOT EXISTS idx_allocations_project ON project_resource_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_allocations_employee ON project_resource_allocations(employee_id);

CREATE INDEX IF NOT EXISTS idx_usage_project ON project_resource_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_employee ON project_resource_usage(employee_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON project_resource_usage(usage_date);

CREATE INDEX IF NOT EXISTS idx_dependencies_project ON project_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON project_dependencies(depends_on_project_id);
