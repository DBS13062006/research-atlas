// The four demo accounts, shared by seed:demo and demo:reset. Passwords come from SEED_PASSWORD.
export const DEMO_USERS = [
  { email: "admin@research-atlas.test", name: "Asha Admin", role: "ADMIN" },
  { email: "curator@research-atlas.test", name: "Cyrus Curator", role: "CURATOR" },
  { email: "rhea@research-atlas.test", name: "Rhea Researcher", role: "RESEARCHER" },
  { email: "ravi@research-atlas.test", name: "Ravi Researcher", role: "RESEARCHER" },
] as const;
