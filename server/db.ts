import { DatabaseSync } from "node:sqlite";

export const demoUser = {
  id: "USR-DEMO-2048",
  name: "Aarav Mehta",
  email: "aarav.mehta@example.test"
};

export const demoUsers = [
  demoUser,
  {
    id: "USR-DEMO-4096",
    name: "Mira Sen",
    email: "mira.sen@example.test"
  }
] as const;

export const demoOrganization = {
  id: "ORG-DEMO-001",
  name: "Northstar Financial",
  sector: "Financial services"
};

export const demoPurposes = [
  { id: "PUR-RECOMMENDATIONS", name: "Personalised recommendations", category: "Personalisation" },
  { id: "PUR-STATEMENTS", name: "Monthly account statements", category: "Account services" },
  { id: "PUR-PARTNER-OFFERS", name: "Partner offers and updates", category: "Marketing" },
  { id: "PUR-FRAUD-PREVENTION", name: "Fraud prevention checks", category: "Security" },
  { id: "PUR-LOCATION", name: "Location-based services", category: "Personalisation" }
] as const;

export const initialConsentSeed = [
  { id: "CNS-1048", purposeId: "PUR-RECOMMENDATIONS", status: "active", date: "2026-10-24T08:30:00.000Z" },
  { id: "CNS-1047", purposeId: "PUR-STATEMENTS", status: "active", date: "2026-10-19T08:30:00.000Z" },
  { id: "CNS-1046", purposeId: "PUR-PARTNER-OFFERS", status: "withdrawn", date: "2026-10-12T08:30:00.000Z" },
  { id: "CNS-1045", purposeId: "PUR-FRAUD-PREVENTION", status: "active", date: "2026-10-08T08:30:00.000Z" },
  { id: "CNS-1044", purposeId: "PUR-LOCATION", status: "withdrawn", date: "2026-10-02T08:30:00.000Z" }
] as const;

