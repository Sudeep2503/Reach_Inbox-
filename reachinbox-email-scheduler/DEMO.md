# ReachInbox 5-Minute Demo

Use a running PostgreSQL and Redis environment, a configured Google OAuth client, and Ethereal SMTP credentials.

- **00:00 - Project overview:** Show the monorepo. Explain PostgreSQL as the source of truth, Redis/BullMQ as the durable delayed queue, and the separate API and worker processes.
- **00:30 - Google login:** Open `http://localhost:5173/login` and click Continue with Google. Show the redirect back to `/dashboard` and the authenticated user header.
- **01:00 - Dashboard:** Point out the real campaign metrics and the scheduled/sent navigation. Refresh to demonstrate session persistence through the HTTP-only cookie.
- **01:30 - Compose campaign:** Click Compose new email. Select an active sender, enter a subject and plain-text body, choose a future local start time, and set delay and hourly limit.
- **02:15 - CSV upload and scheduling:** Upload a CSV/TXT list. Show the client-side preview count, submit the multipart request, and show the success toast with backend-authoritative recipient results.
- **02:45 - Scheduled emails:** Open Scheduled. Show recipient, subject, local scheduled time, status, pagination, and the fact that jobs are backed by BullMQ delayed entries.
- **03:15 - Worker processing:** Start the worker and wait for delivery. Explain atomic claiming, configurable concurrency, retry behavior, stale schedule-version protection, and Redis fail-closed behavior.
- **03:45 - Sent emails:** Open Sent. Show SENT status, sent time, and View email opening the Ethereal preview in a new tab. Mention FAILED rows use a user-safe message.
- **04:15 - Restart scenario:** Stop and restart the API, then show that the session and delayed job remain in PostgreSQL/Redis. Restart the worker and show the same job is processed without creating a duplicate.
- **04:40 - Rate limiting/concurrency:** Explain that two workers share atomic Lua reservations per sender. Show hourly limit and minimum delay settings, and explain that rate-limited jobs are rescheduled rather than marked failed.
- **05:00 - Architecture summary:** Close with ownership-scoped repositories, transactional campaign creation, deterministic queue IDs, and the documented exactly-once delivery trade-off.
