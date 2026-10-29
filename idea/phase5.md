Finish and polish the existing Anumati Sandbox project. Do not rebuild it from scratch.

Goal: Prepare a reliable, professional hackathon demonstration.

Tasks:
1. Connect all dashboard statistics to real backend data.
2. Verify the Consent Playground, Data Access Simulator, Test Lab, and Consent History.
3. Add a one-click demo reset that restores predictable synthetic test data.
4. Ensure all core actions persist correctly after page refresh.
5. Verify the complete workflow:

   Grant consent → Access allowed → Withdraw consent → Access denied → Run automated tests → Detect flawed withdrawal journey.

6. Improve loading states, error messages, success notifications, accessibility, and mobile responsiveness.
7. Add appropriate empty states and clear synthetic-data labels.
8. Add a README with installation instructions, architecture, API endpoints, database setup, testing commands, and known limitations.
9. Run frontend build checks, backend tests, and browser-based tests if Playwright is configured.
10. Fix all discovered issues and report any tests that could not be executed.

Keep the application explicitly labelled as a test sandbox, not a regulated Consent Manager. Use synthetic data only.

At completion, give me:
- Commands to run the application.
- The local demo URL.
- A short presentation script.
- Test results.
- Any remaining limitations.

Do not report success for features or tests that have not actually been verified.