import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  createDatabase,
  currentConsent,
  demoUsers,
  demoPurposes,
  demoUser,
  demoOrganization,
  getWithdrawalJourneyConfig,
  getConsent,
  listConsents,
  setWithdrawalJourneyConfig,
  synchronizeExpiredConsents,
  withTransaction,
  type ConsentRow,
  type WithdrawalJourneyConfig
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
  const consentWhere: string[] = [];
  const accessWhere: string[] = [];
  const consentValues: string[] = [];
  const accessValues: string[] = [];
  if (consentId) {
    consentWhere.push("e.consent_id = ?");
    consentValues.push(consentId);
  }
  if (userId) {
    consentWhere.push("c.user_id = ?");
    accessWhere.push("a.user_id = ?");
    consentValues.push(userId);
    accessValues.push(userId);
  }
  if (organizationId) {
    consentWhere.push("c.organization_id = ?");
    accessWhere.push("a.organization_id = ?");
    consentValues.push(organizationId);
    accessValues.push(organizationId);
  }
  if (consentId) accessWhere.push("a.consent_id = ?");
  if (consentId) accessValues.push(consentId);
  const consentCondition = consentWhere.length ? `WHERE ${consentWhere.join(" AND ")}` : "";
  const accessCondition = accessWhere.length ? `WHERE ${accessWhere.join(" AND ")}` : "";
  return db.prepare(`
    SELECT * FROM (
    SELECT CAST(e.id AS TEXT) AS id, e.consent_id AS consentId, e.event_type AS eventType,
      e.occurred_at AS occurredAt, e.details, p.id AS purposeId,
      p.name AS purpose, p.category, c.user_id AS userId,
      c.organization_id AS organizationId
    FROM consent_events e
    JOIN consents c ON c.id = e.consent_id
    JOIN purposes p ON p.id = c.purpose_id
    ${consentCondition}
    UNION ALL
    SELECT 'access-' || a.id AS id, a.consent_id AS consentId,
      CASE a.decision WHEN 'allowed' THEN 'access_allowed' ELSE 'access_denied' END AS eventType,
      a.occurred_at AS occurredAt, a.reason AS details, p.id AS purposeId,
      p.name AS purpose, a.data_category AS category, a.user_id AS userId,
      a.organization_id AS organizationId
    FROM access_attempts a
    JOIN purposes p ON p.id = a.purpose_id
    ${accessCondition}
    ) ORDER BY occurredAt DESC, id DESC
  `).all(...consentValues, ...accessValues);
}

interface AccessInput {
  userId: string;
  organizationId: string;
  purposeId: string;
  dataCategory: string;
}

interface AccessEvaluation {
  decision: "allowed" | "denied";
  userId: string;
  organizationId: string;
  purposeId: string;
  purpose: string;
  dataCategory: string;
  consentId: string | null;
  consentStatus: ConsentRow["status"] | "not_found";
  reason: string;
}

const syntheticRecords: Record<string, Record<string, string | string[]>> = {
  Personalisation: {
    profile: "Synthetic demo preferences",
    interests: ["financial wellness", "savings"]
  },
  "Account services": {
    accountReference: "DEMO-ACCT-2048",
    statementCycle: "Monthly"
  },
  Marketing: {
    preferredChannel: "Email (synthetic)",
    offerInterests: ["travel", "education"]
  },
  Security: {
    riskLevel: "Low (synthetic)",
    lastReview: "2026-10-28"
  }
};

