export const demoUser = {
  name: "Aarav Mehta",
  initials: "AM",
  email: "aarav.mehta@example.test",
  id: "USR-DEMO-2048"
};

export const demoUsers = [
  demoUser,
  {
    name: "Mira Sen",
    initials: "MS",
    email: "mira.sen@example.test",
    id: "USR-DEMO-4096"
  }
];

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

export const demoDataCategories = [...new Set(demoPurposes.map((purpose) => purpose.category))];
