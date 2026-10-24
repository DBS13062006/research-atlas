// Generates docs/er/research-atlas-er.drawio: the v2 ER model in pure Chen notation.
// Rectangles are entities, diamonds relationships, ellipses attributes (key underlined, derived
// dashed). Lines carry 1 / N / M cardinality; a double line marks total participation.
// Layout is fixed by hand in three clusters: catalog (top), people and access (left), user content (bottom).
import { mkdirSync, writeFileSync } from "node:fs";

type Attr = { name: string; key?: boolean; derived?: boolean };
type Entity = {
  id: string;
  label: string;
  x: number;
  y: number;
  attrs: Attr[];
  arc: [number, number];
  radius?: number;
  // Explicit angles (degrees) per attribute, for entities whose free space is split by relationships.
  angles?: number[];
};
type Rel = { id: string; label: string; x: number; y: number; attrs?: Attr[]; arc?: [number, number] };
type Link = {
  rel: string;
  entity: string;
  card: string;
  total?: boolean;
  role?: string;
  // Optional fixed exit/entry points (0..1) on the entity and relationship shapes.
  exit?: [number, number];
  entry?: [number, number];
};

const ENTITY_W = 170;
const ENTITY_H = 60;
const REL_W = 170;
const REL_H = 84;
const ATTR_W = 145;
const ATTR_H = 40;

const a = (name: string, opts: Partial<Attr> = {}): Attr => ({ name, ...opts });

const entities: Entity[] = [
  // ── catalog ──
  {
    id: "paper",
    label: "PAPER",
    x: 1750,
    y: 1080,
    arc: [0, 0],
    radius: 330,
    angles: [-112, -98, -84, -70, -56, 196, 210, 224, 136, 149, 162, 174],
    attrs: [
      a("paper_id", { key: true }),
      a("title"),
      a("abstract"),
      a("doi"),
      a("arxiv_id"),
      a("publication_date"),
      a("publication_year", { derived: true }),
      a("work_type"),
      a("open_access"),
      a("oa_status"),
      a("cited_by_count"),
      a("local_citation_count", { derived: true }),
    ],
  },
  {
    id: "venue",
    label: "VENUE",
    x: 1250,
    y: 300,
    arc: [150, 330],
    attrs: [a("venue_id", { key: true }), a("venue_name"), a("venue_type"), a("publisher"), a("issn_l")],
  },
  {
    id: "author",
    label: "AUTHOR",
    x: 760,
    y: 1080,
    arc: [100, 260],
    attrs: [
      a("author_id", { key: true }),
      a("author_name"),
      a("orcid"),
      a("openalex_id"),
      a("h_index", { derived: true }),
    ],
  },
  {
    id: "institution",
    label: "INSTITUTION",
    x: 330,
    y: 560,
    arc: [130, 330],
    attrs: [
      a("institution_id", { key: true }),
      a("institution_name"),
      a("country_code"),
      a("institution_type"),
      a("ror_id"),
    ],
  },
  {
    id: "topic",
    label: "TOPIC",
    x: 2750,
    y: 380,
    arc: [150, 290],
    attrs: [a("topic_id", { key: true }), a("topic_name"), a("topic_level"), a("description")],
  },
  {
    id: "method",
    label: "METHOD",
    x: 3150,
    y: 1000,
    arc: [-60, 60],
    attrs: [a("method_id", { key: true }), a("method_name"), a("method_category"), a("introduced_year")],
  },
  {
    id: "dataset",
    label: "DATASET",
    x: 3150,
    y: 1560,
    arc: [-40, 90],
    attrs: [a("dataset_id", { key: true }), a("dataset_name"), a("modality"), a("domain")],
  },
  {
    id: "resource",
    label: "RESOURCE",
    x: 2650,
    y: 2120,
    arc: [-20, 120],
    attrs: [a("resource_id", { key: true }), a("resource_type"), a("resource_url")],
  },
  {
    id: "retraction",
    label: "RETRACTION",
    x: 2050,
    y: 2380,
    arc: [30, 150],
    attrs: [a("retraction_id", { key: true }), a("retraction_date"), a("status"), a("reason"), a("source")],
  },
  // ── people and access ──
  {
    id: "user",
    label: "USER",
    x: 520,
    y: 2000,
    arc: [240, 340],
    radius: 240,
    attrs: [a("user_id", { key: true }), a("name"), a("email"), a("password_hash"), a("is_active")],
  },
  {
    id: "role",
    label: "ROLE",
    x: 260,
    y: 2650,
    arc: [90, 200],
    attrs: [a("role_id", { key: true }), a("role_code"), a("role_name"), a("rank")],
  },
  {
    id: "permission",
    label: "PERMISSION",
    x: 900,
    y: 2900,
    arc: [30, 150],
    attrs: [a("permission_id", { key: true }), a("permission_code"), a("description")],
  },
  {
    id: "session",
    label: "SESSION",
    x: 120,
    y: 1500,
    arc: [180, 300],
    radius: 230,
    attrs: [a("session_id", { key: true }), a("expires_at"), a("ip")],
  },
  // ── user content ──
  {
    id: "collection",
    label: "COLLECTION",
    x: 1250,
    y: 2650,
    arc: [20, 160],
    radius: 230,
    attrs: [a("collection_id", { key: true }), a("collection_name"), a("description"), a("is_public")],
  },
  {
    id: "note",
    label: "NOTE",
    x: 1650,
    y: 2150,
    arc: [60, 160],
    attrs: [a("note_id", { key: true }), a("note_text"), a("is_private"), a("updated_at")],
  },
];

