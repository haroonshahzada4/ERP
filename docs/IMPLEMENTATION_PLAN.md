# Multi-Tenant SaaS ERP

**Full-Stack Architecture & HRM Implementation Plan | Version 1.1 | October 2026**

Target: React + TypeScript frontend; NestJS + TypeScript backend; PostgreSQL database per tenant.

> **Local amendments (confirmed):**
>
> - **ORM: TypeORM** (replaces Prisma from the original plan)
> - **Frontend: React + TypeScript + Vite** (Vite is the bundler/dev server for React, not a separate UI framework)
> - **UI: Tailwind CSS** (with room for Bootstrap later if theme assets require it)
> - Original Word doc preserved at `docs/ERP_SaaS_HRM_Fullstack_Implementation_Plan.docx`
> - **Attendance check-in/out: no GPS/location** (web timestamp + shift rules only)

---

## 1. Scope and source alignment

This document revises the supplied ZAL-ERP-inspired HRM backend and FE outline. It preserves organization/employee, attendance, leave, payroll, recruitment, approval screens, permissions, and the familiar ERP shell. It replaces Laravel/Sanctum/Spatie/Artisan and Vue/Vuetify patterns with NestJS and React. Future Finance, CRM, Chat modules are architectural extension points, not fully specified implementations.

## 2. Technology decisions

| Layer | Decision | Notes |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | React Router, TanStack Query, React Hook Form + Zod, Tailwind |
| Backend | NestJS + TypeScript | REST `/api/v1`, Swagger, DTO validation, Guards, modular monolith |
| Database | PostgreSQL | One master DB; one logical PostgreSQL database per tenant |
| Data access | **TypeORM** | Separate master and tenant DataSources; validate migration/tooling fit in spike |
| Cache/queue | Redis + BullMQ | Tenant-aware job payloads and workers |
| Storage | S3 compatible | Tenant-prefix keys and signed downloads |
| Tests | Jest + Supertest + Playwright | Unit, API integration, E2E, cross-tenant security |
| Deployment | Docker + managed PostgreSQL | Connection budgets, secrets manager, CI/CD |

## 3. Multi-tenant architecture

**Master database:** tenants, tenant_domains, tenant_databases (secret references only), users, tenant_memberships, plans, subscriptions, platform_audit_logs, provisioning_jobs.

**Tenant databases:** company settings, RBAC, departments, branches, employees, shifts, attendance, leaves, payroll, recruitment, audit logs and transactional outbox.

Do not store tenant payroll/HR records in the master database.

Global user IDs may be referenced in tenant records as scalar UUIDs; cross-database foreign keys are unavailable. Membership checks must use the master database and tenant-scoped role checks must use the selected tenant database.

## 4. Tenant request and authentication lifecycle

1. Resolve tenant from allowlisted subdomain or verified custom domain; reject unknown or suspended tenants. Do not trust arbitrary `tenant_id` headers.
2. Authenticate signed access token and check user/session validity; verify active membership for the resolved tenant.
3. Establish request-scoped tenant context via explicit provider or AsyncLocalStorage with careful async boundary tests.
4. Get tenant-specific DB client from a bounded cache/pool manager; never mutate a global client connection URL per request.
5. Enforce permission plus record ownership/department/reporting hierarchy; log privileged operations.
6. Use short-lived access tokens, rotating hashed refresh tokens, logout/revocation, MFA for privileged users and secure httpOnly cookies where appropriate.

## 5. Database-per-tenant operations

- **Provisioning:** create master tenant as provisioning → queue job → create DB and least-privilege user → migrate → seed versioned permissions/default HR setup → bootstrap admin membership → activate.
- Make each provisioning step idempotent and resumable; store state and failure reason; never activate partial databases.
- Run master migrations separately from tenant migrations; track tenant schema versions; roll out in batches with compatibility checks.
- Cap connections per tenant and per app instance; evict idle pools; use PgBouncer if suitable and validate ORM compatibility.
- Tenant-aware backup, point-in-time recovery strategy, restore drills, retention policy, deletion/export workflow, and observability.
- Queue jobs must carry verified tenant ID, resolve DB context on worker execution, deduplicate retries and avoid cross-tenant cache keys.
- Avoid distributed transactions between master and tenant DBs; use outbox/eventual consistency and compensating operations.

## 6. Authorization and permissions

- Use tenant-local roles, permissions, role_permissions and member_role_assignments (linked to global user UUID).
- Seed stable machine permission keys (`employee.read`, `attendance.approve`, `payroll.generate`, `payroll.approve.hr`, `payroll.approve.ceo`) rather than deriving keys from human labels.
- Platform Super Admin is distinct from Tenant Admin; platform privilege must not silently bypass tenant auditing.
- Default-deny all endpoints; guards verify membership, permission, and resource scope.
- Manager team-scoping and employee self-service are enforced in backend queries, not only UI visibility.
- Separate permissions for sensitive payroll viewing, export, generation, approval and finalization.
- Seed roles idempotently; preserve customer-edited grants; introduce new permissions with explicit migration policy.

