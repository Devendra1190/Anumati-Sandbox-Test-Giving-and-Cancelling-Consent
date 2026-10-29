Continue the existing Anumati Sandbox project from Phase 1. Do not recreate the project or replace the UI unnecessarily.

Goal: Implement a working backend for consent management.

Use Node.js + Express + TypeScript and SQLite, unless the existing workspace already has a suitable backend.

Implement:
1. Create consent requests.
2. Grant consent.
3. Reject consent.
4. Withdraw granted consent.
5. Retrieve current consent status.
6. Retrieve consent history.
7. Store consent events with timestamps.
8. Persist all changes in SQLite so they survive page refreshes and server restarts.

Use REST APIs and validate incoming requests.

Each consent must be linked to a synthetic user, organisation, and specific purpose. Model statuses such as pending, active, rejected, withdrawn, and expired consistently.

Withdrawal must update the canonical consent state immediately. Preserve earlier events in an append-only application audit history.

Connect the existing frontend to these APIs and remove temporary mock state wherever real API data is now available.

Use fake data only. Run tests, fix errors, and provide the commands to start the frontend and backend.