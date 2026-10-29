# Anumati Sandbox

Phase 1 consent-management demo with a React/Vite frontend and an Express REST API backed by SQLite. All seeded users, organisations, purposes, and consent records are synthetic.

## Requirements

- Node.js 22.13 or newer (the API uses Node's built-in `node:sqlite` module)
- npm

## Start locally

In the project folder, install dependencies once:

```powershell
npm.cmd install
```

Start the backend in one terminal:

```powershell
npm.cmd run dev:server
```

Start the frontend in a second terminal:

```powershell
npm.cmd run dev
```

Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). Vite proxies `/api` requests to `http://localhost:3001`.

The SQLite database is created at `data/anumati.sqlite` and seeded on first startup. It is intentionally ignored by Git. Set `DATABASE_PATH` to use another file, or `PORT` to change the API port.

## REST API

All responses use a `{ "data": ... }` envelope; validation and state-transition errors return `{ "error": "..." }`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API health check |
| `GET` | `/api/demo-context` | Synthetic demo user, organisation, and purposes |
| `GET` | `/api/consents` | List consent records; optional `userId`, `organizationId`, and `status` filters |
| `POST` | `/api/consents` | Create a `pending` request with `userId`, `organizationId`, `purposeId`, and optional future ISO `expiresAt` |
| `GET` | `/api/consents/status?purposeId=...` | Current record for a user, organisation, and purpose |
| `GET` | `/api/consents/history` | Append-only audit events; optional user/organisation filters |
| `GET` | `/api/consents/:id` | Retrieve the canonical current consent state |
| `GET` | `/api/consents/:id/history` | Retrieve events for one consent |
| `POST` | `/api/consents/:id/grant` | Grant a pending request |
| `POST` | `/api/consents/:id/reject` | Reject a pending request |
| `POST` | `/api/consents/:id/withdraw` | Immediately withdraw an active consent |
| `GET` | `/api/data-access/check` | Check whether `userId`, `organizationId`, `purposeId`, and `dataCategory` are covered by active consent |
| `POST` | `/api/data-access` | Request mock data; returns HTTP 403 and no protected data unless exact active consent covers the request |

Every successful state transition updates the canonical consent row and appends a timestamped event in the same SQLite transaction. Database triggers prevent audit-event updates and deletes. Expired active records are transitioned to `expired` when the API is accessed.

Every `POST /api/data-access` decision is stored in the append-only `access_attempts` table and appears in consent history as `access_allowed` or `access_denied`. The simulator uses synthetic profile, account-service, marketing, and security data only.

## Validate

```powershell
npm.cmd test
npm.cmd run build
```