export function createDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purposes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      purpose_id TEXT NOT NULL REFERENCES purposes(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'withdrawn', 'expired')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      granted_at TEXT,
      expires_at TEXT,
      is_demo_seed INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_consents_current
      ON consents(user_id, organization_id, purpose_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS consent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consent_id TEXT NOT NULL REFERENCES consents(id),
      event_type TEXT NOT NULL CHECK (event_type IN ('requested', 'granted', 'rejected', 'withdrawn', 'expired')),
      occurred_at TEXT NOT NULL,
      details TEXT
    );
    CREATE TABLE IF NOT EXISTS access_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consent_id TEXT REFERENCES consents(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      purpose_id TEXT NOT NULL REFERENCES purposes(id),
      data_category TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
      occurred_at TEXT NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_lab_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      extra_navigation INTEGER NOT NULL DEFAULT 0,
      mandatory_field INTEGER NOT NULL DEFAULT 0,
      extra_confirmation INTEGER NOT NULL DEFAULT 0,
      unnecessary_error INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS test_lab_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      name TEXT NOT NULL,
      expected_result TEXT NOT NULL,
      actual_result TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'NEEDS REVIEW')),
      execution_time_ms REAL NOT NULL,
      failure_explanation TEXT,
      journey_comparison TEXT,
      executed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_test_lab_results_run
      ON test_lab_results(run_id, id);
    CREATE TABLE IF NOT EXISTS demo_reset_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consent_id TEXT NOT NULL REFERENCES consents(id),
      occurred_at TEXT NOT NULL,
      details TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS demo_reset_events_no_update
      BEFORE UPDATE ON demo_reset_events BEGIN
        SELECT RAISE(ABORT, 'demo reset history is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS demo_reset_events_no_delete
      BEFORE DELETE ON demo_reset_events BEGIN
        SELECT RAISE(ABORT, 'demo reset history is append-only');
      END;
    CREATE INDEX IF NOT EXISTS idx_consent_events_consent
      ON consent_events(consent_id, occurred_at, id);
    CREATE INDEX IF NOT EXISTS idx_access_attempts_occurred
      ON access_attempts(occurred_at DESC, id DESC);
    CREATE TRIGGER IF NOT EXISTS consent_events_no_update
      BEFORE UPDATE ON consent_events BEGIN
        SELECT RAISE(ABORT, 'consent events are append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consent_events_no_delete
      BEFORE DELETE ON consent_events BEGIN
        SELECT RAISE(ABORT, 'consent events are append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS access_attempts_no_update
      BEFORE UPDATE ON access_attempts BEGIN
        SELECT RAISE(ABORT, 'access attempts are append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS access_attempts_no_delete
      BEFORE DELETE ON access_attempts BEGIN
        SELECT RAISE(ABORT, 'access attempts are append-only');
      END;
  `);
  migrateConsentColumns(db);
  db.prepare("INSERT OR IGNORE INTO test_lab_config (id) VALUES (1)").run();
  seedDatabase(db);
  return db;
}

function migrateConsentColumns(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(consents)").all() as Array<{ name: string }>;
  const existing = new Set(columns.map((column) => column.name));
  if (!existing.has("is_demo_seed")) {
    db.exec("ALTER TABLE consents ADD COLUMN is_demo_seed INTEGER NOT NULL DEFAULT 0");
  }
  if (!existing.has("archived_at")) {
    db.exec("ALTER TABLE consents ADD COLUMN archived_at TEXT");
  }
  const markSeed = db.prepare("UPDATE consents SET is_demo_seed = 1 WHERE id = ?");
  for (const consent of initialConsentSeed) markSeed.run(consent.id);
}

export interface WithdrawalJourneyConfig {
  extraNavigation: boolean;
  mandatoryField: boolean;
  extraConfirmation: boolean;
  unnecessaryError: boolean;
}

export function getWithdrawalJourneyConfig(db: DatabaseSync): WithdrawalJourneyConfig {
  const row = db.prepare(`
    SELECT extra_navigation AS extraNavigation, mandatory_field AS mandatoryField,
      extra_confirmation AS extraConfirmation, unnecessary_error AS unnecessaryError
    FROM test_lab_config WHERE id = 1
  `).get() as {
    extraNavigation: number;
    mandatoryField: number;
    extraConfirmation: number;
    unnecessaryError: number;
  };
  return {
    extraNavigation: row.extraNavigation === 1,
    mandatoryField: row.mandatoryField === 1,
    extraConfirmation: row.extraConfirmation === 1,
    unnecessaryError: row.unnecessaryError === 1
  };
}

export function setWithdrawalJourneyConfig(db: DatabaseSync, config: WithdrawalJourneyConfig): void {
  db.prepare(`
    UPDATE test_lab_config
    SET extra_navigation = ?, mandatory_field = ?, extra_confirmation = ?, unnecessary_error = ?
    WHERE id = 1
  `).run(
    Number(config.extraNavigation),
    Number(config.mandatoryField),
    Number(config.extraConfirmation),
    Number(config.unnecessaryError)
  );
}

export interface TestLabResultRow {
  id: string;
  runId: string;
  testId: string;
  name: string;
  expectedResult: string;
  actualResult: string;
  status: "PASS" | "FAIL" | "NEEDS REVIEW";
  executionTimeMs: number;
  failureExplanation: string | null;
  journeyComparison?: {
    grant: JourneyMetricsRow;
    withdrawal: JourneyMetricsRow;
    status: "PASS" | "FAIL" | "NEEDS REVIEW";
    explanation: string;
  };
  executedAt: string;
}

interface JourneyMetricsRow {
  actions: string[];
  clicks: number;
  navigationTransitions: number;
  mandatoryFields: number;
  additionalConfirmations: number;
  unnecessaryObstacles: number;
  errors: number;
}

export function saveTestLabResults(
  db: DatabaseSync,
  runId: string,
  results: Array<Omit<TestLabResultRow, "id" | "runId" | "executedAt">>
): TestLabResultRow[] {
  const executedAt = new Date().toISOString();
  withTransaction(db, () => {
    const insert = db.prepare(`
      INSERT INTO test_lab_results (
        run_id, test_id, name, expected_result, actual_result, status,
        execution_time_ms, failure_explanation, journey_comparison, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const result of results) {
      insert.run(
        runId,
        result.testId,
        result.name,
        result.expectedResult,
        result.actualResult,
        result.status,
        result.executionTimeMs,
        result.failureExplanation,
        result.journeyComparison ? JSON.stringify(result.journeyComparison) : null,
        executedAt
      );
    }
  });
  return getTestLabResults(db, runId);
}

export function getTestLabResults(db: DatabaseSync, runId?: string, limit = 50): TestLabResultRow[] {
  const rows = db.prepare(`
    SELECT id, run_id AS runId, test_id AS testId, name,
      expected_result AS expectedResult, actual_result AS actualResult,
      status, execution_time_ms AS executionTimeMs,
      failure_explanation AS failureExplanation,
      journey_comparison AS journeyComparison, executed_at AS executedAt
    FROM test_lab_results
    ${runId ? "WHERE run_id = ?" : ""}
    ORDER BY id DESC LIMIT ?
  `).all(...(runId ? [runId, limit] : [limit])) as Array<Omit<TestLabResultRow, "id" | "journeyComparison"> & {
    id: number;
    journeyComparison: string | null;
  }>;
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
    journeyComparison: row.journeyComparison ? JSON.parse(row.journeyComparison) as TestLabResultRow["journeyComparison"] : undefined
  }));
}

