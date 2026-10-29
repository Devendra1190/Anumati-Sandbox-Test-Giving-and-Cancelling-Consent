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
  id: number | string;
  consentId: string | null;
  eventType: "requested" | "granted" | "rejected" | "withdrawn" | "expired" | "access_allowed" | "access_denied";
  occurredAt: string;
  details: string | null;
  purposeId: string;
  purpose: string;
  category: string;
  userId: string;
  organizationId: string;
}

export interface AccessDecision {
  decision: "allowed" | "denied";
  userId: string;
  organizationId: string;
  purposeId: string;
  purpose: string;
  dataCategory: string;
  consentId: string | null;
  consentStatus: ConsentStatus | "not_found";
  reason: string;
  auditId?: number;
  mockData?: Record<string, string | string[]>;
}

export interface AccessResponse {
  httpStatus: number;
  body: {
    error?: string;
    data: AccessDecision;
  };
}

export interface TestResult {
  id: string;
  name: string;
  expectedResult: string;
  actualResult: string;
  status: "PASS" | "FAIL" | "NEEDS REVIEW";
  executionTimeMs: number;
  failureExplanation: string | null;
  journeyComparison?: {
    grant: JourneyMetrics;
    withdrawal: JourneyMetrics;
    status: "PASS" | "FAIL" | "NEEDS REVIEW";
    explanation: string;
  };
}

export interface JourneyMetrics {
  actions: string[];
  clicks: number;
  navigationTransitions: number;
  mandatoryFields: number;
  additionalConfirmations: number;
  unnecessaryObstacles: number;
  errors: number;
}

export interface TestLabConfig {
  extraNavigation: boolean;
  mandatoryField: boolean;
  extraConfirmation: boolean;
  unnecessaryError: boolean;
}
