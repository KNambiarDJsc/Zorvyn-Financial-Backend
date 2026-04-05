# Zorvyn Financial Backend

A production-grade, multi-tenant financial data system with role-based access control, audit logging, and analytics APIs.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [API Reference](#api-reference)
6. [Access Control](#access-control)
7. [Database Design](#database-design)
8. [Security Model](#security-model)
9. [Performance Design](#performance-design)
10. [Observability](#observability)
11. [Assumptions & Tradeoffs](#assumptions--tradeoffs)
12. [Running Tests](#running-tests)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────────┐
│                    Fastify API Layer                             │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│   │   Helmet    │  │ Rate Limiter │  │  Swagger /docs        │ │
│   │   CORS      │  │  (Redis)     │  │  OpenAPI 3.0          │ │
│   └─────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Security Layer                               │
│   ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│   │ authenticate │→ │  RBAC guard   │→ │  Idempotency      │   │
│   │ (JWT verify) │  │ (permissions) │  │  (POST dedupe)    │   │
│   └──────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                  Module Layer (per feature)                      │
│                                                                  │
│   Controller → Service → Repository                              │
│   (HTTP)       (logic)   (DB only)                               │
│                                                                  │
│   ┌───────┐  ┌────────┐  ┌──────────────┐  ┌────────────────┐  │
│   │ Auth  │  │ Users  │  │   Records    │  │   Dashboard    │  │
│   └───────┘  └────────┘  └──────────────┘  └────────────────┘  │
└──────┬──────────────────────────────────────────┬───────────────┘
       │                                          │
┌──────▼──────┐                          ┌────────▼───────┐
│  PostgreSQL  │                          │     Redis      │
│  (Prisma)   │                          │  (cache +      │
│             │                          │   rate limit)  │
└─────────────┘                          └────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Rule |
|---|---|---|
| **Controller** | Parse request, call service, send response | No business logic |
| **Service** | Business rules, orchestration | No Prisma imports |
| **Repository** | Database access only | No business logic |
| **Middleware** | Auth, RBAC, idempotency | Reusable, composable |

---

## Tech Stack

| Concern | Technology | Rationale |
|---|---|---|
| Runtime | Node.js 20 | LTS, cluster support |
| Framework | Fastify 4 | 2× faster than Express, schema serialization |
| ORM | Prisma 5 | Type-safe queries, migration tooling |
| Database | PostgreSQL 16 | ACID, Decimal type for money, window functions |
| Cache | Redis 7 | Rate limiting + dashboard cache |
| Validation | Zod | Runtime + compile-time safety, one source of truth |
| Auth | JWT (jsonwebtoken) | Stateless access tokens, DB-backed refresh tokens |
| Logging | Pino | Fastest Node.js logger, structured JSON |
| Docs | Swagger / OpenAPI 3 | Auto-generated from route schemas |
| Containers | Docker + Compose | Reproducible local + production environments |

---

## Project Structure

```
src/
├── app.ts                    # Fastify instance + plugins
├── server.ts                 # Cluster bootstrap + graceful shutdown
├── routes.ts                 # Central route registry
│
├── config/
│   ├── env.ts                # Zod-validated env (fail-fast on startup)
│   ├── db.ts                 # Prisma singleton + ping
│   └── redis.ts              # Redis singleton + typed cache helpers
│
├── middleware/
│   ├── auth.middleware.ts     # JWT verification → req.user
│   ├── rbac.middleware.ts     # Permission-based route guards
│   └── idempotency.middleware.ts  # POST deduplication (Stripe-style)
│
├── modules/
│   ├── auth/                 # register, login, refresh, logout
│   ├── user/                 # profile, list, role/status management
│   ├── financial-record/     # CRUD + filtering + pagination
│   ├── dashboard/            # aggregation APIs + caching
│   └── audit/                # append-only audit log writer
│
├── constants/
│   ├── permissions.ts        # Role → Permission matrix
│   └── audit-actions.ts      # Auditable action names
│
├── types/
│   ├── fastify.d.ts          # Augmented FastifyRequest (req.user)
│   └── common.ts             # Shared domain types
│
└── utils/
    ├── errors.ts             # Typed AppError hierarchy
    ├── response.ts           # Standardised response envelope
    ├── jwt.ts                # Sign / verify / hash
    ├── logger.ts             # Pino with redaction
    └── async-handler.ts      # Catch async errors → Fastify handler

prisma/
├── schema.prisma             # Data model + indexes
└── seed.ts                   # Demo data (3 users, 6 months of records)

tests/
├── setup.ts                  # Global env for Jest
├── unit/                     # Service + schema tests (mocked dependencies)
└── integration/              # Full HTTP flow tests (mocked DB/Redis)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Local Setup (with Docker)

```bash
# 1. Clone and install
git clone <repo>
cd zorvyn-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — generate a JWT_SECRET with: openssl rand -hex 32

# 3. Start PostgreSQL + Redis
docker-compose up -d db redis

# 4. Run migrations + seed demo data
npm run prisma:migrate
npm run prisma:seed

# 5. Start the dev server
npm run dev
```

Server starts at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### Full Docker Stack

```bash
docker-compose up --build
```

### Demo Credentials

All accounts use password: `Password123!`

| Role | Email |
|---|---|
| Admin | admin@zorvyn.com |
| Analyst | analyst@zorvyn.com |
| Viewer | viewer@zorvyn.com |

---

## API Reference

Full interactive docs available at `/docs` (Swagger UI).

### Auth

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Create user + org | Public |
| POST | `/api/v1/auth/login` | Get token pair | Public |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | Public |
| POST | `/api/v1/auth/logout` | Revoke refresh token | Optional |

### Users

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/api/v1/users/me` | Own profile | VIEWER |
| PATCH | `/api/v1/users/me` | Update own name | VIEWER |
| GET | `/api/v1/users/roles` | List all roles | VIEWER |
| GET | `/api/v1/users` | List org users | ADMIN |
| GET | `/api/v1/users/:id` | Get user by ID | ADMIN |
| PATCH | `/api/v1/users/:id/role` | Change user role | ADMIN |
| PATCH | `/api/v1/users/:id/status` | Suspend / activate | ADMIN |

### Financial Records

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/api/v1/records` | Create record | ADMIN |
| GET | `/api/v1/records` | List + filter records | VIEWER |
| GET | `/api/v1/records/categories` | Distinct categories | VIEWER |
| GET | `/api/v1/records/:id` | Get record | VIEWER |
| PATCH | `/api/v1/records/:id` | Update record | ANALYST |
| DELETE | `/api/v1/records/:id` | Soft delete | ADMIN |

**Filtering query params:** `type`, `category`, `startDate`, `endDate`, `minAmount`, `maxAmount`, `sortBy`, `sortOrder`, `page`, `limit`

### Dashboard

| Method | Path | Description | Min Role | Cache |
|---|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Total income/expenses/balance | VIEWER | 30s |
| GET | `/api/v1/dashboard/categories` | Per-category breakdown + % | VIEWER | 30s |
| GET | `/api/v1/dashboard/trends` | Time-series by day/week/month | VIEWER | 30s |
| GET | `/api/v1/dashboard/recent` | Latest N records | VIEWER | 15s |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — process alive |
| GET | `/ready` | Readiness — DB + Redis reachable |

### Standard Response Envelope

Every response follows this shape — no exceptions:

```jsonc
// Success
{
  "success": true,
  "data": { ... },
  "meta": {                   // present on paginated endpoints
    "total": 42,
    "page": 2,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "amount", "message": "Amount must be greater than zero" }
    ]
  }
}
```

---

## Access Control

### Role Hierarchy

```
ADMIN > ANALYST > VIEWER
```

Every role inherits all permissions of the roles below it.

### Permission Matrix

| Permission | VIEWER | ANALYST | ADMIN |
|---|:---:|:---:|:---:|
| `records:read` | ✅ | ✅ | ✅ |
| `records:update` | ❌ | ✅ | ✅ |
| `records:create` | ❌ | ❌ | ✅ |
| `records:delete` | ❌ | ❌ | ✅ |
| `dashboard:read` | ✅ | ✅ | ✅ |
| `analytics:read` | ❌ | ✅ | ✅ |
| `users:read_self` | ✅ | ✅ | ✅ |
| `users:read_all` | ❌ | ❌ | ✅ |
| `users:manage` | ❌ | ❌ | ✅ |
| `audit:read` | ❌ | ❌ | ✅ |

### RBAC Implementation

Permissions are defined in a single source of truth (`src/constants/permissions.ts`). The RBAC middleware reads from this matrix at runtime — there is no role logic scattered across handlers.

```typescript
// Route definition
onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_CREATE)]

// Middleware checks the matrix
hasPermission(req.user.role, permission) // → true | false
```

### Multi-Tenant Isolation (ABAC layer)

Every database query includes `orgId` from the authenticated user's JWT. A user from Org A structurally cannot access Org B's data — the Prisma `where` clause enforces this, not application-level checks.

```typescript
// Every repo query looks like this
prisma.financialRecord.findFirst({
  where: { id: recordId, orgId }  // orgId from JWT — not from request body
})
```

### Admin Safety Guards

- Cannot demote yourself
- Cannot demote the last admin in an org
- Cannot suspend yourself
- Cannot suspend the last admin in an org
- Suspending a user immediately revokes all their active sessions

---

## Database Design

### Schema Decisions

**Money as `Decimal(15, 2)`** — never `Float` or `Int`. Floating-point arithmetic is not safe for financial data. `1500.10 + 1500.10` in a float can return `3000.1999999999998`.

**Soft delete** — financial records are never physically removed. The `isDeleted` flag and `deletedAt` timestamp preserve the complete audit trail, which is a compliance requirement in any financial system.

**Refresh tokens stored as SHA-256 hashes** — if the database is compromised, raw tokens are never exposed. The attacker gets hashes that cannot be reversed into usable tokens.

**Append-only audit log** — the `audit_logs` table has no update or delete operations. Every state change is captured with a `before` and `after` JSON snapshot.

### Index Strategy

Indexes are designed around the exact query patterns the application uses:

```sql
-- Dashboard summary / trends (primary query path)
CREATE INDEX idx_records_org_date     ON financial_records(org_id, date);

-- Filtering
CREATE INDEX idx_records_org_type     ON financial_records(org_id, type);
CREATE INDEX idx_records_org_category ON financial_records(org_id, category);

-- Soft delete — excludes deleted rows from all list queries
CREATE INDEX idx_records_org_deleted  ON financial_records(org_id, is_deleted);

-- Audit log queries
CREATE INDEX idx_audit_org            ON audit_logs(org_id);
CREATE INDEX idx_audit_entity         ON audit_logs(entity, entity_id);

-- Token management
CREATE UNIQUE INDEX idx_refresh_hash  ON refresh_tokens(token_hash);
CREATE UNIQUE INDEX idx_idempotency   ON idempotency_keys(key);
```

### Transactional Writes

Every mutation that requires consistency uses a Prisma transaction:

```typescript
await prisma.$transaction(async (tx) => {
  const record = await tx.financialRecord.create(...)
  await tx.auditLog.create(...)          // audit is atomic with the write
})
// If either fails → both roll back
```

---

## Security Model

### Authentication Flow

```
Login → access token (15m) + refresh token (7d, stored as hash in DB)
         ↓
Access token expires → POST /auth/refresh
         ↓
Old token revoked + new token pair issued (rotation)
         ↓
Logout → refresh token hash marked revoked
```

### Token Security

- Access tokens are short-lived (15 minutes) — limiting blast radius if stolen
- Refresh tokens are hashed in the database — raw token only exists in transit
- Token type claim (`access` vs `refresh`) is validated — a refresh token cannot be used as an access token
- Replay attack detection: if a refresh token that was already used is presented again, **all tokens for that user are revoked** immediately

### Defense Layers

| Layer | Control |
|---|---|
| Transport | HTTPS enforced |
| Headers | Helmet (CSP, HSTS, X-Frame-Options) |
| CORS | Allowlist of origins |
| Rate limiting | Redis-backed, per-user after auth (fallback: per-IP) |
| Auth | JWT with strict type validation |
| Authorization | Permission matrix + org isolation |
| Input | Zod validation on all inputs |
| Passwords | bcrypt with configurable cost factor (default: 12) |
| Errors | Stack traces never exposed to clients |
| Logs | Passwords, tokens, secrets automatically redacted |

### User Enumeration Prevention

The login endpoint returns the same error message and HTTP status for both "user not found" and "wrong password":

```json
{ "code": "UNAUTHORIZED", "message": "Invalid email or password" }
```

An attacker cannot determine which email addresses exist in the system from login responses.

---

## Performance Design

### Dashboard Aggregations

All analytics are computed in SQL, not JavaScript:

```sql
SELECT
  SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) AS total_expenses,
  COUNT(*) AS record_count
FROM financial_records
WHERE org_id = $1 AND is_deleted = false
```

Pulling all records into JavaScript and reducing them would be catastrophic at scale (1M records × 100 byte average = 100MB per request).

### Redis Caching

Dashboard endpoints use cache-first reads with automatic invalidation:

```
Request → Redis HIT  → return immediately (< 1ms)
        → Redis MISS → PostgreSQL query → store in Redis → return
```

Cache is invalidated on every record mutation (create/update/delete). TTLs:
- Summary, categories, trends: 30 seconds
- Recent activity: 15 seconds

Cache keys include query parameters — different date ranges are cached independently.

### N+1 Prevention

All joins are done in SQL, not in application code:

```sql
-- Recent activity — user name fetched in the same query, not per-record
SELECT fr.*, u.first_name, u.last_name
FROM financial_records fr
JOIN users u ON u.id = fr.user_id
WHERE fr.org_id = $1
```

### Parallel Queries

Count and data fetches run concurrently on list endpoints:

```typescript
const [total, items] = await Promise.all([
  prisma.financialRecord.count({ where }),
  prisma.financialRecord.findMany({ where, ... })
])
```

### Cluster Mode

In production, the server forks one worker per CPU core. Redis-backed rate limiting works correctly across all workers (no per-process counters).

---

## Observability

### Structured Logging

All logs are JSON-structured with Pino. In development, they are pretty-printed. In production, they are ingested by log aggregators (Datadog, Loki, CloudWatch).

Every log line includes: `timestamp`, `level`, `requestId`, `userId` (when authenticated), `action`.

Sensitive fields are automatically redacted: `password`, `passwordHash`, `token`, `tokenHash`, `secret`, `authorization`, `cookie`.

### Request Tracing

Every request gets a unique `requestId` (UUID). This ID is:
- Logged on every line within that request's lifecycle
- Returned in the `X-Request-Id` response header
- Accepted from clients via the `X-Request-Id` request header

This allows tracing a single request across distributed logs.

### Health Checks

Two endpoints for infrastructure orchestration:

- `GET /health` — liveness probe. Returns immediately. No DB calls. If this fails, the process is dead.
- `GET /ready` — readiness probe. Checks DB and Redis connectivity. Load balancers wait for this before routing traffic.

---

## Assumptions & Tradeoffs

### Assumptions

1. **Single currency** — the system stores amounts without a currency code. A real financial system would include a `currency` field and handle conversion. This was omitted as it was outside the assignment scope.

2. **Org-scoped records** — financial records belong to an organisation, not directly to individual users. The `userId` on a record tracks who created it, not who owns it.

3. **VIEWER role can read all org records** — a real system might restrict viewers to only their own records. The assignment specified "can only view dashboard data" but didn't clarify whether that includes raw records, so the more permissive interpretation was chosen.

4. **No double-entry ledger** — a production financial system would use debit/credit entries for auditability and balance verification. This would require a schema redesign and was omitted as out of scope.

### Tradeoffs

| Decision | Chosen | Alternative | Reason |
|---|---|---|---|
| Auth | JWT stateless | Session cookies | Stateless is simpler for APIs; refresh token rotation adds revocation |
| Soft delete | isDeleted flag | Archive table | Simpler queries; sufficient for this scale |
| Aggregation | Raw SQL | Materialized views | Raw SQL is simpler to maintain; materialized views add operational overhead |
| Pagination | Offset-based | Cursor-based | Offset is simpler for random-access UIs; cursor is better for infinite scroll at scale |
| Rate limiting | Per user/IP | Per endpoint | Per-endpoint limits are more precise but add config complexity |
| ABAC | orgId check | Row-level security | RLS would be more robust but requires DB-level setup outside Prisma |

### Future Improvements at Scale

- **Row-Level Security** in PostgreSQL — move org isolation to the DB layer entirely
- **Materialized views** — for dashboard aggregations when records exceed 10M rows
- **Cursor-based pagination** — replace offset pagination for large datasets
- **Event-driven audit** — emit domain events; audit consumer writes asynchronously
- **BullMQ background jobs** — refresh materialized views, send alerts, process heavy analytics
- **Read replicas** — route dashboard queries to replicas, writes to primary
- **Multi-currency support** — add `currency` field + exchange rate table

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (no DB/Redis required)
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage
```

### Test Architecture

**Unit tests** (`tests/unit/`) mock all external dependencies (DB, Redis, bcrypt, JWT). They run in milliseconds and validate business logic in isolation.

**Integration tests** (`tests/integration/`) mock at the repository layer and send real HTTP requests through the full Fastify middleware stack. They validate that RBAC, validation, and error handling work end-to-end.

No test requires a real database or Redis instance.

---

## Scripts Reference

```bash
npm run dev              # Start with hot reload (ts-node-dev)
npm run build            # Compile TypeScript → dist/
npm run start            # Run compiled output
npm run typecheck        # Type-check without emitting
npm run prisma:migrate   # Run DB migrations (dev)
npm run prisma:seed      # Seed demo data
npm run prisma:studio    # Open Prisma Studio (DB GUI)
npm test                 # Run all tests
npm run test:coverage    # Tests + coverage report
```
