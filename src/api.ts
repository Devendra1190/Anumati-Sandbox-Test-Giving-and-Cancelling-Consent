import { demoOrganisation, demoUser } from "./data/demo";
import type { AccessDecision, AccessResponse, ConsentEvent, ConsentRecord, TestLabConfig, TestResult } from "./types";

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
  const payload = await response.json() as ApiEnvelope<T> | { error: string };
  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : `Request failed (${response.status}).`);
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
  const payload = await response.json() as { data?: AccessDecision; error?: string };
  if (!payload.data) {
    throw new Error(payload.error ?? `Access request failed (${response.status}).`);
  }
  return {
    httpStatus: response.status,
    body: { data: payload.data, ...(payload.error ? { error: payload.error } : {}) }
  };
}
