import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  currentConsent,
  demoPurposes,
  demoUser,
  demoOrganization,
  getConsent,
  listConsents,
  synchronizeExpiredConsents,
  withTransaction,
  type ConsentRow
} from "./db.js";

type EventType = "requested" | "granted" | "rejected" | "withdrawn" | "expired";

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new ApiError(400, `${field} must be a non-empty string of at most 200 characters.`);
  }
  return value.trim();
}

function optionalExpiry(value: unknown): string {
  if (value === undefined) {
    const expiry = new Date();
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    return expiry.toISOString();
  }
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "expiresAt must be a valid ISO-8601 timestamp.");
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new ApiError(400, "expiresAt must be a valid ISO-8601 timestamp.");
  }
  const expiresAt = new Date(value).toISOString();
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new ApiError(400, "expiresAt must be in the future.");
  }
  return expiresAt;
}

function appendEvent(db: DatabaseSync, consentId: string, eventType: EventType, details: string): void {
  db.prepare(`
    INSERT INTO consent_events (consent_id, event_type, occurred_at, details)
    VALUES (?, ?, ?, ?)
  `).run(consentId, eventType, new Date().toISOString(), details);
}

function eventHistory(db: DatabaseSync, consentId?: string, userId?: string, organizationId?: string) {
  const where: string[] = [];
  const values: string[] = [];
  if (consentId) { where.push("e.consent_id = ?"); values.push(consentId); }
  if (userId) { where.push("c.user_id = ?"); values.push(userId); }
  if (organizationId) { where.push("c.organization_id = ?"); values.push(organizationId); }
  const condition = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT e.id, e.consent_id AS consentId, e.event_type AS eventType,
      e.occurred_at AS occurredAt, e.details, p.id AS purposeId,
      p.name AS purpose, p.category, c.user_id AS userId,
      c.organization_id AS organizationId
    FROM consent_events e
    JOIN consents c ON c.id = e.consent_id
    JOIN purposes p ON p.id = c.purpose_id
    ${condition}
    ORDER BY e.occurred_at DESC, e.id DESC
  `).all(...values);
}

function actionConsent(
  db: DatabaseSync,
  consentId: string,
  action: "grant" | "reject" | "withdraw"
): ConsentRow {
  const consent = getConsent(db, consentId);
  if (!consent) throw new ApiError(404, "Consent request not found.");
  if (action === "grant" && consent.expiresAt && Date.parse(consent.expiresAt) <= Date.now()) {
    const now = new Date().toISOString();
    withTransaction(db, () => {
      db.prepare("UPDATE consents SET status = 'expired', updated_at = ? WHERE id = ?").run(now, consentId);
      appendEvent(db, consentId, "expired", "Consent request expired before it could be granted.");
    });
    throw new ApiError(409, "Cannot grant a consent request that has expired.");
  }
  const nextStatus = { grant: "active", reject: "rejected", withdraw: "withdrawn" }[action];
  const valid = action === "withdraw" ? consent.status === "active" : consent.status === "pending";
  if (!valid) {
    throw new ApiError(409, `Cannot ${action} a consent with status '${consent.status}'.`);
  }
  const now = new Date().toISOString();
  const update = () => withTransaction(db, () => {
    db.prepare(`
      UPDATE consents
      SET status = ?, updated_at = ?, granted_at = CASE WHEN ? = 'active' THEN ? ELSE granted_at END
      WHERE id = ?
    `).run(nextStatus, now, nextStatus, now, consentId);
    appendEvent(db, consentId, action === "grant" ? "granted" : action === "reject" ? "rejected" : "withdrawn",
      action === "withdraw" ? "Consent withdrawn; future access is blocked." : `Consent ${action}ed.`);
  });
  update();
  return getConsent(db, consentId)!;
}

export function createApp(db: DatabaseSync) {
  const app = express();
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use("/api", (_request, _response, next) => {
    synchronizeExpiredConsents(db);
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ data: { status: "ok" } });
  });

  app.get("/api/demo-context", (_request, response) => {
    response.json({ data: { user: demoUser, organization: demoOrganization, purposes: demoPurposes } });
  });

  app.get("/api/consents", (request, response) => {
    const status = request.query.status;
    if (status !== undefined && (typeof status !== "string" ||
      !["pending", "active", "rejected", "withdrawn", "expired"].includes(status))) {
      throw new ApiError(400, "status must be pending, active, rejected, withdrawn, or expired.");
    }
    response.json({ data: listConsents(db, {
      userId: queryString(request, "userId"),
      organizationId: queryString(request, "organizationId"),
      status: typeof status === "string" ? status : undefined
    }) });
  });

  app.get("/api/consents/status", (request, response) => {
    const userId = queryString(request, "userId") ?? demoUser.id;
    const organizationId = queryString(request, "organizationId") ?? demoOrganization.id;
    const purposeId = requiredString(request.query.purposeId, "purposeId");
    const consent = currentConsent(db, { userId, organizationId, purposeId });
    response.json({ data: consent ? { status: consent.status, consent } : { status: "not_found", consent: null } });
  });

  app.get("/api/consents/history", (request, response) => {
    response.json({ data: eventHistory(
      db,
      undefined,
      queryString(request, "userId"),
      queryString(request, "organizationId")
    ) });
  });

  app.post("/api/consents", (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Request body must be a JSON object.");
    const userId = requiredString(body.userId, "userId");
    const organizationId = requiredString(body.organizationId, "organizationId");
    const purposeId = requiredString(body.purposeId, "purposeId");
    const expiresAt = optionalExpiry(body.expiresAt);
    const exists = db.prepare(`
      SELECT
        EXISTS(SELECT 1 FROM users WHERE id = ?) AS userExists,
        EXISTS(SELECT 1 FROM organizations WHERE id = ?) AS organizationExists,
        EXISTS(SELECT 1 FROM purposes WHERE id = ?) AS purposeExists
    `).get(userId, organizationId, purposeId) as { userExists: number; organizationExists: number; purposeExists: number };
    if (!exists.userExists || !exists.organizationExists || !exists.purposeExists) {
      throw new ApiError(400, "userId, organizationId, and purposeId must reference the synthetic demo data.");
    }
    const current = currentConsent(db, { userId, organizationId, purposeId });
    if (current?.status === "pending" || current?.status === "active") {
      throw new ApiError(409, `A ${current.status} consent already exists for this purpose.`);
    }
    const id = `CNS-${randomUUID()}`;
    const now = new Date().toISOString();
    const create = () => withTransaction(db, () => {
      db.prepare(`
        INSERT INTO consents (id, user_id, organization_id, purpose_id, status, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(id, userId, organizationId, purposeId, now, now, expiresAt);
      appendEvent(db, id, "requested", "Consent request created.");
    });
    create();
    response.status(201).json({ data: getConsent(db, id) });
  });

  app.get("/api/consents/:id/history", (request, response) => {
    const consent = getConsent(db, request.params.id);
    if (!consent) throw new ApiError(404, "Consent request not found.");
    response.json({ data: eventHistory(db, request.params.id) });
  });

  app.get("/api/consents/:id", (request, response) => {
    const consent = getConsent(db, request.params.id);
    if (!consent) throw new ApiError(404, "Consent request not found.");
    response.json({ data: consent });
  });

  const actions = ["grant", "reject", "withdraw"] as const;
  for (const action of actions) {
    app.post(`/api/consents/:id/${action}`, (request, response) => {
      response.json({ data: actionConsent(db, request.params.id, action) });
    });
  }

  app.use((_request, _response, next) => next(new ApiError(404, "API route not found.")));
  const errors: ErrorRequestHandler = (error: unknown, _request: Request, response: Response, _next) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Request body must contain valid JSON." });
      return;
    }
    console.error("API request failed:", error);
    response.status(500).json({ error: "An unexpected server error occurred." });
  };
  app.use(errors);
  return app;
}

function queryString(request: Request, key: string): string | undefined {
  const value = request.query[key];
  if (value === undefined) return undefined;
  return requiredString(value, key);
}