const relationships: Rel[] = [
  { id: "published_in", label: "PUBLISHED_IN", x: 1500, y: 680 },
  {
    id: "authored_by",
    label: "AUTHORED_BY",
    x: 1250,
    y: 1080,
    attrs: [a("author_order"), a("is_corresponding")],
    arc: [60, 120],
  },
  { id: "affiliated_with", label: "AFFILIATED_WITH", x: 550, y: 820 },
  { id: "cites", label: "CITES", x: 2300, y: 600 },
  {
    id: "categorized_as",
    label: "CATEGORIZED_AS",
    x: 2550,
    y: 760,
    attrs: [a("relevance_score"), a("is_primary")],
    arc: [-40, 10],
  },
  { id: "subtopic_of", label: "SUBTOPIC_OF", x: 3250, y: 380 },
  { id: "uses_method", label: "USES_METHOD", x: 2650, y: 1180, attrs: [a("usage_type")], arc: [80, 90] },
  { id: "uses_dataset", label: "USES_DATASET", x: 2650, y: 1560, attrs: [a("usage_type")], arc: [80, 90] },
  { id: "has_resource", label: "HAS_RESOURCE", x: 2250, y: 1760 },
  { id: "has_retraction", label: "HAS_RETRACTION", x: 2000, y: 1880 },
  { id: "has_role", label: "HAS_ROLE", x: 380, y: 2330 },
  { id: "grants", label: "GRANTS", x: 560, y: 2900 },
  { id: "has_session", label: "HAS_SESSION", x: 230, y: 1780 },
  { id: "owns", label: "OWNS", x: 850, y: 2380 },
  {
    id: "contains",
    label: "CONTAINS",
    x: 1300,
    y: 1820,
    attrs: [a("reading_status"), a("priority"), a("position"), a("added_at"), a("read_at")],
    arc: [150, 260],
  },
  { id: "writes", label: "WRITES", x: 1050, y: 2100 },
  { id: "annotates", label: "ANNOTATES", x: 1650, y: 1650 },
];

const links: Link[] = [
  { rel: "published_in", entity: "paper", card: "N" },
  { rel: "published_in", entity: "venue", card: "1" },
  { rel: "authored_by", entity: "paper", card: "M", total: true },
  { rel: "authored_by", entity: "author", card: "N" },
  { rel: "affiliated_with", entity: "author", card: "N" },
  { rel: "affiliated_with", entity: "institution", card: "1" },
  { rel: "cites", entity: "paper", card: "M", role: "citing", exit: [0.75, 0], entry: [0, 0.5] },
  { rel: "cites", entity: "paper", card: "N", role: "cited", exit: [1, 0.25], entry: [0.5, 1] },
  { rel: "categorized_as", entity: "paper", card: "M" },
  { rel: "categorized_as", entity: "topic", card: "N" },
  {
    rel: "subtopic_of",
    entity: "topic",
    card: "N",
    total: true,
    role: "child",
    exit: [0.75, 0],
    entry: [0.5, 0],
  },
  { rel: "subtopic_of", entity: "topic", card: "1", role: "parent", exit: [0.75, 1], entry: [0.5, 1] },
  { rel: "uses_method", entity: "paper", card: "M" },
  { rel: "uses_method", entity: "method", card: "N" },
  { rel: "uses_dataset", entity: "paper", card: "M" },
  { rel: "uses_dataset", entity: "dataset", card: "N" },
  { rel: "has_resource", entity: "paper", card: "1" },
  { rel: "has_resource", entity: "resource", card: "N", total: true },
  { rel: "has_retraction", entity: "paper", card: "1" },
  { rel: "has_retraction", entity: "retraction", card: "1", total: true },
  { rel: "has_role", entity: "user", card: "N", total: true },
  { rel: "has_role", entity: "role", card: "1" },
  { rel: "grants", entity: "role", card: "M" },
  { rel: "grants", entity: "permission", card: "N" },
  { rel: "has_session", entity: "user", card: "1" },
  { rel: "has_session", entity: "session", card: "N", total: true },
  { rel: "owns", entity: "user", card: "1" },
  { rel: "owns", entity: "collection", card: "N", total: true },
  { rel: "contains", entity: "collection", card: "M" },
  { rel: "contains", entity: "paper", card: "N" },
  { rel: "writes", entity: "user", card: "1" },
  { rel: "writes", entity: "note", card: "N", total: true },
  { rel: "annotates", entity: "note", card: "N", total: true },
  { rel: "annotates", entity: "paper", card: "1" },
];

// ── XML helpers ──
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cells: string[] = [];
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

