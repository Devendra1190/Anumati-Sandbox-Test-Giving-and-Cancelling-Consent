# Anumati Sandbox

An interactive, local test sandbox for demonstrating consent grants, withdrawal, and backend-enforced mock-data access. **This is not a regulated Consent Manager, does not certify DPDP compliance, and must not be used with real personal data.** All bundled identities, organisations, consents, and protected records are synthetic.

## Requirements

- Node.js 22.13 or newer (uses Node's built-in `node:sqlite`)
- npm

## Install and run

From the project directory, install dependencies once:

```powershell
npm.cmd install
```

In the first terminal, start the API:

```powershell
npm.cmd run dev:server
```

In a second terminal, start Vite:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to the Express API at `http://localhost:3001`. If either port is in use, configure `PORT` for the API or use the Vite URL printed in its terminal.

The backend creates and seeds `data/anumati.sqlite` on first start. The `data` directory is ignored by Git. Set `DATABASE_PATH` to use another SQLite file; the parent directory is created automatically. `PORT` defaults to `3001`.

## Demonstration workflow

1. In **Consent Playground**, create and grant a request for a synthetic purpose.
2. In **Data Access Simulator**, request the matching category and purpose. The backend returns synthetic data only for valid active consent.
3. Withdraw the same consent. Retry the request: the API returns HTTP 403, records the denial, and returns no protected data.
4. In **Automated Test Lab**, run the nine checks or an individual check. Enable **Add extra navigation** (or another obstacle), run the withdrawal-ease test, then choose **Restore normal journey**.
5. In **Consent History**, inspect timestamped consent changes, access decisions, and reset events.

Use **Reset demo** on the Dashboard to restore the five predictable seed consent states, reset the Test Lab scenario, and clear stored test outcomes. The reset archives consent requests created during the demo and preserves the append-only consent, access, and reset audit history. Access attempts are never erased by reset.

## Architecture

- `src/` — React 18, TypeScript, Vite UI; shared pages and reusable components.
- `src/api.ts` — typed frontend REST client.
- `server/app.ts` — Express routes, request validation, consent state transitions, access control, and Test Lab execution.
- `server/db.ts` — SQLite schema, seed data, append-only audit triggers, persistence, and demo reset.
- `server/app.test.ts` — backend integration tests using temporary SQLite databases and Supertest.
- `data/anumati.sqlite` — local persistent sandbox database (created at runtime; not checked in).

Consent state and audit changes are stored in SQLite. The Test Lab runs consent/access checks against isolated in-memory SQLite databases, then persists their result summaries in the main database. Dashboard counts and the seven-day activity chart are read from backend data.

## REST API

JSON responses are wrapped in `{ "data": ... }`. Validation and state-transition errors use an `{ "error": "..." }` response.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | API health check |
| `GET` | `/api/demo-context` | Synthetic demo identities, organisation, and purposes |
| `GET` | `/api/dashboard/stats` | Current consent counts, persisted test counts, and seven-day activity |
| `POST` | `/api/demo/reset` | Restore seed state, reset Test Lab settings, and retain audit history |
| `GET` | `/api/consents` | List current, non-archived consents; optional `userId`, `organizationId`, and status filters |
| `POST` | `/api/consents` | Create a pending consent request |
| `GET` | `/api/consents/status?purposeId=...` | Retrieve the current consent state for a purpose |
| `GET` | `/api/consents/history` | Retrieve consent, access, and reset audit history |
| `GET` | `/api/consents/:id` | Retrieve a consent record |
| `GET` | `/api/consents/:id/history` | Retrieve one consent's event history |
| `POST` | `/api/consents/:id/grant` | Grant a pending request |
| `POST` | `/api/consents/:id/reject` | Reject a pending request |
| `POST` | `/api/consents/:id/withdraw` | Immediately withdraw active consent |
| `GET` | `/api/data-access/check` | Check exact-purpose/category coverage |
| `POST` | `/api/data-access` | Request mock data; denied requests return HTTP 403 without protected data |
| `GET` | `/api/test-lab/config` | Read the persisted withdrawal-journey scenario |
| `PUT` | `/api/test-lab/config` | Configure extra navigation, mandatory field, confirmation, or simulated error |
| `POST` | `/api/test-lab/run` | Run the complete suite or one test, e.g. `{"testId":"withdrawal-ease"}` |
| `GET` | `/api/test-lab/results` | Retrieve the most recent persisted outcomes (up to 100) |

Supported consent states are `pending`, `active`, `rejected`, `withdrawn`, and `expired`. Grant, reject, withdrawal, and expiry transitions append timestamped consent events. Access attempts and reset events are separate append-only records protected by SQLite triggers. Archived consent records remain available through audit history but cannot authorize access.

## Checks

```powershell
npm.cmd test
npm.cmd run build
```

The repository does not include a Playwright package or automated browser-test script. Backend integration tests are included; the end-to-end UI flow can be demonstrated in a browser using the local app.

## Known limitations

- The sandbox has no authentication, authorization, production deployment hardening, or real data integrations.
- The data-access simulator contains fixed synthetic records only.
- The withdrawal friction settings are a configurable test scenario, not instrumentation of an external consent-management journey. Reported counts are technical workflow measures, not legal conclusions.
- SQLite audit triggers protect events from updates/deletes through the application database, but this local demo is not a tamper-proof or legally certified audit system.
- Automated tests validate this demo's application logic, not the DPDP Act, legal compliance, or production integrations.
