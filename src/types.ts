export type Section =
  | "Dashboard"
  | "Consent Playground"
  | "Data Access Simulator"
  | "Automated Test Lab"
  | "Consent History";

export type ConsentStatus = "pending" | "active" | "rejected" | "withdrawn" | "expired";

export interface ConsentRecord {
  id: string;
  userId: string;
  organizationId: string;
  purposeId: string;
  purpose: string;
  category: string;
  status: ConsentStatus;
  createdAt: string;
  grantedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface ConsentEvent {
  id: number;
  consentId: string;
  eventType: "requested" | "granted" | "rejected" | "withdrawn" | "expired";
  occurredAt: string;
  details: string | null;
  purposeId: string;
  purpose: string;
  category: string;
  userId: string;
  organizationId: string;
}

export interface TestResult {
  id: string;
  name: string;
  result: "Passed" | "Failed";
  detail: string;
  time: string;
}
