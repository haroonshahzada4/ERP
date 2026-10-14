# Local-First ERP SaaS Architecture & Delivery Plan

NestJS + TypeORM + React | PostgreSQL database per tenant | October 2026

**Decision:** Proceed with architecture improvements incrementally. First establish a secure, functional local ERP foundation and complete HRM. Defer production infrastructure until needed.

## Architecture to retain

- One monorepo: React + Vite frontend and NestJS + TypeORM backend.
- Master PostgreSQL for users, tenant metadata, memberships, domains, plans, entitlements, platform admin.
- Separate PostgreSQL database per tenant for HRM records, roles, and permissions.
- Tenant-aware pipeline: verified host → ALS context → JWT/context match → membership → feature entitlement → RBAC → tenant DataSource.
- Platform Super Admin ≠ Company Admin; platform privilege must not bypass private tenant data authorization.

## Do now vs later

| Improvement | When | Action |
| --- | --- | --- |
| Default-deny authorization | NOW | Explicit `@Public` / `@Authenticated` / permission exceptions |
| Separate platform and tenant JWTs | NOW | Platform token without tenant ID |
| Remove Super Admin auto-membership | NOW | Support access separate |
| Tenant isolation checks | NOW | Host, token, membership, entitlement, permissions agree |
| Dynamic RBAC + feature entitlements | NOW | Feature enabled AND user authorized |
| Master/tenant migrations + tests | NOW | Cross-tenant isolation tests in CI |
| Consistent API errors + secret validation | NOW | Predictable FE; reject weak production secrets |
| Async BullMQ provisioning | LATER | Sync local OK with safe failures |
| Per-tenant DB credentials / secrets manager | LATER | Before production |
| httpOnly cookies + CSRF | BEFORE PROD | SessionStore abstraction now; localStorage for local |
| Dynamic CORS, PgBouncer, MFA, S3, billing | LATER | When deployment requires |
| Backups, retention, export/deletion | BEFORE REAL DATA | Before real employee/payroll data |

## Phases

### Phase 0 — Secure boundaries

- [x] Separate platform authentication from tenant authentication
- [x] Remove automatic Super Admin tenant membership
- [x] Default-deny authorization
- [x] Validate host, JWT tenant ID, membership, entitlements, RBAC
- [x] Block platform tokens from private tenant APIs without support access
- [x] Error envelope + production secret validation
- [x] Isolation tests + CI

### Phase 1 — Tenant lifecycle

- [x] Create/update/activate/suspend with safe partial-failure handling
- [x] Sync provision: migrate + seed; Company Admin + branding
- [x] Enable/disable modules and features per tenant
- [x] Provisioning status API

### Phase 2 — Frontend and access

- [x] Separate Platform vs Company Admin experiences
- [x] Tenant management + feature configuration screens
- [x] Gate sidebar/routes via entitlements AND RBAC
- [x] Consistent errors/loading from API envelope

### Phase 3 — HRM features

- [x] Organization and employees
- [x] Shifts and attendance
- [x] Leave policies, balances, approvals
- [x] Payroll, compensation, deductions *(Phase 5 expanded: tax slabs, attendance prorate, immutable payslips, HR/CEO remarks)*
- [x] Recruitment

## Local acceptance checklist

- [x] Platform Admin can create a tenant without default access to its private data
- [x] Company Admin logs in on correct hostname and manages only that tenant
- [x] Tenant A/B use distinct DBs and pass cross-tenant isolation tests
- [x] Feature flags independently control Attendance, Leave, Payroll
- [x] HR/Manager/Employee access follows dynamic permissions
- [x] Suspended tenants blocked; invalid host/token rejected
- [x] CI runs unit and tenant-isolation tests

## Deferred production work

Least-privilege tenant DB credentials, BullMQ provisioning, httpOnly cookies/CSRF, verified-domain CORS, PgBouncer, migration batches, backup/PITR, observability, rate limits, MFA, S3, billing, export/deletion/retention.
