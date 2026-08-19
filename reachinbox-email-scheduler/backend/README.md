# Backend

Express API server for ReachInbox Email Scheduler.

## REST API Architecture & Core Foundation (Phase 3)

The backend is built following a clean, layered architecture:

```
Request ──> Route ──> Middleware ──> Controller ──> Service ──> Repository ──> Prisma ──> PostgreSQL
```

- **Routes**: Define HTTP endpoints and validate schema constraints.
- **Middleware**: Intercepts request processing for logging, request ID injection, validation, and error management.
- **Controllers**: Handle HTTP concerns only (extract parameters, invoke services, choose HTTP status codes).
- **Services**: Contain business logic, integrity assertions, and domain constraints.
- **Repositories**: Encapsulate Prisma queries to keep data access operations decoupled from controllers and routes.
- **Prisma & PostgreSQL**: Data representation and persistence.

### Key Implementation Details:

1. **Service/Repository Separation**: Controllers do not directly access Prisma to keep business rules decoupled from database drivers. Repositories return plain, safe payloads to ensure data safety.
2. **Error System**: Standardized `ApiError` utility with codes (e.g. `VALIDATION_ERROR`, `CONFLICT`, `RESOURCE_NOT_FOUND`). Database anomalies (Prisma constraints like P2002 and P2025) are mapped to standard HTTP statuses (409 Conflict, 404 Not Found) globally, hiding stack traces and Prisma internals in production.
3. **Async Handling**: Centralized `asyncHandler` decorator eliminates boilerplate `try-catch` blocks from controller methods.
4. **Validation**: Done using Zod at the route level. All inputs (`req.body`, `req.query`, and `req.params`) are strictly validated before hitting controllers.
5. **Pagination**: Implemented a reusable parser supporting `?page=1&limit=20` with validation limits (`page >= 1`, `1 <= limit <= 100`) returning clean pagination metadata.
6. **Request Logging**: Powered by Pino. Logs HTTP method, path, status, duration, and Request ID. Automatically omits credentials (passwords, SMTP user/secrets, DB URLs).
7. **Request ID**: Captures `X-Request-ID` from requests (or generates a UUID) and attaches it to the response headers and logger traces.
8. **CORS & Security**: Enforces CORS using `FRONTEND_URL` and limits JSON body sizes to `1mb` using Helmet for secure response headers.

---

## API Routes

| Endpoint | Method | Parameters/Query | Description |
|---|---|---|---|
| `/api/health` | GET | None | Check API, Postgres, and Redis health |
| `/api/users/:id` | GET | UUID | Get user details (Dev only) |
| `/api/users/:id/senders` | GET | UUID | Get senders for a user (Dev only) |
| `/api/users/:id/campaigns` | GET | UUID | Get campaigns for a user (Dev only) |
| `/api/senders` | GET | `?userId={UUID}` | List senders of a user (excludes password) |
| `/api/senders` | POST | JSON Body | Configure a new sender (excludes password in output) |
| `/api/senders/:id` | GET | UUID | Retrieve single sender (excludes password) |
| `/api/senders/:id` | PATCH | UUID, JSON Body | Update safe sender parameters (strict validation) |
| `/api/campaigns` | GET | `?userId={UUID}` (Optional) | List campaigns |
| `/api/campaigns/:id` | GET | UUID | Get specific campaign details |
| `/api/campaigns/:id/emails` | GET | UUID, `?page=&limit=&senderId=&status=` | Get paginated email jobs of campaign |
| `/api/campaigns/:id/stats` | GET | UUID | Get campaign stats |
| `/api/email-jobs/scheduled` | GET | `?page=&limit=&campaignId=&senderId=&status=` | Paginated scheduled/processing jobs |
| `/api/email-jobs/sent` | GET | `?page=&limit=&campaignId=&senderId=&status=` | Paginated sent/failed jobs |
| `/api/email-jobs/:id` | GET | UUID | Get single email job details |

---

## onDelete Behavior

| Relation | Behavior | Reason |
|----------|----------|--------|
| User → Sender | Cascade | Senders are owned by the user |
| User → Campaign | Cascade | Campaigns are owned by the user |
| Campaign → EmailJob | Cascade | Jobs are meaningless without their campaign |
| Sender → EmailJob | Restrict | Prevents deleting a sender with existing jobs |