export function evaluateAccess(db: DatabaseSync, input: AccessInput): AccessEvaluation {
  const demoUserExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(input.userId);
  const demoOrganizationExists = db.prepare("SELECT 1 FROM organizations WHERE id = ?").get(input.organizationId);
  const purpose = demoPurposes.find((candidate) => candidate.id === input.purposeId);
  if (!demoUserExists || !demoOrganizationExists || !purpose) {
    throw new ApiError(400, "Select a valid synthetic user, organisation, and processing purpose.");
  }
  if (!Object.hasOwn(syntheticRecords, input.dataCategory)) {
    throw new ApiError(400, "Select a valid synthetic data category.");
  }

  const consent = currentConsent(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    purposeId: input.purposeId
  });
  let reason = "";
  if (!consent) {
    reason = "No consent request exists for this user, organisation, and purpose.";
  } else if (consent.status !== "active") {
    reason = `Consent status is '${consent.status}'; active consent is required.`;
  } else if (consent.category !== input.dataCategory) {
    reason = `Consent covers '${consent.category}', not the requested '${input.dataCategory}' category.`;
  } else if (consent.expiresAt && Date.parse(consent.expiresAt) <= Date.now()) {
    reason = "Consent has expired.";
  } else {
    reason = "Active consent covers the exact requested purpose and data category.";
  }

  return {
    decision: consent?.status === "active" && consent.category === input.dataCategory &&
      (!consent.expiresAt || Date.parse(consent.expiresAt) > Date.now()) ? "allowed" : "denied",
    userId: input.userId,
    organizationId: input.organizationId,
    purposeId: purpose.id,
    purpose: purpose.name,
    dataCategory: input.dataCategory,
    consentId: consent?.id ?? null,
    consentStatus: consent?.status ?? "not_found",
    reason
  };
}

