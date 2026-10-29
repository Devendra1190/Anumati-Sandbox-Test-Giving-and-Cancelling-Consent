export type Section =
  | "Dashboard"
  | "Consent Playground"
  | "Data Access Simulator"
  | "Automated Test Lab"
  | "Consent History";

export type ConsentStatus = "Active" | "Withdrawn" | "Expired";

export interface ConsentRecord {
  id: string;
  purpose: string;
  category: string;
  status: ConsentStatus;
  grantedAt: string;
  expiresAt: string;
}

export interface TestResult {
  id: string;
  name: string;
  result: "Passed" | "Failed";
  detail: string;
  time: string;
}