export interface DashboardStats {
  active: number;
  withdrawn: number;
  tests: number;
  passed: number;
  failed: number;
  needsReview: number;
  activity: Array<{ date: string; label: string; grants: number; withdrawals: number }>;
}

export function getDashboardStats(db: DatabaseSync, now = new Date()): DashboardStats {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM consents WHERE status = 'active' AND archived_at IS NULL) AS active,
      (SELECT COUNT(*) FROM consents WHERE status = 'withdrawn' AND archived_at IS NULL) AS withdrawn,
      (SELECT COUNT(*) FROM test_lab_results) AS tests,
      (SELECT COUNT(*) FROM test_lab_results WHERE status = 'PASS') AS passed,
      (SELECT COUNT(*) FROM test_lab_results WHERE status = 'FAIL') AS failed,
      (SELECT COUNT(*) FROM test_lab_results WHERE status = 'NEEDS REVIEW') AS needsReview
  `).get() as { active: number; withdrawn: number; tests: number; passed: number; failed: number; needsReview: number };
  const start = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const activityRows = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS date,
      SUM(CASE WHEN event_type = 'granted' THEN 1 ELSE 0 END) AS grants,
      SUM(CASE WHEN event_type = 'withdrawn' THEN 1 ELSE 0 END) AS withdrawals
    FROM consent_events
    WHERE occurred_at >= ?
    GROUP BY substr(occurred_at, 1, 10)
  `).all(start.toISOString()) as Array<{ date: string; grants: number; withdrawals: number }>;
  const byDate = new Map(activityRows.map((row) => [row.date, row]));
  const activity = Array.from({ length: 7 }, (_unused, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const countsForDay = byDate.get(dateKey);
    return {
      date: dateKey,
      label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(date),
      grants: countsForDay?.grants ?? 0,
      withdrawals: countsForDay?.withdrawals ?? 0
    };
  });
  return { ...counts, activity };
}

export function resetDemoData(db: DatabaseSync): void {
  const now = new Date();
  const nowIso = now.toISOString();
  withTransaction(db, () => {
    const archive = db.prepare(`
      SELECT id FROM consents WHERE is_demo_seed = 0 AND archived_at IS NULL
    `).all() as Array<{ id: string }>;
    const archiveConsent = db.prepare("UPDATE consents SET archived_at = ? WHERE id = ?");
    const appendResetEvent = db.prepare(`
      INSERT INTO demo_reset_events (consent_id, occurred_at, details)
      VALUES (?, ?, ?)
    `);
    for (const { id } of archive) {
      archiveConsent.run(nowIso, id);
      appendResetEvent.run(id, nowIso, "Non-seed consent archived by demo reset; consent and access audit history retained.");
    }

    const seedConsent = db.prepare(`
      UPDATE consents
      SET status = ?, created_at = ?, updated_at = ?, granted_at = ?, expires_at = ?, archived_at = NULL
      WHERE id = ?
    `);
    for (const [index, consent] of initialConsentSeed.entries()) {
      const createdAt = new Date(now.getTime() - index * 86_400_000);
      const grantedAt = createdAt.toISOString();
      const expiresAt = new Date(now.getTime() + 365 * 86_400_000).toISOString();
      seedConsent.run(consent.status, grantedAt, nowIso, grantedAt, expiresAt, consent.id);
      appendResetEvent.run(consent.id, nowIso, "Synthetic seed consent restored by demo reset; prior audit events retained.");
    }
    db.prepare("DELETE FROM test_lab_results").run();
    setWithdrawalJourneyConfig(db, {
      extraNavigation: false,
      mandatoryField: false,
      extraConfirmation: false,
      unnecessaryError: false
    });
  });
}

