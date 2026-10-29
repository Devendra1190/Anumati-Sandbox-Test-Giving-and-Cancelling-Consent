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
    db.close();

    const reopened: DatabaseSync = createDatabase(path.join(directory, "test.sqlite"));
    const restartedApp = createApp(reopened);
    const current = await request(restartedApp).get("/api/consents/status")
      .query({ purposeId: demoPurposes[2].id }).expect(200);
    assert.equal(current.body.data.status, "active");
    const history = await request(restartedApp).get(`/api/consents/${created.body.data.id}/history`).expect(200);
    assert.deepEqual(history.body.data.map((event: { eventType: string }) => event.eventType), ["granted", "requested"]);
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
});
