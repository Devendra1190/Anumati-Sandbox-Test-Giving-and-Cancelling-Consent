import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import { createDatabase, demoOrganization, demoPurposes, demoUser } from "./db.js";

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
});
