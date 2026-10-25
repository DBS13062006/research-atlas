import type { demoIds, SeedRole } from "./helpers";

// Every page the app serves, with the role that may see it and the heading it must show.
// Shared by the smoke, screenshot and accessibility specs.

export type Ids = Awaited<ReturnType<typeof demoIds>>;
export type PageCase = {
  name: string;
  path: (ids: Ids) => string;
  heading: RegExp;
  role?: SeedRole;
  ready?: string;
};

export const PAGES: PageCase[] = [
  { name: "home", path: () => "/", heading: /./ },
  { name: "atlas", path: () => "/atlas", heading: /placed by meaning/i, ready: "canvas" },
  { name: "search", path: () => "/search?q=graph+neural+networks&mode=hybrid", heading: /find papers/i },
  { name: "paper", path: (i) => `/papers/${i.paperId}`, heading: /attention/i },
  { name: "author", path: (i) => `/authors/${i.authorId}`, heading: /./ },
  { name: "topics", path: () => "/topics", heading: /domain/i },
  { name: "topic", path: (i) => `/topics/${i.topicId}`, heading: /./ },
  { name: "integrity", path: () => "/integrity", heading: /retract/i },
  { name: "lineage", path: (i) => `/explore/lineage?paper=${i.paperId}`, heading: /lineage|idea/i },
  { name: "connect", path: () => "/explore/connect", heading: /connect|chain/i },
  { name: "fronts", path: () => "/explore/fronts", heading: /moving/i },
  { name: "gems", path: () => "/explore/gems", heading: /influence/i },
  { name: "observatory", path: () => "/explore/observatory", heading: /methods are tested/i },
  { name: "trails", path: () => "/trails", heading: /curated routes/i },
  { name: "library", path: () => "/library", heading: /your reading/i, role: "researcher" },
  { name: "account", path: () => "/account", heading: /account/i, role: "researcher" },
  { name: "curate", path: (i) => `/curate?paper=${i.paperId}`, heading: /catalog/i, role: "curator" },
  { name: "admin", path: () => "/admin", heading: /run the atlas/i, role: "admin" },
  { name: "login", path: () => "/login", heading: /sign in|welcome/i },
  { name: "signup", path: () => "/signup", heading: /account|join|sign up/i },
  { name: "trail", path: (i) => `/trails/${i.trailId}`, heading: /./ },
  { name: "lab", path: () => "/lab?q=Q15", heading: /running live/i, role: "researcher" },
];
