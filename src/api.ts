import { demoOrganisation, demoUser } from "./data/demo";
import type { ConsentEvent, ConsentRecord, ConsentStatus } from "./types";

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

export function getCurrentConsentStatus(purposeId: string): Promise<{
  status: ConsentStatus | "not_found";
  consent: ConsentRecord | null;
}> {
  const query = new URLSearchParams({ ...Object.fromEntries(demoQuery), purposeId });
  return apiRequest(`/api/consents/status?${query}`);
}