export function recordAccessAttempt(db: DatabaseSync, evaluation: AccessEvaluation): number {
  return withTransaction(db, () => {
    const result = db.prepare(`
      INSERT INTO access_attempts (
        consent_id, user_id, organization_id, purpose_id, data_category,
        decision, occurred_at, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evaluation.consentId,
      evaluation.userId,
      evaluation.organizationId,
      evaluation.purposeId,
      evaluation.dataCategory,
      evaluation.decision,
      new Date().toISOString(),
      evaluation.reason
    );
    return Number(result.lastInsertRowid);
  });
}

export function actionConsent(
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

function createPendingConsent(
  db: DatabaseSync,
  userId: string,
  organizationId: string,
  purposeId: string,
  expiresAt: string
): ConsentRow {
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
  withTransaction(db, () => {
    db.prepare(`
      INSERT INTO consents (id, user_id, organization_id, purpose_id, status, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, userId, organizationId, purposeId, now, now, expiresAt);
    appendEvent(db, id, "requested", "Consent request created.");
  });
  return getConsent(db, id)!;
}

interface EaseJourneyMetrics {
  actions: string[];
  clicks: number;
  navigationTransitions: number;
  mandatoryFields: number;
  additionalConfirmations: number;
  unnecessaryObstacles: number;
  errors: number;
}

function getEaseJourneyMetrics(config: WithdrawalJourneyConfig): {
  grant: EaseJourneyMetrics;
  withdrawal: EaseJourneyMetrics;
  status: "PASS" | "FAIL" | "NEEDS REVIEW";
  explanation: string;
} {
  const grant: EaseJourneyMetrics = {
    actions: ["Open Consent Playground", "Create consent request", "Grant consent"],
    clicks: 2,
    navigationTransitions: 1,
    mandatoryFields: 0,
    additionalConfirmations: 0,
    unnecessaryObstacles: 0,
    errors: 0
  };
  const withdrawal: EaseJourneyMetrics = {
    actions: ["Open Consent Playground", "Withdraw consent"],
    clicks: 1,
    navigationTransitions: 1,
    mandatoryFields: 0,
    additionalConfirmations: 0,
    unnecessaryObstacles: 0,
    errors: 0
  };
  if (config.extraNavigation) {
    withdrawal.actions.splice(1, 0, "Open Account Settings", "Open Privacy Centre");
    withdrawal.navigationTransitions += 2;
    withdrawal.clicks += 2;
    withdrawal.unnecessaryObstacles += 2;
  }
  if (config.mandatoryField) {
    withdrawal.actions.push("Enter mandatory withdrawal explanation");
    withdrawal.mandatoryFields++;
    withdrawal.clicks++;
    withdrawal.unnecessaryObstacles++;
  }
  if (config.extraConfirmation) {
    withdrawal.actions.push("Confirm withdrawal again");
    withdrawal.additionalConfirmations++;
    withdrawal.clicks++;
    withdrawal.unnecessaryObstacles++;
  }
  if (config.unnecessaryError) {
    withdrawal.actions.push("Recover from a simulated withdrawal error");
    withdrawal.errors++;
    withdrawal.clicks++;
    withdrawal.unnecessaryObstacles++;
  }

  if (withdrawal.mandatoryFields > grant.mandatoryFields ||
    withdrawal.additionalConfirmations > grant.additionalConfirmations ||
    withdrawal.errors > 0) {
    return {
      grant,
      withdrawal,
      status: "FAIL",
      explanation: "The withdrawal journey adds a mandatory field, extra confirmation, or simulated error that is absent from the grant journey."
    };
  }
  if (withdrawal.navigationTransitions > grant.navigationTransitions ||
    withdrawal.unnecessaryObstacles > 0) {
    return {
      grant,
      withdrawal,
      status: "NEEDS REVIEW",
      explanation: "The withdrawal journey introduces additional navigation or obstacles that need human review."
    };
  }
  return {
    grant,
    withdrawal,
    status: "PASS",
    explanation: "No additional mandatory fields, confirmations, navigation transitions, errors, or obstacles were detected for withdrawal."
  };
}

interface TestExecution {
  id: string;
  name: string;
  expectedResult: string;
  actualResult: string;
  status: "PASS" | "FAIL" | "NEEDS REVIEW";
  executionTimeMs: number;
  failureExplanation: string | null;
  journeyComparison?: ReturnType<typeof getEaseJourneyMetrics>;
}

function executeConsentTest(
  id: string,
  name: string,
  expectedResult: string,
  test: (db: DatabaseSync) => string
): TestExecution {
  const started = performance.now();
  const db = createDatabase(":memory:");
  try {
    const actualResult = test(db);
    return {
      id,
      name,
      expectedResult,
      actualResult,
      status: "PASS",
      executionTimeMs: Math.round((performance.now() - started) * 100) / 100,
      failureExplanation: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected test failure.";
    return {
      id,
      name,
      expectedResult,
      actualResult: message,
      status: "FAIL",
      executionTimeMs: Math.round((performance.now() - started) * 100) / 100,
      failureExplanation: message
    };
  } finally {
    db.close();
  }
}

function runConsentTests(config: WithdrawalJourneyConfig, selectedId?: string): TestExecution[] {
  const testDefinitions: Array<{
    id: string;
    name: string;
    expected: string;
    run: (db: DatabaseSync) => string;
  }> = [
    {
      id: "grant",
      name: "Consent can be granted successfully",
      expected: "A pending request transitions to active.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        const granted = actionConsent(db, request.id, "grant");
        assert.equal(granted.status, "active");
        return `Grant returned status '${granted.status}'.`;
      }
    },
    {
      id: "withdraw",
      name: "Consent can be withdrawn successfully",
      expected: "An active consent transitions to withdrawn.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        const withdrawn = actionConsent(db, request.id, "withdraw");
        assert.equal(withdrawn.status, "withdrawn");
        return `Withdrawal returned status '${withdrawn.status}'.`;
      }
    },
    {
      id: "access-after-withdrawal",
      name: "Data access stops immediately after withdrawal",
      expected: "The same purpose/category access request is denied after withdrawal.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        actionConsent(db, request.id, "withdraw");
        const decision = evaluateAccess(db, {
          userId: demoUsers[1].id,
          organizationId: demoOrganization.id,
          purposeId: "PUR-LOCATION",
          dataCategory: "Personalisation"
        });
        assert.equal(decision.decision, "denied");
        assert.equal(decision.consentStatus, "withdrawn");
        const auditId = recordAccessAttempt(db, decision);
        assert.ok(auditId > 0);
        return `Access was '${decision.decision}' with consent '${decision.consentStatus}'; denial audit #${auditId} recorded.`;
      }
    },
    {
      id: "no-consent",
      name: "Access without consent is denied",
      expected: "No matching consent produces a denied decision.",
      run: (db) => {
        const decision = evaluateAccess(db, {
          userId: demoUsers[1].id,
          organizationId: demoOrganization.id,
          purposeId: "PUR-LOCATION",
          dataCategory: "Personalisation"
        });
        assert.equal(decision.decision, "denied");
        assert.equal(decision.consentStatus, "not_found");
        return `Access was '${decision.decision}' with consent '${decision.consentStatus}'.`;
      }
    },
    {
      id: "purpose-mismatch",
      name: "Purpose and data-category mismatches are denied",
      expected: "Consent for a different purpose or data category cannot authorize the request.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        const decision = evaluateAccess(db, {
          userId: demoUsers[1].id,
          organizationId: demoOrganization.id,
          purposeId: "PUR-RECOMMENDATIONS",
          dataCategory: "Personalisation"
        });
        assert.equal(decision.decision, "denied");
        assert.equal(decision.consentStatus, "not_found");
        const categoryMismatch = evaluateAccess(db, {
          userId: demoUsers[1].id,
          organizationId: demoOrganization.id,
          purposeId: "PUR-LOCATION",
          dataCategory: "Security"
        });
        assert.equal(categoryMismatch.decision, "denied");
        assert.match(categoryMismatch.reason, /not the requested/);
        return `Purpose mismatch: ${decision.reason} Category mismatch: ${categoryMismatch.reason}`;
      }
    },
    {
      id: "expired",
      name: "Expired consent is denied",
      expected: "An expired consent cannot authorize access.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        const expiredAt = new Date(Date.now() - 1_000).toISOString();
        db.prepare("UPDATE consents SET expires_at = ? WHERE id = ?").run(expiredAt, request.id);
        synchronizeExpiredConsents(db);
        const decision = evaluateAccess(db, {
          userId: demoUsers[1].id,
          organizationId: demoOrganization.id,
          purposeId: "PUR-LOCATION",
          dataCategory: "Personalisation"
        });
        assert.equal(decision.decision, "denied");
        assert.equal(decision.consentStatus, "expired");
        return `Expired consent status '${decision.consentStatus}' produced '${decision.decision}'.`;
      }
    },
    {
      id: "audit-history",
      name: "Grant and withdrawal appear in audit history",
      expected: "Append-only history contains both grant and withdrawal events.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        actionConsent(db, request.id, "withdraw");
        const events = eventHistory(db, request.id) as Array<{ eventType: string }>;
        assert.ok(events.some((event) => event.eventType === "granted"));
        assert.ok(events.some((event) => event.eventType === "withdrawn"));
        return `History contains ${events.map((event) => event.eventType).join(", ")}.`;
      }
    },
    {
      id: "repeated-withdrawal",
      name: "Repeated withdrawal preserves canonical state",
      expected: "A second withdrawal is rejected; state stays withdrawn with no duplicate event.",
      run: (db) => {
        const request = createPendingConsent(db, demoUsers[1].id, demoOrganization.id, "PUR-LOCATION", new Date(Date.now() + 86_400_000).toISOString());
        actionConsent(db, request.id, "grant");
        actionConsent(db, request.id, "withdraw");
        const before = db.prepare("SELECT COUNT(*) AS count FROM consent_events WHERE consent_id = ? AND event_type = 'withdrawn'").get(request.id) as { count: number };
        assert.throws(() => actionConsent(db, request.id, "withdraw"), /Cannot withdraw/);
        const after = db.prepare("SELECT COUNT(*) AS count FROM consent_events WHERE consent_id = ? AND event_type = 'withdrawn'").get(request.id) as { count: number };
        assert.equal(getConsent(db, request.id)?.status, "withdrawn");
        assert.equal(after.count, before.count);
        return `Second withdrawal was rejected; status remains withdrawn and event count remains ${after.count}.`;
      }
    }
  ];
  const selected = selectedId ? testDefinitions.filter(({ id }) => id === selectedId) : testDefinitions;
  if (selectedId && selected.length === 0 && selectedId !== "withdrawal-ease") {
    throw new ApiError(400, "Unknown testId.");
  }
  const results = selected.map(({ id, name, expected, run }) =>
    executeConsentTest(id, name, expected, run));
  if (!selectedId || selectedId === "withdrawal-ease") {
    const started = performance.now();
    const journeyComparison = getEaseJourneyMetrics(config);
    results.push({
      id: "withdrawal-ease",
      name: "Withdrawal requires no unjustified extra steps",
      expectedResult: "Withdrawal has no extra mandatory field, confirmation, navigation, error, or obstacle versus the grant journey.",
      actualResult: `Grant: ${grantJourneySummary(journeyComparison.grant)} Withdrawal: ${grantJourneySummary(journeyComparison.withdrawal)} ${journeyComparison.explanation}`,
      status: journeyComparison.status,
      executionTimeMs: Math.round((performance.now() - started) * 100) / 100,
      failureExplanation: journeyComparison.status === "PASS" ? null : journeyComparison.explanation,
      journeyComparison
    });
  }
  return results;
}

