// Turns an OpenAlex work into the JSON payload sp_import_paper expects. Every value is normalised to
// satisfy the schema's CHECK constraints (lower-case bare DOIs, closed vocabularies, ISSN format …).
export const shortId = (url: string | null | undefined): string | null =>
  url ? (url.split("/").pop() ?? null) : null;

export type OAWork = {
  id: string;
  doi: string | null;
  title: string | null;
  display_name: string | null;
  publication_date: string | null;
  type: string | null;
  cited_by_count: number;
  is_retracted?: boolean;
  open_access?: { is_oa: boolean; oa_status: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OALocation | null;
  best_oa_location?: OALocation | null;
  locations?: OALocation[];
  authorships?: {
    author_position: string;
    is_corresponding?: boolean;
    author: { id: string; display_name: string; orcid: string | null };
    institutions: {
      id: string;
      display_name: string;
      ror: string | null;
      country_code: string | null;
      type: string | null;
    }[];
  }[];
  topics?: {
    id: string;
    display_name: string;
    score: number;
    subfield: { id: string; display_name: string };
    field: { id: string; display_name: string };
    domain: { id: string; display_name: string };
  }[];
  primary_topic?: { id: string } | null;
  referenced_works?: string[];
};

type OALocation = {
  landing_page_url: string | null;
  pdf_url: string | null;
  source: {
    id: string;
    display_name: string;
    type: string | null;
    issn_l: string | null;
    host_organization_name: string | null;
  } | null;
};

export const WORK_FIELDS = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_date",
  "type",
  "cited_by_count",
  "is_retracted",
  "open_access",
  "abstract_inverted_index",
  "primary_location",
  "best_oa_location",
  "locations",
  "authorships",
  "topics",
  "primary_topic",
  "referenced_works",
].join(",");

const VENUE_TYPE: Record<string, string> = {
  journal: "JOURNAL",
  conference: "CONFERENCE",
  repository: "REPOSITORY",
  "book series": "BOOK_SERIES",
};
const INSTITUTION_TYPES = new Set([
  "EDUCATION",
  "COMPANY",
  "GOVERNMENT",
  "FACILITY",
  "NONPROFIT",
  "HEALTHCARE",
  "ARCHIVE",
  "OTHER",
]);
const OA_STATUS = new Set(["DIAMOND", "GOLD", "GREEN", "HYBRID", "BRONZE", "CLOSED"]);

export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  const text = words.filter(Boolean).join(" ").trim();
  return text.length > 0 ? text : null;
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function normaliseDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const bare = doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(bare) && bare.length <= 255 ? bare : null;
}

export function arxivId(work: OAWork): string | null {
  for (const loc of [work.primary_location, ...(work.locations ?? [])]) {
    const m = loc?.landing_page_url?.match(/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}|[a-z\-.]+\/[0-9]{7})/i);
    if (m) return m[1];
  }
  const doiMatch = work.doi?.match(/10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i);
  return doiMatch ? doiMatch[1] : null;
}

function workType(work: OAWork): string {
  const venueType = work.primary_location?.source?.type;
  switch (work.type) {
    case "article":
      return venueType === "conference" ? "PROCEEDINGS" : "ARTICLE";
    case "preprint":
      return "PREPRINT";
    case "review":
      return "REVIEW";
    case "book-chapter":
      return "BOOK_CHAPTER";
    case "dataset":
      return "DATASET";
    default:
      return "OTHER";
  }
}

const topicIdOf = (url: string, prefix: string) => {
  const id = url.split("/").pop() ?? "";
  return /^[A-Z]/.test(id) ? id : `${prefix}${id}`;
};