const FONT = "fontFamily=Helvetica;fontColor=#1f2937;";
const ENTITY_STYLE = `rounded=0;whiteSpace=wrap;html=1;fillColor=#dbeafe;strokeColor=#1e3a8a;strokeWidth=2;fontStyle=1;fontSize=17;${FONT}`;
const REL_STYLE = `rhombus;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#92400e;strokeWidth=2;fontStyle=1;fontSize=13;${FONT}`;
const ATTR_STYLE = `ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#475569;fontSize=13;${FONT}`;
const LINE = "endArrow=none;html=1;rounded=0;strokeColor=#334155;strokeWidth=1.5;";
const DOUBLE = "endArrow=none;html=1;rounded=0;shape=link;width=5;strokeColor=#334155;strokeWidth=1.2;";

function vertex(id: string, value: string, style: string, cx: number, cy: number, w: number, h: number) {
  cells.push(
    `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(cx - w / 2)}" y="${Math.round(cy - h / 2)}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
  );
}

function edge(
  source: string,
  target: string,
  style: string,
  label?: string,
  exit?: [number, number],
  entry?: [number, number],
) {
  const id = nextId("e");
  const pts = [
    exit ? `exitX=${exit[0]};exitY=${exit[1]};exitDx=0;exitDy=0;` : "",
    entry ? `entryX=${entry[0]};entryY=${entry[1]};entryDx=0;entryDy=0;` : "",
  ].join("");
  cells.push(
    `<mxCell id="${id}" style="${style}${pts}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
  );
  if (label) {
    cells.push(
      `<mxCell id="${nextId("l")}" value="${esc(label)}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=15;fontStyle=1;labelBackgroundColor=#ffffff;${FONT}" vertex="1" connectable="0" parent="${id}"><mxGeometry x="-0.55" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`,
    );
  }
}

function attrLabel(attr: Attr): string {
  return attr.key ? `<u>${attr.name}</u>` : attr.name;
}

function placeAttrs(
  ownerId: string,
  cx: number,
  cy: number,
  attrs: Attr[],
  arc: [number, number],
  radius: number,
  angles?: number[],
) {
  const [from, to] = arc;
  const step = attrs.length > 1 ? Math.abs(to - from) / (attrs.length - 1) : 360;
  // Neighbours closer than an ellipse width on the same ring are pushed onto an outer ring.
  const crowded = !angles && ((step * Math.PI) / 180) * radius < ATTR_W + 12;
  attrs.forEach((attr, i) => {
    const t = attrs.length === 1 ? 0.5 : i / (attrs.length - 1);
    const deg = angles ? angles[i] : from + (to - from) * t;
    const rad = (deg * Math.PI) / 180;
    const outer = angles ? i % 2 === 1 && i < 8 : crowded && i % 2 === 1;
    const r = radius + (outer ? 115 : 0);
    const ax = cx + r * Math.cos(rad);
    const ay = cy + r * Math.sin(rad);
    const id = nextId("a");
    const style = attr.derived ? `${ATTR_STYLE}dashed=1;dashPattern=6 4;` : ATTR_STYLE;
    vertex(id, attrLabel(attr), style, ax, ay, ATTR_W, ATTR_H);
    edge(id, ownerId, LINE);
  });
}

for (const e of entities) {
  vertex(e.id, e.label, ENTITY_STYLE, e.x, e.y, ENTITY_W, ENTITY_H);
}
for (const r of relationships) {
  vertex(r.id, r.label, REL_STYLE, r.x, r.y, REL_W, REL_H);
}
for (const e of entities) {
  placeAttrs(e.id, e.x, e.y, e.attrs, e.arc, e.radius ?? 210, e.angles);
}
for (const r of relationships) {
  if (r.attrs && r.arc) placeAttrs(r.id, r.x, r.y, r.attrs, r.arc, 170);
}
for (const l of links) {
  const label = l.role ? `${l.card} (${l.role})` : l.card;
  edge(l.entity, l.rel, l.total ? DOUBLE : LINE, label, l.exit, l.entry);
}

// Legend and title.
cells.push(
  `<mxCell id="legend" value="${esc(
    "<b>Research Atlas — ER model (Chen notation)</b><br>Rectangle: entity · Diamond: relationship · Ellipse: attribute<br><u>underlined</u>: key attribute · dashed ellipse: derived attribute<br>1 / N / M: cardinality · double line: total participation<br>CITES and SUBTOPIC_OF are recursive; labels give the role of each side",
  )}" style="text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=15;strokeColor=#94a3b8;fillColor=#f8fafc;spacing=12;${FONT}" vertex="1" parent="1"><mxGeometry x="2500" y="2650" width="760" height="150" as="geometry"/></mxCell>`,
);

const xml = `<mxfile host="research-atlas" type="device"><diagram id="er" name="ER model"><mxGraphModel dx="3400" dy="3100" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="3400" pageHeight="3100" background="#ffffff" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel></diagram></mxfile>
`;

mkdirSync("docs/er", { recursive: true });
writeFileSync("docs/er/research-atlas-er.drawio", xml);
console.log(
  `Wrote docs/er/research-atlas-er.drawio (${entities.length} entities, ${relationships.length} relationships)`,
);