---

## Why EmailJob = One Recipient

Each `EmailJob` row represents **one email to one recipient**. A campaign with 500 recipients creates 500 independent jobs so workers can process, retry, and track delivery per recipient without losing granular state.

---

## Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled output
npm run lint         # ESLint
npm run test         # Run API & Database integration tests

npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations (dev)
npm run db:reset     # Reset database and re-seed
npm run db:seed      # Seed development data
npm run db:studio    # Open Prisma Studio
```

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

**Never commit `.env` or log `DATABASE_URL`, SMTP passwords, or OAuth secrets.**

## Distributed Rate Limiting

Email delivery is limited per sender with Redis-backed reservations. The relevant
configuration is:

```text
MAX_EMAILS_PER_HOUR=200
MAX_EMAILS_PER_HOUR_PER_SENDER=200
MIN_DELAY_BETWEEN_EMAILS=2000
RATE_LIMIT_WINDOW_SECONDS=3600
RATE_LIMIT_SAFETY_BUFFER_MS=100
RATE_LIMIT_KEY_PREFIX=reachinbox:rate
THROTTLE_KEY_PREFIX=reachinbox:throttle
WORKER_CONCURRENCY=5
```

`MAX_EMAILS_PER_HOUR_PER_SENDER` is the active limit. The sender-specific
`Sender.hourlyLimit` is retained as business configuration, while the Phase 8
runtime limiter uses the validated environment value consistently across all
workers. A global limit is not used, so one sender cannot block another.

```text
Worker 1 ─┐
Worker 2 ─┼──> Redis atomic limiter ──> SMTP
Worker 3 ─┘
```

In-memory counters are unsafe because each worker would see a different count.
The hourly key is
`reachinbox:rate:{senderId}:{UTC-hour-start}`. For example,
`reachinbox:rate:sender123:2026-08-19T18:00:00.000Z`. The Lua script atomically
checks and increments the counter, and applies a TTL through the end of the
UTC-hour plus the configured safety buffer. It returns denial at the limit; the
service then schedules the job at the next UTC-hour boundary. The minimum-delay
key is `reachinbox:throttle:{senderId}` and its Lua script atomically reserves
the next send timestamp with a short TTL.

The worker validates `scheduleVersion`, claims `SCHEDULED` to `PROCESSING`, and
checks the hourly reservation before the minimum-delay reservation. If either
constraint denies the send, the worker returns the row to `SCHEDULED`, updates
`scheduledAt` and `nextAttemptAt`, increments `rateLimitReschedules`, and adds a
new BullMQ delayed execution. Rate limiting never increments `attempts`,
`sentCount`, or `failedCount`; those counters change only for actual SMTP
delivery attempts. A reserved slot may remain consumed if SMTP fails after the
reservation. This intentionally preserves the throttling guarantee rather than
performing unsafe distributed counter rollback.

Execution IDs are deterministic: version 1 uses `email:{emailJobId}`, and later
executions use `email:{emailJobId}:v{scheduleVersion}`. PostgreSQL remains the
source of truth. An old BullMQ execution exits successfully when its version no
longer matches, preventing duplicate sends. The database transition back to
`SCHEDULED` is conditional on the processing version, so an unrelated worker
cannot overwrite a newer schedule.

BullMQ delayed jobs provide all future scheduling; there is no cron job or
polling scheduler. Multiple workers share Redis and can process different
senders fairly. Strict global ordering is impossible with distributed
concurrency, but campaign creation assigns `scheduledAt` in recipient order and
rescheduling uses the earliest availability for that sender. Redis failures
fail closed: the worker does not send, leaves the email retryable, and relies on
BullMQ retry behavior. Redis state therefore survives worker restarts according
to the configured Redis persistence policy.

`GET /api/senders/:id/rate-limit` is authenticated and checks sender ownership.
It returns limit, used, remaining, the UTC window, and minimum delay without
exposing Redis keys. Ethereal is used only for assignment/demo delivery; the
provider is isolated behind `EmailService`, so a production SMTP/provider can
replace it without changing the queue, database, scheduler, or limiter.
