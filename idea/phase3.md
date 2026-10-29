Continue the existing Anumati Sandbox project.

Goal: Build a working Data Access Simulator for the mock organisation.

Requirements:
1. Add a UI where the organisation selects a synthetic user, data category, and processing purpose.
2. Implement backend endpoints to check consent and request mock-data access.
3. Allow access only when valid, active consent covers the exact requested purpose and data category.
4. Deny access when consent is missing, rejected, withdrawn, expired, or does not cover the request.
5. Record every allowed or denied access attempt in the audit log.
6. Display the actual API response and access decision in the frontend.
7. After withdrawal, retrying the same request must return HTTP 403 and reveal no protected mock data.
8. Enforce access checks on the backend, not merely through disabled frontend buttons.

Create synthetic example data and make the full workflow demonstrable:

Grant consent → Access allowed → Withdraw consent → Access denied.

Add automated backend tests for these scenarios. Preserve the existing UI and code structure, run the tests, and fix errors.