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

const initialConsentSeed = [
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
      expires_at TEXT
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
  seedDatabase(db);
  return db;
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
      INSERT INTO consents (id, user_id, organization_id, purpose_id, status, created_at, updated_at, granted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
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
};

const consentSelect = `
  SELECT c.id, c.user_id AS userId, c.organization_id AS organizationId,
    c.purpose_id AS purposeId, p.name AS purpose, p.category, c.status,
    c.created_at AS createdAt, c.updated_at AS updatedAt,
    c.granted_at AS grantedAt, c.expires_at AS expiresAt
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
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`${consentSelect} ${where} ORDER BY c.created_at DESC, c.id DESC`).all(...values) as ConsentRow[];
}

export function currentConsent(
  db: DatabaseSync,
  filters: { userId: string; organizationId: string; purposeId: string }
): ConsentRow | undefined {
  return db.prepare(`
    ${consentSelect}
    WHERE c.user_id = ? AND c.organization_id = ? AND c.purpose_id = ?
    ORDER BY c.created_at DESC, c.rowid DESC LIMIT 1
  `).get(filters.userId, filters.organizationId, filters.purposeId) as ConsentRow | undefined;
}
