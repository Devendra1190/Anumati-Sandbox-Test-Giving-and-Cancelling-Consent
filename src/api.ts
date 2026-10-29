import { demoOrganisation, demoUser } from "./data/demo";
import type { AccessDecision, AccessResponse, ConsentEvent, ConsentRecord, DashboardStats, TestLabConfig, TestResult } from "./types";

interface ApiEnvelope<T> {
  data: T;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok
      ? "The sandbox returned an invalid response."
      : `The sandbox request failed (${response.status}) without a valid error response.`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("The sandbox returned an invalid response.");
  }
  if (!response.ok) {
    const error = "error" in payload && typeof payload.error === "string" ? payload.error : null;
    throw new Error(error ?? `Request failed (${response.status}).`);
  }
  if (!("data" in payload)) {
    throw new Error("The sandbox response did not contain data.");
  }
  return (payload as ApiEnvelope<T>).data;
}

const demoQuery = new URLSearchParams({
  userId: demoUser.id,
  organizationId: demoOrganisation.id
});

export function getConsents(): Promise<ConsentRecord[]> {
  return apiRequest(`/api/consents?${demoQuery}`);
}

export function getConsentHistory(): Promise<ConsentEvent[]> {
  return apiRequest(`/api/consents/history?${demoQuery}`);
}

export function getDashboardStats(): Promise<DashboardStats> {
  return apiRequest("/api/dashboard/stats");
}

export function resetDemoData(): Promise<{ message: string; stats: DashboardStats }> {
  return apiRequest("/api/demo/reset", { method: "POST" });
}

export function createConsentRequest(purposeId: string): Promise<ConsentRecord> {
  return apiRequest("/api/consents", {
    method: "POST",
    body: JSON.stringify({
      userId: demoUser.id,
      organizationId: demoOrganisation.id,
      purposeId
    })
  });
}

export function transitionConsent(
  id: string,
  action: "grant" | "reject" | "withdraw"
): Promise<ConsentRecord> {
  return apiRequest(`/api/consents/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export function getTestLabConfig(): Promise<TestLabConfig> {
  return apiRequest("/api/test-lab/config");
}

export function updateTestLabConfig(config: TestLabConfig): Promise<TestLabConfig> {
  return apiRequest("/api/test-lab/config", {
    method: "PUT",
    body: JSON.stringify(config)
  });
}

export function runAutomatedTests(testId?: string): Promise<{ results: TestResult[]; config: TestLabConfig }> {
  return apiRequest("/api/test-lab/run", {
    method: "POST",
    body: JSON.stringify(testId ? { testId } : {})
  });
}

export function getTestResults(): Promise<TestResult[]> {
  return apiRequest("/api/test-lab/results");
}

export function checkMockDataAccess(input: {
  userId: string;
  dataCategory: string;
  purposeId: string;
}): Promise<AccessResponse> {
  const query = new URLSearchParams({
    userId: input.userId,
    organizationId: demoOrganisation.id,
    dataCategory: input.dataCategory,
    purposeId: input.purposeId
  });
  return apiRequest<AccessDecision>(`/api/data-access/check?${query}`)
    .then((data) => ({ httpStatus: 200, body: { data } }));
}

export async function requestMockDataAccess(input: {
  userId: string;
  dataCategory: string;
  purposeId: string;
}): Promise<AccessResponse> {
  const response = await fetch("/api/data-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, organizationId: demoOrganisation.id })
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Access request failed (${response.status}) with an invalid response.`);
  }
  if (!payload || typeof payload !== "object" || !("data" in payload) ||
    !payload.data || typeof payload.data !== "object") {
    const error = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Access request failed (${response.status}).`;
    throw new Error(error);
  }
  const body = payload as { data: AccessDecision; error?: string };
  return {
    httpStatus: response.status,
    body: { data: body.data, ...(body.error ? { error: body.error } : {}) }
  };
}