## 7. Suggested repository structure

```
apps/api/src/
  platform/{auth,tenants,subscriptions}
  modules/{access,hrm/{organization,employees,shifts,attendance,leaves,payroll,recruitment},finance,crm,chat}
  infrastructure/{database,queue,storage}
  common
apps/web/src/
  app, layouts
  features/{access,hrm/{employees,attendance,leaves,payroll,recruitment}}
  components, lib
packages/{api-contracts,ui,config}
typeorm/{master,tenant}   # amended from prisma/
tests/{integration,e2e}
```

Shared API contracts can be generated from OpenAPI. Avoid importing Nest server internals into the React app.

## 8. API standards

- Prefix `/api/v1`; consistent pagination, filtering, sorting, error envelope and validation response; UTC timestamps plus tenant-configured timezone.
- OpenAPI-generated typed FE client; React Query cache keys include tenant identity; clear all caches on tenant switch/logout.
- Idempotency keys for sensitive create/finalize endpoints; optimistic locking or state transition guards for approvals.
- Separate employee self-service routes (`/me/attendance`, `/me/leaves`) from scoped HR/admin routes.
- Rate limit auth and exports; audit data exports; protect uploads with content-type/size validation and malware scanning where appropriate.

## 9. Phase-by-phase BE + FE delivery

### Phase 0 — Foundation

- **BE:** NestJS bootstrap, config validation, health/readiness, master/tenant DB clients (TypeORM), Docker, migrations, Swagger, CI, structured logs.
- **FE:** React/Vite/TS bootstrap, theme asset audit, shell/header/sidebar, route structure, responsive visual baselines.
- **Exit:** app boots, master DB connects, demo tenant DB connects, first themed page visually matches original.

### Phase 1 — SaaS / Authentication / RBAC

- **BE:** tenant domain resolver, provisioning worker, memberships, login/refresh/logout, tenant-aware RBAC guards, permission seeding, cross-tenant denial tests.
- **FE:** login, tenant selection/switch, 403/404/session expiry, roles matrix, permission-aware nav, tenant settings and provisioning status.
- **Exit:** Tenant A cannot read Tenant B; tenant admin assigns role; revoked membership loses access.

### Phase 2 — Organization / Employee

- **BE:** branches, departments, designations, employment types/status, document types, employees, reporting_to, employment history, files, manager scope.
- **FE:** setup list drawers, employee list/filter/export, create/edit wizard, employee profile tabs, my profile, role assignment.
- **Exit:** create employee, link global identity safely, show manager hierarchy, enforce field-level sensitive access.

### Phase 3 — Shifts / Attendance

- **BE:** shift definitions, shift assignment history, work calendars, holidays, check-in/out, correction requests, daily records, late/absent rules, idempotent BullMQ jobs, imports/exports.
- **FE:** employee check-in/out (no location), attendance records, correction approvals, holiday/shift setup.
- **Exit:** timezone/overnight shift/holiday cases pass; retries create no duplicates; employee only sees own data.

### Phase 4 — Leave Management

- **BE:** leave types, policy eligibility, leave sessions (Jul–Jun configurable), accrual/balance ledger, half/short leave, manager then HR approvals, attendance synchronization transaction/outbox, notifications.
- **FE:** apply leave, balance cards, team approval queue, manager/HR decision dialogs, session/policy setup, leave history.
- **Exit:** duplicate approvals prevented; balances cannot overdraw; attendance sync reliable and reversible by policy.

### Phase 5 — Payroll

- **BE:** compensation effective dates, allowances/deductions, tax tables, loan schedule optional, attendance input snapshot, deterministic payroll calculation, immutable approved runs, HR/CEO workflow, payslips.
- **FE:** salary roster, compensation history, month generation wizard, review deductions, approve/reject with remarks, payslip viewer, tax/rule setup.
- **Exit:** recalculation reproducible, approval separation of duties enforced, no double-finalization, PDF export access checked.

### Phase 6 — Recruitment

- **BE:** tenant-local job categories/stages/jobs/applications; resumes in tenant-scoped storage; applicant access control; conversion to employee on hire.
- **FE:** job listing/editor, applicant table and details drawer, categories/stages setup, optional public career pages separated from authenticated ERP.
- **Exit:** create job and application, view attachment securely, convert applicant to employee with no duplicates.

### Phase 7 — Cross-cutting UX / Reports

- **BE:** notifications, audit trails, transactional outbox, report/export jobs, file access policy, activity history.
- **FE:** notification center, global search (scoped), export progress, audit views, consistent loading/empty/error states, accessibility review.
- **Exit:** reports correct for tenant and user scope; exports traceable; background notifications resilient.

### Phase 8 — Production readiness

- **BE:** load tests, query indexes, migration batch rehearsal, backup restore, secret rotation, penetration/security checks, queue recovery, monitoring.
- **FE:** Playwright E2E, responsive regressions, permission matrix, visual snapshot tests against theme, performance and accessibility checks.
- **Exit:** documented runbooks, tested restore, verified no cross-tenant leakage, deployment rollback plan.

