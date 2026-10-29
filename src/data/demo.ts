import type { ConsentRecord, TestResult } from "../types";

export const demoUser = {
  name: "Aarav Mehta",
  initials: "AM",
  email: "aarav.mehta@example.test",
  id: "USR-DEMO-2048"
};

export const demoOrganisation = {
  name: "Northstar Financial",
  initials: "N",
  id: "ORG-DEMO-001",
  sector: "Financial services"
};

export const initialConsents: ConsentRecord[] = [
  {
    id: "CNS-1048",
    purpose: "Personalised recommendations",
    category: "Personalisation",
    status: "Active",
    grantedAt: "24 Oct 2026",
    expiresAt: "24 Oct 2027"
  },
  {
    id: "CNS-1047",
    purpose: "Monthly account statements",
    category: "Account services",
    status: "Active",
    grantedAt: "19 Oct 2026",
    expiresAt: "19 Oct 2027"
  },
  {
    id: "CNS-1046",
    purpose: "Partner offers and updates",
    category: "Marketing",
    status: "Withdrawn",
    grantedAt: "12 Oct 2026",
    expiresAt: "12 Oct 2027"
  },
  {
    id: "CNS-1045",
    purpose: "Fraud prevention checks",
    category: "Security",
    status: "Active",
    grantedAt: "08 Oct 2026",
    expiresAt: "08 Oct 2027"
  },
  {
    id: "CNS-1044",
    purpose: "Location-based services",
    category: "Personalisation",
    status: "Withdrawn",
    grantedAt: "02 Oct 2026",
    expiresAt: "02 Oct 2027"
  }
];

export const initialTestResults: TestResult[] = [
  {
    id: "TST-0082",
    name: "Withdrawal blocks future access",
    result: "Passed",
    detail: "Access correctly denied after consent withdrawal.",
    time: "Today, 10:42 AM"
  },
  {
    id: "TST-0081",
    name: "Purpose limitation check",
    result: "Passed",
    detail: "Data use matched the consented purpose.",
    time: "Today, 10:39 AM"
  },
  {
    id: "TST-0080",
    name: "Expired consent enforcement",
    result: "Failed",
    detail: "An expired consent was accepted by the mock service.",
    time: "Yesterday, 4:18 PM"
  }
];
