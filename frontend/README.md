# ACME Project Budget & Resource Tracker — Frontend

A single-page React application for monitoring project **health** across a
portfolio: budget burn, resource hours, and a Red / Amber / Green status that
answers one question — *is a project burning faster than it's finishing?*

Built with **React + Vite**, **Material UI**, **React Router**, and
**react-responsive**. It ships with an in-memory mock backend so you can run it
with zero setup, and switches to the real FastAPI service with a single env var.

---

## Quick start

```bash
cp .env.sample .env      # default config runs entirely on mock data
npm install
npm run dev              # http://localhost:5173
```

Demo sign-in (mock mode, pre-filled on the login screen):

- **Email:** `admin@acme.test`
- **Password:** `password`

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

---

## Connecting the real backend

The app talks to the API only through `src/services/api.js`. Flip one variable
in `.env`:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3001
```

With `VITE_USE_MOCK=false`, every call goes to the local CORS proxy via the
axios client in `src/services/httpClient.js`, which attaches the JWT as a
`Bearer` token and redirects to `/login` on a `401`. The endpoint paths in
`api.js` already match the documented API (`/auth/*`, `/projects`,
`/projects/:id/summary`, `/employees`, `/allocations`, `/usage`,
`/dependencies`, `/dashboard`). No page or component changes are required.

---

## RAG health model

Status is computed in `src/utils/rag.js`, mirroring the backend rule exactly:

```
budget_used_percent = budget_used / allocated_budget * 100
hours_used_percent  = hours_used  / allocated_hours  * 100
progress_gap = max(budget_used_percent, hours_used_percent) - actual_completion_percent

Green : gap <= 10
Amber : 10 < gap <= 25
Red   : gap > 25
```

The reusable **HealthGauge** component visualizes this directly: the filled bar
is burn, the dark marker is completion, and the hatched span between them is the
gap that drives the status.

---

## Project structure

```
frontend/
├── index.html              # App entry + font loading
├── vite.config.js          # Vite config (JSX allowed in .js for App.js)
├── eslint.config.js        # ESLint flat config
├── .env.sample             # VITE_API_BASE_URL, VITE_USE_MOCK
├── public/favicon.svg
└── src/
    ├── main.jsx            # Mounts theme, router, auth provider
    ├── App.js              # Route table (public + protected shell)
    ├── theme.js            # Design tokens: ink primary + desaturated RAG palette
    ├── index.css
    ├── context/
    │   └── AuthContext.jsx # Login / register / logout / session restore
    ├── services/
    │   ├── api.js          # Single public API; mock vs HTTP switch
    │   ├── httpClient.js   # Axios instance + JWT interceptor
    │   └── mockBackend.js  # In-memory backend with seed data
    ├── utils/
    │   ├── rag.js          # RAG status calculation
    │   └── format.js       # Currency / hours / percent / date helpers
    ├── components/
    │   ├── AppLayout.jsx           # Responsive shell (sidebar / drawer)
    │   ├── AuthShell.jsx           # Split-panel auth layout
    │   ├── ProtectedRoute.jsx
    │   ├── RagChip.jsx             # Canonical status badge
    │   ├── HealthGauge.jsx         # Signature burn-vs-progress gauge
    │   ├── ProjectFormDialog.jsx   # Create / edit project (live RAG preview)
    │   ├── EmployeeFormDialog.jsx  # Create / edit employee
    │   └── ui.jsx                  # StatCard, PageHeader, EmptyState, etc.
    └── pages/
        ├── LoginPage.jsx
        ├── RegisterPage.jsx
        ├── DashboardPage.jsx       # Portfolio KPIs + RAG breakdown + at-risk
        ├── ProjectsListPage.jsx    # Filter / sort by urgency, CRUD
        ├── ProjectDetailPage.jsx   # Health, burn, team, usage, dependencies
        ├── EmployeesPage.jsx       # Utilization + overallocation
        ├── EmployeeDetailPage.jsx
        ├── ResourceAllocationPage.jsx
        ├── ResourceUsagePage.jsx
        └── NotFoundPage.jsx
```

---

## Notes & assumptions

- **Auth/roles:** roles (`admin` / `manager` / `employee`) are captured at
  registration and stored for future RBAC; per the MVP scope every signed-in
  user can perform every action.
- **Derived figures:** in mock mode, `budget_used` and `hours_used` are derived
  from usage records × hourly rate, and allocation totals from allocation
  records — the same way the real services are expected to behave.
- **Out of scope** (per spec): task management, notifications, and external
  integrations. Self-referencing project dependencies are displayed read-only as
  a stretch item.
- **Accessibility/quality floor:** responsive to mobile, visible keyboard focus,
  reduced-motion respected, tabular figures on all numeric columns.
```
