# ReachInbox Frontend

Phase 9 is a React, TypeScript, Tailwind CSS, React Router, Axios, and React Query client for the existing ReachInbox backend.

## Environment

Copy `.env.example` to `.env` and set:

```env
VITE_API_URL=http://localhost:5000/api
```

Only the public API URL belongs in frontend environment variables. Google secrets, SMTP credentials, and session tokens remain server-side. Authentication uses the backend's HTTP-only session cookie.

## Features

- Google OAuth through `GET /api/auth/google`
- Session restoration through `GET /api/auth/me`
- Logout through `POST /api/auth/logout`
- Real campaign dashboard metrics from `GET /api/campaigns`
- Multipart CSV/TXT campaign composer through `POST /api/campaigns`
- Active sender selection from `GET /api/senders`
- Paginated scheduled and sent email lists
- Ethereal preview links for successful deliveries
- Responsive dashboard layout with loading, empty, retry, and toast states

The composer previews recipient counts client-side only; the backend remains authoritative for parsing, validation, persistence, and queue scheduling. Local date-time input is converted to ISO 8601 before submission.

## Development and verification

From this directory:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Run the backend and worker independently from their workspace scripts. The frontend does not poll for scheduling state; it refreshes when a page is opened or after a campaign is created.