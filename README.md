# ERP SaaS (HRM-first)

Multi-tenant SaaS ERP — NestJS + TypeORM backend, React + Vite + Tailwind frontend.

Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)

## Run

```bash
npm install
npm run dev
```

- Web: open a **company subdomain** (see below) — Vite listens on port `5173`
- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs

## Local login

Tenant is identified by the **subdomain** you open — there is no company picker.

| Company | URL | Admin email | Password | Theme |
| --- | --- | --- | --- | --- |
| Nexus HR | http://demo.localhost:5173 | `admin@demo.com` | `admin` | Emerald |
| Horizon Logistics | http://horizon.localhost:5173 | `admin@horizon.com` | `admin` | Orange |
| Summit Foods | http://summit.localhost:5173 | `admin@summit.com` | `admin` | Sky |

| Role | URL | Email | Password | Sees |
| --- | --- | --- | --- | --- |
| Super Admin | http://localhost:5173/platform/login | `superadmin@demo.com` | `admin` | Platform console |
| Company Admin | http://demo.localhost:5173 | `admin@demo.com` | `admin` | Everything |
| HR | http://demo.localhost:5173 | `aisha.khan@demo.com` | `admin` | Employees, full attendance (edit/import/export/reports), leave, payroll, recruitment, settings |
| Manager | http://demo.localhost:5173 | `sara.malik@demo.com` | `admin` | Employees (read), attendance check-in + team timesheet/reports, leave |
| Employee | http://demo.localhost:5173 | `bilal.ahmed@demo.com` | `admin` | Employees (read), own check-in/out + attendance history, leave (read) |

`*.localhost` resolves to `127.0.0.1` on modern browsers — no hosts file edit needed.

## Local Postgres / pgAdmin

Requires the local PostgreSQL Windows service (`postgresql-x64-18`). Nest connects via `MASTER_DB_*` in `apps/api/.env`.

| Field | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| User | `postgres` or `erp` |
| Password | `admin` |
| DBs | `erp_master`, `erp_tenant_demo` |

First-time DB setup:

```bash
npm run db:ensure
```

## Plans & features (seeded)

| Tenant | Plan | Enabled features |
| --- | --- | --- |
| Nexus HR (`demo`) | Enterprise | Full HRM + Finance + CRM catalog |
| Horizon Logistics | Starter | `hrm.employees`, `hrm.attendance`, `hrm.leave` |
| Summit Foods | Growth | Starter + `hrm.payroll` + `hrm.recruitment` |

Super Admin (`platform:*`) manages plans, entitlements and support access at http://localhost:5173/platform — and does **not** automatically receive private tenant data access.

## Phase status

- [x] Phase 0 — Foundation
- [x] Phase 1 — Auth / RBAC / dark UI shell
- [x] Phase 2 — Organization / Employee (+ demo seeder)
- [x] Platform catalog / entitlements / support access
- [x] Phase 3 — Shifts / Attendance
- [x] Phase 4 — Leave Management
- [x] Phase 5 — Payroll
