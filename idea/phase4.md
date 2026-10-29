Continue the existing Anumati Sandbox project.

Goal: Implement the main hackathon feature: an Automated Consent Withdrawal Ease Tester.

Build a Test Lab with a Run All Tests button and individual test controls.

Implement tests that verify:
1. Consent can be granted successfully.
2. Consent can be withdrawn successfully.
3. Data access stops immediately after withdrawal.
4. Access without consent is denied.
5. Purpose mismatches are denied.
6. Expired consent is denied.
7. Grant and withdrawal events appear in the audit history.
8. Repeated withdrawal does not reactivate consent or create inconsistent state.
9. Withdrawal requires no unjustified extra steps compared with granting consent.

Create a transparent comparison of:
- User actions or clicks.
- Navigation transitions.
- Mandatory form fields.
- Additional confirmations.
- Unnecessary obstacles or errors.

Add a configurable demonstration scenario with a flawed withdrawal journey, such as extra navigation or an unnecessary mandatory field.

The tester must detect the simulated problem and show FAIL or NEEDS REVIEW. It must also support restoring the normal journey.

Display each test's name, expected result, actual result, PASS/FAIL status, execution time, and failure explanation.

Run tests against actual application logic. Do not hardcode successful test results.

Do not claim equal click counts alone establish DPDP compliance. Clearly describe the score as a technical assessment, not legal certification.

Integrate the Test Lab into the existing UI. Run the tests and fix errors.