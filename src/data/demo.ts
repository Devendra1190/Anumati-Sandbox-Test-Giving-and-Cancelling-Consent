import type { TestResult } from "../types";

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

export const demoPurposes = [
  { id: "PUR-RECOMMENDATIONS", name: "Personalised recommendations", category: "Personalisation" },
  { id: "PUR-STATEMENTS", name: "Monthly account statements", category: "Account services" },
  { id: "PUR-PARTNER-OFFERS", name: "Partner offers and updates", category: "Marketing" },
  { id: "PUR-FRAUD-PREVENTION", name: "Fraud prevention checks", category: "Security" },
  { id: "PUR-LOCATION", name: "Location-based services", category: "Personalisation" }
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
