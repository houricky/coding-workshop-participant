# Demo Seed Data Reference

This document summarizes the local PostgreSQL demo data loaded from
`database/seed/001_demo_data.sql`.

The seed is idempotent and is intended to showcase dashboard pressure, budget
runway, team utilization, deliverables, dependencies, and role-based navigation.

## Test Login Accounts

All seeded database users use the same password:

```text
admin123
```

| Name | Email | App role | Linked employee | Good for testing |
| --- | --- | --- | --- | --- |
| ACME Admin / Bob Smith | `admin@acme.com` | `admin` | Bob Smith | Full access, admin flows, employee management |
| Maya Patel | `maya@acme.com` | `manager` | Maya Patel | Manager access, PMO portfolio data |
| Priya Nair | `priya@acme.com` | `manager` | Priya Nair | Manager access, operations delivery data |
| Alice Johnson | `alice@acme.com` | `employee` | Alice Johnson | Employee-scoped access and restricted navigation |

Only these four employee emails are seeded as login-capable `app_users`.
The remaining employees exist as resource records for allocation, usage,
deliverables, and dashboard scenarios.

## Employee Roster

| Name | Email | Role | Title | Department | Staff type | Location |
| --- | --- | --- | --- | --- | --- | --- |
| Alice Johnson | `alice@acme.com` | employee | Senior Developer | Engineering | Direct | Remote |
| Bob Smith | `bob@acme.com` | manager | Project Manager | PMO | Direct | On site |
| Carol Davis | `carol@acme.com` | employee | UX Designer | Design | Non-direct | Remote |
| Maya Patel | `maya@acme.com` | manager | Program Director | PMO | Direct | Remote |
| Diego Ramirez | `diego@acme.com` | employee | Backend Engineer | Engineering | Direct | Remote |
| Nora Kim | `nora@acme.com` | employee | Data Engineer | Data | Direct | On site |
| Ethan Brooks | `ethan@acme.com` | employee | Security Analyst | Security | Direct | Remote |
| Ivy Chen | `ivy@acme.com` | employee | QA Lead | Quality | Direct | On site |
| Sam Walker | `sam@acme.com` | employee | DevOps Engineer | Platform | Direct | Remote |
| Priya Nair | `priya@acme.com` | manager | Delivery Manager | Operations | Direct | Remote |
| Owen Lee | `owen@acme.com` | employee | Frontend Engineer | Engineering | Direct | Remote |
| Fatima Hassan | `fatima@acme.com` | employee | Business Analyst | Product | Non-direct | On site |
| Grace Miller | `grace@acme.com` | employee | Compliance Specialist | Risk | Non-direct | Remote |
| Liam Nguyen | `liam@acme.com` | employee | Support Engineer | Customer Success | Direct | On site |

## Project Portfolio

| Project | Stage | Manager | Scenario |
| --- | --- | --- | --- |
| Platform Modernization | active | Bob Smith | Core active project with broad engineering/design allocation |
| Customer Portal | active | Bob Smith | Active product delivery work with measurable burn/completion pressure |
| Data Warehouse | planning | Bob Smith | Large planning project for future capacity and budget runway |
| Billing Stabilization | active | Maya Patel | High-pressure active project for dashboard urgency charts |
| Mobile Workforce App | active | Priya Nair | Delivery project with cross-functional allocation |
| Security Hardening | active | Maya Patel | Late-stage project with security-focused staffing |
| AI Forecasting Pilot | planning | Priya Nair | Early-stage planning work and forward-looking budget |
| Compliance Reporting | on_hold | Maya Patel | Paused work with compliance and reporting deliverables |
| Legacy Decommission | completed | Bob Smith | Completed reference project |
| Vendor Portal Refresh | cancelled | Priya Nair | Cancelled reference project |

## What The Seed Showcases

- 14 employee records across Engineering, PMO, Design, Data, Security, Quality,
  Platform, Operations, Product, Risk, and Customer Success.
- 10 projects across active, planning, on-hold, completed, and cancelled stages.
- Budget records for every project, with usage generated from seeded resource
  usage so dashboard metrics are calculated instead of hard-coded.
- Allocations and usage rows that create meaningful utilization pressure,
  including several highly allocated employees for the dashboard.
- Deliverables in multiple statuses, including completed, in-progress, blocked,
  and unassigned work.
- Project dependencies for testing dependency views and risk context.
- RAG conditions designed to produce a mixed portfolio instead of a single
  all-green demo state.

## Applying The Seed

From the repo root, use the database migration script with seed enabled:

```bash
database/migrate.sh --seed
```

This document reflects the real database seed. Mock-mode frontend accounts are
defined separately in `frontend/src/services/mockBackend.js`.