## 10. Core tenant schema (initial)

| Domain | Suggested tables |
| --- | --- |
| Platform/master | users, sessions, tenants, tenant_domains, tenant_databases, tenant_memberships, plans, subscriptions |
| Tenant/access | roles, permissions, role_permissions, membership_roles, audit_logs, outbox_events |
| Tenant/organization | company_settings, branches, departments, designations, employment_types, employment_statuses, employees, employee_documents |
| Tenant/attendance | shifts, shift_assignments, work_calendars, holidays, attendances, attendance_requests |
| Tenant/leaves | leave_types, leave_policies, leave_sessions, leave_requests, leave_approvals, leave_balance_ledger |
| Tenant/payroll | compensation_records, allowances, deductions, tax_slabs, payroll_runs, payroll_items, payroll_approvals, payslips |
| Tenant/recruitment | job_categories, job_stages, jobs, job_applications, applicant_documents |

## 11. UI migration / purchased theme protection

- Audit whether purchased package actually includes React source. If not, budget conversion of static HTML pages.
- Create visual reference screenshots for dashboard, tables, forms, drawers, charts and responsive states.
- Convert page markup to JSX/TSX without changing Tailwind classes or DOM nesting initially.
- Replace DOM-manipulating Vanilla JS gradually with React state/effects and React-compatible integrations.
- Keep typography, icons, charts, spacing and responsive behavior identical during migration; refactor only after visual tests pass.
- FE authorization improves UX but never replaces backend permission checks.

## 12. Test matrix and acceptance gates

| Area | Required tests |
| --- | --- |
| Isolation | Tenant A/B same UUID-style records, wrong host, changed tenant header, expired membership, cache/queue separation |
| Auth/RBAC | Refresh reuse, logout, role revocation, self vs manager vs HR vs CEO, platform admin audit |
| Attendance | Overnight shifts, DST/timezones, missed checkout, holiday overlap, duplicate scheduled jobs |
| Leave | Concurrent requests, half/short leave, balance ledger, approvals, rollback/rejection |
| Payroll | Money as decimal/integer minor units, snapshots, double-run, tax boundaries, approval race, payslip ACL |
| Operations | Provisioning retries, partial migration, backup restore, queue retries, pool exhaustion |
| Frontend | Route guards, responsive layout, accessible forms, optimistic update rollback, visual regression |

## 13. Security, observability and deployment

- Use TLS, secret manager, least-privilege DB roles, separate migration credentials, encryption at rest and backups.
- Structured logs with request ID, tenant ID and actor ID; never log salaries/passwords/tokens or full sensitive payloads.
- Metrics: per-tenant latency/errors, DB pool usage, job failures, provisioning duration, migration versions, storage costs.
- CI: lint/typecheck/unit/integration/OpenAPI drift; CD: master migration then tenant batches then application deploy with backward compatibility.
- Maintain tenant export/deletion, retention and recovery policies before accepting real customer HR/payroll data.

## 14. Decisions to confirm before implementation

- Confirm React + TypeScript + Vite (this plan assumes it); original uploaded FE was Vue + Vuetify. **Confirmed locally.**
- Confirm ORM: **TypeORM** (amended from Prisma). **Confirmed.**
- Confirm hosting and tenant DB scaling limits: shared PostgreSQL instance initially versus dedicated instance for premium tenants.
- Confirm whether authentication users can join multiple tenants and how email uniqueness works.
- Confirm attendance source: **web check-in/out without GPS/location** (confirmed); timezone and shift rules still refineable.
- Confirm payroll country/tax jurisdiction, rounding, salary calendar, approval and finalization policy.
- Confirm recruitment belongs in HRM tenant DB rather than separate CRM connection (recommended for initial release).
- Confirm whether purchased theme includes a native React edition and associated license rights.

## 15. First implementation sprint

- Day 1–2: monorepo bootstrap, lint/test tooling, Docker PostgreSQL + Redis, master DB migrations (TypeORM).
- Day 3–4: tenant metadata, domain resolver, tenant connection manager, demo tenant DB creation.
- Day 5–6: auth, membership validation, tenant-aware guards, roles/permissions seed.
- Day 7–8: React shell/theme baseline, login/tenant-aware API client, roles page.
- Day 9–10: automated tenant-isolation tests, provisioning retry tests, Swagger contract, release checklist.

---

## Project status

- [x] Plan saved and amended (TypeORM + React/Vite/Tailwind)
- [x] Phase 0 — Foundation *(local PostgreSQL service; Redis optional)*
- [x] Phase 1 — SaaS / Authentication / RBAC
- [x] Phase 2 — Organization / Employee
- [x] Phase 3 — Shifts / Attendance *(no GPS/location on check-in/out)*
- [x] Phase 4 — Leave Management
- [ ] Phase 5 — Payroll
- [ ] Phase 6 — Recruitment
- [ ] Phase 7 — Cross-cutting UX / Reports
- [ ] Phase 8 — Production readiness