function grantJourneySummary(metrics: EaseJourneyMetrics): string {
  return `${metricCount(metrics.clicks, "click")}; ${metricCount(metrics.navigationTransitions, "navigation transition")}; ${metricCount(metrics.mandatoryFields, "mandatory field")}; ${metricCount(metrics.additionalConfirmations, "confirmation")}; ${metricCount(metrics.unnecessaryObstacles, "obstacle")}; ${metricCount(metrics.errors, "error")}.`;
}

function metricCount(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
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
    response.json({ data: { user: demoUser, users: demoUsers, organization: demoOrganization, purposes: demoPurposes } });
  });

  app.get("/api/test-lab/config", (_request, response) => {
    response.json({ data: getWithdrawalJourneyConfig(db) });
  });

  app.put("/api/test-lab/config", (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      !["extraNavigation", "mandatoryField", "extraConfirmation", "unnecessaryError"]
        .every((key) => typeof body[key] === "boolean")) {
      throw new ApiError(400, "Provide boolean values for all withdrawal journey scenario settings.");
    }
    const config: WithdrawalJourneyConfig = {
      extraNavigation: body.extraNavigation as boolean,
      mandatoryField: body.mandatoryField as boolean,
      extraConfirmation: body.extraConfirmation as boolean,
      unnecessaryError: body.unnecessaryError as boolean
    };
    setWithdrawalJourneyConfig(db, config);
    response.json({ data: config });
  });

  app.post("/api/test-lab/run", (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "Request body must be a JSON object.");
    }
    const testId = body.testId === undefined ? undefined : requiredString(body.testId, "testId");
    const config = getWithdrawalJourneyConfig(db);
    response.json({ data: { results: runConsentTests(config, testId), config } });
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

  app.get("/api/data-access/check", (request, response) => {
    const evaluation = evaluateAccess(db, {
      userId: requiredString(request.query.userId, "userId"),
      organizationId: requiredString(request.query.organizationId, "organizationId"),
      purposeId: requiredString(request.query.purposeId, "purposeId"),
      dataCategory: requiredString(request.query.dataCategory, "dataCategory")
    });
    response.json({ data: evaluation });
  });

  app.post("/api/data-access", (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "Request body must be a JSON object.");
    }
    const evaluation = evaluateAccess(db, {
      userId: requiredString(body.userId, "userId"),
      organizationId: requiredString(body.organizationId, "organizationId"),
      purposeId: requiredString(body.purposeId, "purposeId"),
      dataCategory: requiredString(body.dataCategory, "dataCategory")
    });
    const auditId = recordAccessAttempt(db, evaluation);
    if (evaluation.decision === "denied") {
      response.status(403).json({
        error: "Access denied.",
        data: { ...evaluation, auditId }
      });
      return;
    }
    response.json({
      data: {
        ...evaluation,
        auditId,
        mockData: syntheticRecords[evaluation.dataCategory]
      }
    });
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
    response.status(201).json({
      data: createPendingConsent(db, userId, organizationId, purposeId, expiresAt)
    });
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
