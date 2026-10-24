import {
  BookMarked,
  Compass,
  FlaskConical,
  Gem,
  GitBranch,
  Grid3x3,
  Layers,
  Link2,
  type LucideIcon,
  Map as MapIcon,
  Route,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Discover",
    items: [
      { href: "/atlas", label: "Atlas", hint: "Every paper placed by meaning", icon: MapIcon },
      { href: "/search", label: "Search", hint: "Lexical, semantic and hybrid", icon: Search },
      { href: "/topics", label: "Topics", hint: "Domain → field → subfield → topic", icon: Layers },
      {
        href: "/integrity",
        label: "Integrity Radar",
        hint: "Retractions and their reach",
        icon: ShieldAlert,
      },
    ],
  },
  {
    title: "Explore",
    items: [
      { href: "/explore/lineage", label: "Lineage", hint: "Where an idea came from", icon: GitBranch },
      { href: "/explore/connect", label: "Connect", hint: "Shortest chain between two papers", icon: Link2 },
      {
        href: "/explore/fronts",
        label: "Research fronts",
        hint: "Communities ranked by growth",
        icon: TrendingUp,
      },
      { href: "/explore/gems", label: "Hidden gems", hint: "Influence the raw count misses", icon: Gem },
      { href: "/explore/observatory", label: "Observatory", hint: "Methods × datasets", icon: Grid3x3 },
    ],
  },
  {
    title: "Your work",
    items: [
      { href: "/library", label: "Library", hint: "Collections and notes", icon: BookMarked },
      { href: "/trails", label: "Reading trails", hint: "Curated routes through papers", icon: Route },
      { href: "/lab", label: "Query Lab", hint: "Run the SQL and Cypher catalog", icon: FlaskConical },
      { href: "/curate", label: "Curate", hint: "Import and edit papers", icon: Compass },
    ],
  },
];

export const PRIMARY_NAV: NavItem[] = [
  NAV_SECTIONS[0].items[0],
  NAV_SECTIONS[0].items[1],
  NAV_SECTIONS[0].items[2],
  { href: "/explore/lineage", label: "Explore", hint: "Lineage, fronts, gems", icon: GitBranch },
  NAV_SECTIONS[0].items[3],
  NAV_SECTIONS[2].items[1],
  NAV_SECTIONS[2].items[2],
];