export function toPayload(work: OAWork): Record<string, unknown> | null {
  const openalexId = shortId(work.id);
  const title = stripTags(work.title ?? work.display_name ?? "");
  if (!openalexId || !title) return null;
  const isOa = work.open_access?.is_oa ?? false;
  let oaStatus = work.open_access?.oa_status?.toUpperCase() ?? null;
  if (oaStatus && !OA_STATUS.has(oaStatus)) oaStatus = null;
  if (oaStatus && (oaStatus === "CLOSED") === isOa) oaStatus = isOa ? null : "CLOSED";
  const date = work.publication_date && work.publication_date >= "1665-01-01" ? work.publication_date : null;
  const src = work.primary_location?.source;
  const issn = src?.issn_l && /^\d{4}-\d{3}[\dX]$/.test(src.issn_l) ? src.issn_l : null;

  const seenAuthors = new Set<string>();
  const authors = (work.authorships ?? [])
    .filter((a) => a.author?.id && a.author.display_name)
    .filter((a) => {
      const id = shortId(a.author.id) as string;
      if (seenAuthors.has(id)) return false;
      seenAuthors.add(id);
      return true;
    })
    .slice(0, 50)
    .map((a, i) => {
      const inst = a.institutions?.[0];
      const orcid = a.author.orcid?.replace(/^https?:\/\/orcid\.org\//, "") ?? null;
      const type = inst?.type?.toUpperCase();
      return {
        openalex_id: shortId(a.author.id),
        author_name: a.author.display_name.slice(0, 200),
        orcid: orcid && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid) ? orcid : null,
        order: i + 1,
        is_corresponding: a.is_corresponding ?? false,
        institution: inst?.id
          ? {
              openalex_id: shortId(inst.id),
              ror_id: inst.ror ?? null,
              institution_name: (inst.display_name ?? "Unknown institution").slice(0, 200),
              country_code:
                inst.country_code && /^[A-Z]{2}$/.test(inst.country_code) ? inst.country_code : null,
              institution_type: type && INSTITUTION_TYPES.has(type) ? type : type ? "OTHER" : null,
            }
          : null,
      };
    });

  // Two OpenAlex author records occasionally share an ORCID; keep it on the first only (uq_author_orcid).
  const seenOrcids = new Set<string>();
  for (const a of authors) {
    if (a.orcid && seenOrcids.has(a.orcid)) a.orcid = null;
    else if (a.orcid) seenOrcids.add(a.orcid);
  }

  const primaryTopic = shortId(work.primary_topic?.id);
  const topics = (work.topics ?? []).map((t) => ({
    openalex_id: shortId(t.id),
    topic_name: t.display_name,
    score: Math.min(Math.max(t.score ?? 0, 0), 1),
    is_primary: shortId(t.id) === primaryTopic,
    subfield: { openalex_id: topicIdOf(t.subfield.id, "SF"), name: t.subfield.display_name },
    field: { openalex_id: topicIdOf(t.field.id, "F"), name: t.field.display_name },
    domain: { openalex_id: topicIdOf(t.domain.id, "D"), name: t.domain.display_name },
  }));

  const resources: { resource_type: string; resource_url: string }[] = [];
  const pdf = work.best_oa_location?.pdf_url;
  if (pdf && /^https?:\/\//.test(pdf))
    resources.push({ resource_type: "PDF", resource_url: pdf.slice(0, 1000) });

  return {
    openalex_id: openalexId,
    doi: normaliseDoi(work.doi),
    arxiv_id: arxivId(work),
    title: title.slice(0, 1000),
    abstract: abstractFromIndex(work.abstract_inverted_index),
    publication_date: date,
    work_type: workType(work),
    open_access: isOa,
    oa_status: oaStatus,
    cited_by_count: Math.max(work.cited_by_count ?? 0, 0),
    paper_url:
      work.primary_location?.landing_page_url ??
      (work.doi ? `https://doi.org/${normaliseDoi(work.doi)}` : null),
    venue: src?.id
      ? {
          openalex_id: shortId(src.id),
          venue_name: (src.display_name ?? "Unknown venue").slice(0, 250),
          venue_type: VENUE_TYPE[src.type ?? ""] ?? "OTHER",
          publisher: src.host_organization_name?.slice(0, 200) ?? null,
          issn_l: issn,
        }
      : null,
    authors,
    topics,
    referenced_works: (work.referenced_works ?? []).map((r) => shortId(r)),
    resources,
  };
}