export function withTransaction<T>(db: DatabaseSync, callback: () => T): T {
  db.exec("BEGIN");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedDatabase(db: DatabaseSync): void {
  const seed = () => withTransaction(db, () => {
    const insertUser = db.prepare("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)");
    for (const user of demoUsers) insertUser.run(user.id, user.name, user.email);
    db.prepare("INSERT OR IGNORE INTO organizations (id, name, sector) VALUES (?, ?, ?)").run(demoOrganization.id, demoOrganization.name, demoOrganization.sector);
    for (const purpose of demoPurposes) {
      db.prepare("INSERT OR IGNORE INTO purposes (id, name, category) VALUES (?, ?, ?)").run(purpose.id, purpose.name, purpose.category);
    }

    const count = db.prepare("SELECT COUNT(*) AS count FROM consents").get() as { count: number };
    if (count.count > 0) return;

    const insertConsent = db.prepare(`
      INSERT INTO consents (id, user_id, organization_id, purpose_id, status, created_at, updated_at, granted_at, expires_at, is_demo_seed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertEvent = db.prepare(`
      INSERT INTO consent_events (consent_id, event_type, occurred_at, details)
      VALUES (?, ?, ?, ?)
    `);
    for (const consent of initialConsentSeed) {
      const expiry = new Date(consent.date);
      expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
      const expiresAt = expiry.toISOString();
      const withdrawn = consent.status === "withdrawn";
      insertConsent.run(
        consent.id, demoUser.id, demoOrganization.id, consent.purposeId, consent.status,
        consent.date, withdrawn ? new Date(new Date(consent.date).getTime() + 86_400_000).toISOString() : consent.date,
        consent.date, expiresAt
      );
      insertEvent.run(consent.id, "requested", consent.date, "Synthetic demo consent request.");
      insertEvent.run(consent.id, "granted", consent.date, "Synthetic demo consent grant.");
      if (withdrawn) {
        insertEvent.run(consent.id, "withdrawn", new Date(new Date(consent.date).getTime() + 86_400_000).toISOString(), "Synthetic demo withdrawal.");
      }
    }
  });
  seed();
}

export function synchronizeExpiredConsents(db: DatabaseSync, now = new Date().toISOString()): void {
  const expire = () => withTransaction(db, () => {
    const due = db.prepare(`
      SELECT id FROM consents
      WHERE status = 'active' AND archived_at IS NULL
        AND expires_at IS NOT NULL AND expires_at <= ?
    `).all(now) as Array<{ id: string }>;
    const update = db.prepare("UPDATE consents SET status = 'expired', updated_at = ? WHERE id = ?");
    const event = db.prepare(`
      INSERT INTO consent_events (consent_id, event_type, occurred_at, details)
      VALUES (?, 'expired', ?, 'Consent expired at its configured expiry time.')
    `);
    for (const consent of due) {
      update.run(now, consent.id);
      event.run(consent.id, now);
    }
  });
  expire();
}

export type ConsentRow = {
  id: string;
  userId: string;
  organizationId: string;
  purposeId: string;
  purpose: string;
  category: string;
  status: "pending" | "active" | "rejected" | "withdrawn" | "expired";
  createdAt: string;
  updatedAt: string;
  grantedAt: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
};

const consentSelect = `
  SELECT c.id, c.user_id AS userId, c.organization_id AS organizationId,
    c.purpose_id AS purposeId, p.name AS purpose, p.category, c.status,
    c.created_at AS createdAt, c.updated_at AS updatedAt,
    c.granted_at AS grantedAt, c.expires_at AS expiresAt, c.archived_at AS archivedAt
  FROM consents c JOIN purposes p ON p.id = c.purpose_id
`;

export function getConsent(db: DatabaseSync, id: string): ConsentRow | undefined {
  return db.prepare(`${consentSelect} WHERE c.id = ?`).get(id) as ConsentRow | undefined;
}

export function listConsents(
  db: DatabaseSync,
  filters: { userId?: string; organizationId?: string; status?: string }
): ConsentRow[] {
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters.userId) { conditions.push("c.user_id = ?"); values.push(filters.userId); }
  if (filters.organizationId) { conditions.push("c.organization_id = ?"); values.push(filters.organizationId); }
  if (filters.status) { conditions.push("c.status = ?"); values.push(filters.status); }
  conditions.push("c.archived_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`${consentSelect} ${where} ORDER BY c.created_at DESC, c.id DESC`).all(...values) as ConsentRow[];
}

export function currentConsent(
  db: DatabaseSync,
  filters: { userId: string; organizationId: string; purposeId: string }
): ConsentRow | undefined {
  return db.prepare(`
    ${consentSelect}
    WHERE c.user_id = ? AND c.organization_id = ? AND c.purpose_id = ? AND c.archived_at IS NULL
    ORDER BY c.created_at DESC, c.rowid DESC LIMIT 1
  `).get(filters.userId, filters.organizationId, filters.purposeId) as ConsentRow | undefined;
}
