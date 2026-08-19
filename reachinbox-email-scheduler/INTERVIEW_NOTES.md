# ReachInbox Interview Notes

1. **Why PostgreSQL?** It provides durable relational state, transactions, constraints, ownership relations, and queryable delivery history.
2. **Why Redis?** BullMQ requires Redis for delayed jobs and shared queue state. Redis also provides atomic, low-latency rate-limit reservations.
3. **Why BullMQ?** It supplies delayed delivery, retries, backoff, job IDs, worker concurrency, and restart-safe queue persistence.
4. **Why delayed jobs?** A future email is represented directly in Redis with a delay, so the schedule is not dependent on an API process remaining alive.
5. **Why not cron?** Cron is coarse and does not model one durable retryable job per recipient. BullMQ is the scheduling mechanism here.
6. **How does restart persistence work?** EmailJob rows remain in PostgreSQL and delayed jobs remain in Redis. Reconciliation can recreate a missing Redis job from the database row.
7. **How are duplicate jobs prevented?** The execution ID is deterministic from `emailJobId` and `scheduleVersion`; BullMQ rejects the same job ID.
8. **How does idempotency work?** The worker conditionally updates a job from SCHEDULED to PROCESSING. Only the worker that wins that update may send.
9. **How does worker concurrency work?** BullMQ controls concurrency per worker process. Multiple processes share the same queue and database claim transition.
10. **How does distributed rate limiting work?** Every worker reserves against sender-specific Redis keys, so workers see the same counters.
11. **Why Lua?** The hourly increment and minimum-delay reservation must be atomic. Lua keeps the read/check/write operation inside Redis.
12. **How are hourly limits enforced?** A UTC-window sender key increments only below the configured limit. Denials are rescheduled at the next window.
13. **How does minimum delay work?** A sender key stores the last reservation. Lua returns the next allowed timestamp when another reservation is too early.
14. **What happens if Redis goes down?** The worker fails closed, reverts PROCESSING to SCHEDULED, and lets BullMQ retry. It does not send without a reservation.
15. **What happens if the worker crashes?** BullMQ keeps the job. A job claimed as PROCESSING requires operational recovery/retry handling; the database remains the source of truth.
16. **What if SMTP succeeds but the worker crashes before the DB update?** The provider may have delivered the message while the row remains PROCESSING. This is an unavoidable distributed boundary without provider idempotency.
17. **Can exactly-once delivery be guaranteed?** No. The implementation prevents duplicate database claims, but absolute exactly-once external delivery requires an idempotency key supported by the SMTP/provider boundary.
18. **How does Google OAuth work?** Passport redirects to Google, receives the callback, finds or creates the user, creates a random server session token, and sets it in an HTTP-only cookie.
19. **How are users isolated?** Campaign, sender, and email-job repositories query through the authenticated user ID. Cross-user access returns a not-found style response.
20. **Why is PostgreSQL the source of truth?** Redis is an execution mechanism and can lose a queue entry or be rebuilt. PostgreSQL stores the campaign, recipient state, counters, timestamps, and final delivery result.

## Consistency trade-off

Campaign creation commits PostgreSQL first, then schedules BullMQ jobs. If Redis insertion fails, the campaign and recipient rows remain recoverable rather than being destructively rolled back. Reconciliation should enqueue SCHEDULED rows with deterministic IDs. The database and Redis are therefore coordinated through retry/reconciliation, not a distributed transaction.
