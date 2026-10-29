import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import { createDatabase, demoOrganization, demoPurposes, demoUser, demoUsers } from "./db.js";

const temporaryDirectories: string[] = [];

function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "anumati-api-"));
  temporaryDirectories.push(directory);
  const db = createDatabase(path.join(directory, "test.sqlite"));
  return { app: createApp(db), db, directory };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("consent REST API", () => {
  it("creates a pending request, grants it, and withdraws it with an append-only event history", async () => {
    const { app, db } = setup();
    const created = await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[2].id
    }).expect(201);
    assert.equal(created.body.data.status, "pending");

    await request(app).post(`/api/consents/${created.body.data.id}/grant`).expect(200).expect((res) => {
      assert.equal(res.body.data.status, "active");
    });
    await request(app).post(`/api/consents/${created.body.data.id}/withdraw`).expect(200).expect((res) => {
      assert.equal(res.body.data.status, "withdrawn");
    });

    const current = await request(app).get("/api/consents/status")
      .query({ purposeId: demoPurposes[2].id }).expect(200);
    assert.equal(current.body.data.status, "withdrawn");
    const history = await request(app).get(`/api/consents/${created.body.data.id}/history`).expect(200);
    assert.deepEqual(history.body.data.map((event: { eventType: string }) => event.eventType), [
      "withdrawn", "granted", "requested"
    ]);
    assert.throws(() => db.prepare("DELETE FROM consent_events").run(), /append-only/);
    db.close();
  });

  it("rejects invalid requests and invalid state transitions", async () => {
    const { app, db } = setup();
    await request(app).post("/api/consents").send({ purposeId: demoPurposes[0].id }).expect(400);
    await request(app).post("/api/consents").send({
      userId: "real-user",
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[0].id
    }).expect(400);

    const created = await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[2].id
    }).expect(201);
    await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[2].id
    }).expect(409);
    await request(app).post(`/api/consents/${created.body.data.id}/withdraw`).expect(409);
    await request(app).post(`/api/consents/${created.body.data.id}/reject`).expect(200);
    await request(app).post(`/api/consents/${created.body.data.id}/grant`).expect(409);
    const resubmitted = await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[2].id
    }).expect(201);
    assert.equal(resubmitted.body.data.status, "pending");
    db.close();
  });

  it("persists canonical state and its audit events across database reopen", async () => {
    const { app, db, directory } = setup();
    const created = await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[2].id
    }).expect(201);
    await request(app).post(`/api/consents/${created.body.data.id}/grant`).expect(200);
    await request(app).post("/api/test-lab/run").send({ testId: "grant" }).expect(200);
    db.close();

    const reopened: DatabaseSync = createDatabase(path.join(directory, "test.sqlite"));
    const restartedApp = createApp(reopened);
    const current = await request(restartedApp).get("/api/consents/status")
      .query({ purposeId: demoPurposes[2].id }).expect(200);
    assert.equal(current.body.data.status, "active");
    const history = await request(restartedApp).get(`/api/consents/${created.body.data.id}/history`).expect(200);
    assert.deepEqual(history.body.data.map((event: { eventType: string }) => event.eventType), ["granted", "requested"]);
    const savedTests = await request(restartedApp).get("/api/test-lab/results").expect(200);
    assert.equal(savedTests.body.data[0].name, "Consent can be granted successfully");
    assert.equal(savedTests.body.data[0].status, "PASS");
    const dashboard = await request(restartedApp).get("/api/dashboard/stats").expect(200);
    assert.equal(dashboard.body.data.tests, 1);
    reopened.close();
  });

  it("expires active consents and appends the expiry event", async () => {
    const { app, db } = setup();
    db.prepare("UPDATE consents SET expires_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", "CNS-1048");
    const current = await request(app).get("/api/consents/status")
      .query({ purposeId: demoPurposes[0].id }).expect(200);
    assert.equal(current.body.data.status, "expired");
    const history = await request(app).get("/api/consents/CNS-1048/history").expect(200);
    assert.equal(history.body.data[0].eventType, "expired");
    db.close();
  });

  it("rejects malformed ISO timestamps", async () => {
    const { app, db } = setup();
    await request(app).post("/api/consents").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: demoPurposes[0].id,
      expiresAt: "2027-02-31T12:00:00Z"
    }).expect(400);
    db.close();
  });

  it("allows exact-purpose access, then returns 403 without data after withdrawal", async () => {
    const { app, db } = setup();
    const purpose = demoPurposes[0];
    const createResponse = await request(app).post("/api/consents").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id
    }).expect(201);
    const consentId = createResponse.body.data.id as string;
    await request(app).post(`/api/consents/${consentId}/grant`).expect(200);

    await request(app).get("/api/data-access/check").query({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: purpose.category
    }).expect(200).expect((res) => {
      assert.equal(res.body.data.decision, "allowed");
    });

    const allowed = await request(app).post("/api/data-access").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: purpose.category
    }).expect(200);
    assert.equal(allowed.body.data.decision, "allowed");
    assert.ok(allowed.body.data.mockData);
    assert.equal(allowed.body.data.consentId, consentId);

    await request(app).post(`/api/consents/${consentId}/withdraw`).expect(200);
    const denied = await request(app).post("/api/data-access").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: purpose.category
    }).expect(403);
    assert.equal(denied.body.data.decision, "denied");
    assert.equal(denied.body.data.consentStatus, "withdrawn");
    assert.equal("mockData" in denied.body.data, false);

    const audit = await request(app).get("/api/consents/history").query({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id
    }).expect(200);
    assert.deepEqual(
      audit.body.data.filter((event: { eventType: string }) => event.eventType.startsWith("access_"))
        .map((event: { eventType: string }) => event.eventType),
      ["access_denied", "access_allowed"]
    );
    assert.throws(() => db.prepare("DELETE FROM access_attempts").run(), /append-only/);
    db.close();
  });

  it("denies missing consent and category mismatches without exposing mock data", async () => {
    const { app, db } = setup();
    const purpose = demoPurposes[0];
    const missingConsent = await request(app).post("/api/data-access").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: purpose.category
    }).expect(403);
    assert.equal(missingConsent.body.data.consentStatus, "not_found");
    assert.equal("mockData" in missingConsent.body.data, false);

    const categoryMismatch = await request(app).post("/api/data-access").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: "Security"
    }).expect(403);
    assert.equal(categoryMismatch.body.data.consentStatus, "active");
    assert.equal(categoryMismatch.body.data.decision, "denied");
    assert.equal("mockData" in categoryMismatch.body.data, false);

    const audit = await request(app).get("/api/consents/history").query({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id
    }).expect(200);
    assert.equal(audit.body.data[0].eventType, "access_denied");
    db.close();
  });

  it("denies rejected and expired consent", async () => {
    const { app, db } = setup();
    const rejectedPurpose = demoPurposes[2];
    const rejectedRequest = await request(app).post("/api/consents").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: rejectedPurpose.id
    }).expect(201);
    await request(app).post(`/api/consents/${rejectedRequest.body.data.id}/reject`).expect(200);
    const rejected = await request(app).post("/api/data-access").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: rejectedPurpose.id,
      dataCategory: rejectedPurpose.category
    }).expect(403);
    assert.equal(rejected.body.data.consentStatus, "rejected");
    assert.equal("mockData" in rejected.body.data, false);

    const expiredPurpose = demoPurposes[0];
    db.prepare("UPDATE consents SET expires_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", "CNS-1048");
    const expired = await request(app).post("/api/data-access").send({
      userId: demoUser.id,
      organizationId: demoOrganization.id,
      purposeId: expiredPurpose.id,
      dataCategory: expiredPurpose.category
    }).expect(403);
    assert.equal(expired.body.data.consentStatus, "expired");
    assert.equal("mockData" in expired.body.data, false);
    db.close();
  });

  it("runs the withdrawal ease suite against isolated consent logic and detects configured friction", async () => {
    const { app, db } = setup();
    const normal = await request(app).post("/api/test-lab/run").send({}).expect(200);
    assert.equal(normal.body.data.results.length, 9);
    assert.ok(normal.body.data.results.every((result: { status: string; expectedResult: string; actualResult: string; executionTimeMs: number }) =>
      ["PASS", "FAIL", "NEEDS REVIEW"].includes(result.status) &&
      result.expectedResult.length > 0 &&
      result.actualResult.length > 0 &&
      result.executionTimeMs >= 0
    ));
    assert.deepEqual(
      normal.body.data.results.filter((result: { status: string }) => result.status !== "PASS"),
      []
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM consents").get()?.count, 5);
    const storedResults = await request(app).get("/api/test-lab/results").expect(200);
    assert.equal(storedResults.body.data.length, 9);
    const initialStats = await request(app).get("/api/dashboard/stats").expect(200);
    assert.equal(initialStats.body.data.tests, 9);
    assert.equal(initialStats.body.data.passed, 9);
    assert.equal(initialStats.body.data.failed, 0);
    assert.equal(initialStats.body.data.activity.length, 7);

    await request(app).put("/api/test-lab/config").send({
      extraNavigation: true,
      mandatoryField: false,
      extraConfirmation: false,
      unnecessaryError: false
    }).expect(200);
    const navigationScenario = await request(app).post("/api/test-lab/run").send({ testId: "withdrawal-ease" }).expect(200);
    assert.equal(navigationScenario.body.data.results[0].testId, "withdrawal-ease");
    assert.equal(navigationScenario.body.data.results[0].status, "NEEDS REVIEW");
    assert.equal(navigationScenario.body.data.results[0].journeyComparison.withdrawal.navigationTransitions, 3);
    const reviewStats = await request(app).get("/api/dashboard/stats").expect(200);
    assert.equal(reviewStats.body.data.needsReview, 1);

    await request(app).put("/api/test-lab/config").send({
      extraNavigation: false,
      mandatoryField: true,
      extraConfirmation: false,
      unnecessaryError: false
    }).expect(200);
    const fieldScenario = await request(app).post("/api/test-lab/run").send({ testId: "withdrawal-ease" }).expect(200);
    assert.equal(fieldScenario.body.data.results[0].status, "FAIL");
    assert.equal(fieldScenario.body.data.results[0].journeyComparison.withdrawal.mandatoryFields, 1);
    const failureStats = await request(app).get("/api/dashboard/stats").expect(200);
    assert.equal(failureStats.body.data.failed, 1);

    const restored = await request(app).put("/api/test-lab/config").send({
      extraNavigation: false,
      mandatoryField: false,
      extraConfirmation: false,
      unnecessaryError: false
    }).expect(200);
    assert.equal(restored.body.data.extraNavigation, false);
    const normalAgain = await request(app).post("/api/test-lab/run").send({ testId: "withdrawal-ease" }).expect(200);
    assert.equal(normalAgain.body.data.results[0].status, "PASS");
    await request(app).put("/api/test-lab/config").send({ extraNavigation: "yes" }).expect(400);
    await request(app).post("/api/test-lab/run").send({ testId: "unknown" }).expect(400);
    db.close();
  });

  it("completes the grant-access-withdraw-deny workflow and restores demo data without deleting audit history", async () => {
    const { app, db } = setup();
    const purpose = demoPurposes.find((item) => item.id === "PUR-LOCATION")!;
    const created = await request(app).post("/api/consents").send({
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id
    }).expect(201);
    const consentId = created.body.data.id as string;
    await request(app).post(`/api/consents/${consentId}/grant`).expect(200);
    const requestBody = {
      userId: demoUsers[1].id,
      organizationId: demoOrganization.id,
      purposeId: purpose.id,
      dataCategory: purpose.category
    };
    const allowed = await request(app).post("/api/data-access").send(requestBody).expect(200);
    assert.ok(allowed.body.data.mockData);
    await request(app).post(`/api/consents/${consentId}/withdraw`).expect(200);
    const denied = await request(app).post("/api/data-access").send(requestBody).expect(403);
    assert.equal("mockData" in denied.body.data, false);

    await request(app).put("/api/test-lab/config").send({
      extraNavigation: true,
      mandatoryField: false,
      extraConfirmation: false,
      unnecessaryError: false
    }).expect(200);
    const scenarioResult = await request(app).post("/api/test-lab/run")
      .send({ testId: "withdrawal-ease" }).expect(200);
    assert.equal(scenarioResult.body.data.results[0].status, "NEEDS REVIEW");
    const historyBeforeReset = await request(app).get("/api/consents/history")
      .query({ userId: demoUsers[1].id, organizationId: demoOrganization.id }).expect(200);
    assert.ok(historyBeforeReset.body.data.some((event: { eventType: string }) => event.eventType === "access_allowed"));
    assert.ok(historyBeforeReset.body.data.some((event: { eventType: string }) => event.eventType === "access_denied"));

    const reset = await request(app).post("/api/demo/reset").expect(200);
    assert.match(reset.body.data.message, /audit history was retained/);
    assert.equal(reset.body.data.stats.active, 3);
    assert.equal(reset.body.data.stats.withdrawn, 2);
    assert.equal(reset.body.data.stats.tests, 0);
    assert.deepEqual(reset.body.data.stats.activity.length, 7);
    const restoredConsents = await request(app).get("/api/consents").expect(200);
    assert.equal(restoredConsents.body.data.length, 5);
    assert.deepEqual(
      restoredConsents.body.data.map((consent: { id: string; status: string }) => [consent.id, consent.status]).sort(),
      [
        ["CNS-1044", "withdrawn"],
        ["CNS-1045", "active"],
        ["CNS-1046", "withdrawn"],
        ["CNS-1047", "active"],
        ["CNS-1048", "active"]
      ].sort()
    );
    const resetHistory = await request(app).get("/api/consents/history")
      .query({ userId: demoUsers[1].id, organizationId: demoOrganization.id }).expect(200);
    assert.ok(resetHistory.body.data.some((event: { eventType: string }) => event.eventType === "demo_reset"));
    assert.ok(resetHistory.body.data.some((event: { eventType: string }) => event.eventType === "access_allowed"));
    assert.ok(resetHistory.body.data.some((event: { eventType: string }) => event.eventType === "access_denied"));
    await request(app).get(`/api/consents/${consentId}`).expect(404);
    await request(app).post(`/api/consents/${consentId}/withdraw`).expect(404);
    const afterResetAccess = await request(app).post("/api/data-access").send(requestBody).expect(403);
    assert.equal(afterResetAccess.body.data.consentStatus, "not_found");
    assert.equal("mockData" in afterResetAccess.body.data, false);
    const resultsAfterReset = await request(app).get("/api/test-lab/results").expect(200);
    assert.equal(resultsAfterReset.body.data.length, 0);
    const configAfterReset = await request(app).get("/api/test-lab/config").expect(200);
    assert.deepEqual(configAfterReset.body.data, {
      extraNavigation: false,
      mandatoryField: false,
      extraConfirmation: false,
      unnecessaryError: false
    });
    assert.throws(() => db.prepare("DELETE FROM demo_reset_events").run(), /append-only/);
    db.close();
  });
});
