# Phase 10 Test Report

Status values: **PASS** means executed successfully, **FAIL** means a reproducible defect or unavailable dependency caused failure, and **NOT VERIFIED** means the scenario requires infrastructure or credentials unavailable in this audit environment.

| Test | Purpose | Setup | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| Backend TypeScript build | Compile API and worker | `npm run build` in backend | Compiles and copies Lua assets | Passed | PASS |
| Frontend production build | Compile and bundle UI | `npm run build` in frontend | Production bundle created | Passed | PASS |
| Backend lint | Review backend source | `npm run lint` in backend | No lint errors | Passed | PASS |
| Frontend lint | Review frontend source | `npm run lint` in frontend | No lint errors | Passed | PASS |
| Prisma migration status | Verify schema state | `npx prisma migrate status` | Database is current | 4 migrations found; schema up to date | PASS |
| Authentication API | Session validation/logout | PostgreSQL available | 401 unauthenticated; valid session works; logout clears cookie | Included in passing backend tests | PASS |
| Authorization ownership | Cross-user resource access | PostgreSQL available | Cross-user sender/campaign/job access is rejected | Included in passing backend tests | PASS |
| Campaign validation/transaction | Validate multipart campaign creation | PostgreSQL available; scheduler mocked in tests | Invalid input rejected; transaction rolls back | Covered by passing campaign tests | PASS |
| CSV/TXT parsing | Normalize, deduplicate, reject invalid input | Parser tests | Lowercase valid emails and remove duplicates | Covered by passing tests | PASS |
| Health endpoints | Report API/database/Redis and queue state | API test app | Standard success envelope | Queue route exists; Redis-dependent live health unavailable | NOT VERIFIED |
| BullMQ scheduling | Durable delayed jobs and deterministic IDs | Redis required | Delayed jobs exist and are idempotent | Redis refused at `localhost:6379` | NOT VERIFIED |
| Worker delivery/SMTP | SENT, preview URL, counters | Redis + Ethereal required | SMTP success updates job/campaign exactly once | Redis unavailable; worker hooks timed out | NOT VERIFIED |
| Failed email/retry | Retry and terminal failure behavior | Redis + SMTP test config | Retryable errors retry; permanent errors become FAILED | Redis unavailable | NOT VERIFIED |
| API restart | Preserve delayed jobs | Redis required | Job survives API restart | Not executable without Redis | NOT VERIFIED |
| Worker restart | Preserve/process delayed jobs | Redis required | Job resumes without duplicate campaign/job | Not executable without Redis | NOT VERIFIED |
| Stale schedule version | Skip old execution | Redis required | Old version exits without send | Covered in suite but timed out without Redis | NOT VERIFIED |
| Hourly rate limit | Sender-scoped UTC limit | Redis required | Limit never exceeded | Rate-limit suite failed on Redis connection | NOT VERIFIED |
| Minimum delay | Atomic sender spacing | Redis required | Reservations are separated | Rate-limit suite failed on Redis connection | NOT VERIFIED |
| Multi-worker limit | Shared limiter across workers | Redis + two workers | Combined workers stay under limit | Not executable without Redis | NOT VERIFIED |
| Redis failure fail-closed | Prevent bypass on outage | Worker + Redis stop | Jobs remain recoverable and unsent | Connection failure observed; full recovery not run | NOT VERIFIED |
| 1000-job load | Bulk queue/database behavior | Redis + PostgreSQL required | 1000 rows/jobs without duplicates | Not executable without Redis | NOT VERIFIED |
| Frontend API compatibility | Real UI routes and payloads | Frontend build | `/api` paths, cookies, multipart fields match backend | Type/build verified; browser E2E not run | PASS (static) |
| Google OAuth E2E | Real login and refresh | Google credentials required | Login, refresh persistence, logout | Credentials/browser flow unavailable | NOT VERIFIED |
| Docker readiness | Start dependencies | Docker Desktop required | Compose starts Postgres/Redis with volumes | Docker CLI exists but daemon unavailable | NOT VERIFIED |

## Executed suite summary

The backend Vitest suite ran for approximately 278 seconds: **57 tests passed and 23 failed**. The failures were concentrated in Redis/BullMQ/rate-limit/worker suites and were caused by `ECONNREFUSED` on `localhost:6379`, followed by queue cleanup/test hook timeouts. PostgreSQL-backed suites passed.

## Security audit result

- No tracked `.env` files or credential files were found; the workspace is not a Git repository, so tracked-file history could not be audited.
- `.gitignore` excludes `.env`, `node_modules`, `dist`, coverage, and logs.
- Session cookies are HTTP-only, SameSite=Lax, and Secure in production.
- CORS uses the configured frontend origin with credentials; it is not wildcard CORS.
- Sender responses use safe selects and do not return SMTP passwords.
- Uploads are memory-only, limited by configured size, and restricted to CSV/TXT extensions.
- Production startup now rejects missing Google OAuth credentials.
- Development error responses include stacks by design; production responses do not. Do not use development mode for a public deployment.

## Fix applied during Phase 10

Minimum-delay denial previously consumed an hourly Redis reservation even though no email was sent. An atomic release Lua script now returns that reservation before rescheduling. Redis failures still fail closed.
