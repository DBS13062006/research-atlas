// Zod schemas shared by forms, server actions and the API. One schema both validates input and
// documents it in the OpenAPI reference.
import { z } from "zod";

export const idParam = z.coerce.number().int().positive().max(9_007_199_254_740_991);

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});

export const paperListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  year_from: z.coerce.number().int().min(1665).max(2100).optional(),
  year_to: z.coerce.number().int().min(1665).max(2100).optional(),
  topic_id: idParam.optional(),
  open_access: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Keyset cursor: "<cited_by_count>:<paper_id>" of the last row of the previous page.
  cursor: z
    .string()
    .regex(/^\d+:\d+$/)
    .optional(),
});

export const workTypes = [
  "ARTICLE",
  "PREPRINT",
  "PROCEEDINGS",
  "REVIEW",
  "BOOK_CHAPTER",
  "DATASET",
  "OTHER",
] as const;
export const oaStatuses = ["DIAMOND", "GOLD", "GREEN", "HYBRID", "BRONZE", "CLOSED"] as const;

export const paperCreate = z.object({
  title: z.string().trim().min(1).max(1000),
  abstract: z.string().trim().max(20000).nullish(),
  doi: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^10\.\d{4,9}\/\S+$/, "DOI must look like 10.1234/abcd, without https://doi.org/")
    .nullish(),
  publication_date: z.iso.date().nullish(),
  venue_id: idParam.nullish(),
  work_type: z.enum(workTypes).default("ARTICLE"),
  open_access: z.boolean().default(false),
  oa_status: z.enum(oaStatuses).nullish(),
  paper_url: z.url().max(1000).nullish(),
});
export const paperUpdate = paperCreate.partial();

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  mode: z.enum(["lexical", "semantic", "hybrid"]).default("hybrid"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  year_from: z.coerce.number().int().min(1665).max(2100).optional(),
  topic_id: idParam.optional(),
  open_access: z.enum(["true", "false"]).optional(),
});

export const lineageQuery = z.object({
  direction: z.enum(["ancestors", "descendants"]).default("ancestors"),
  depth: z.coerce.number().int().min(1).max(4).default(3),
  engine: z.enum(["sql", "graph"]).default("sql"),
});

export const pathQuery = z.object({ from: idParam, to: idParam });

export const relationTypes = ["EXTENDS", "IMPROVES_UPON", "CONTRADICTS", "REPLICATES", "RELATED_TO"] as const;
export const relationCreate = z.object({
  to_paper_id: idParam,
  type: z.enum(relationTypes),
  note: z.string().trim().max(2000).nullish(),
  confidence: z.number().int().min(1).max(5).default(3),
});
export const relationUpdate = z
  .object({
    type: z.enum(relationTypes).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    confidence: z.number().int().min(1).max(5).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change");

export const readingStatuses = ["NOT_READ", "READING", "READ"] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH"] as const;

export const collectionCreate = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullish(),
  is_public: z.boolean().default(false),
});
export const collectionUpdate = collectionCreate.partial();
export const collectionPaperAdd = z.object({
  paper_id: idParam,
  priority: z.enum(priorities).default("MEDIUM"),
});
export const collectionPaperUpdate = z
  .object({
    reading_status: z.enum(readingStatuses).optional(),
    priority: z.enum(priorities).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change");

export const noteCreate = z.object({
  paper_id: idParam,
  text: z.string().trim().min(1).max(20000),
  is_private: z.boolean().default(true),
});
export const noteUpdate = z
  .object({ text: z.string().trim().min(1).max(20000).optional(), is_private: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change");

export const trailCreate = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullish(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
});
export const trailUpdate = trailCreate.partial();
export const trailStepAdd = z.object({
  paper_id: idParam,
  annotation: z.string().trim().max(2000).nullish(),
});
export const trailReorder = z.object({ order: z.array(z.number().int().positive()).min(1).max(200) });
export const trailStepUpdate = z.object({ annotation: z.string().trim().max(2000).nullable() });

export const importDoi = z.object({
  doi: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase())
    .pipe(z.string().regex(/^10\.\d{4,9}\/\S+$/, "Enter a DOI such as 10.48550/arXiv.1706.03762")),
});

export const authorSearchQuery = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});
export const authorMerge = z.object({ keep_id: idParam, duplicate_id: idParam });
export const adminUserUpdate = z
  .object({ role: z.enum(["RESEARCHER", "CURATOR", "ADMIN"]).optional(), is_active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to change");
export const auditQuery = z.object({
  table: z.string().max(63).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const retractionCreate = z.object({
  retraction_date: z.iso.date(),
  status: z.enum(["RETRACTED", "CORRECTED", "EXPRESSION_OF_CONCERN", "REINSTATED"]).default("RETRACTED"),
  reason: z.string().trim().max(2000).nullish(),
  notice_url: z.url().max(1000).nullish(),
});

export const methodUsages = ["PROPOSED", "USED", "COMPARED", "EXTENDED", "BASELINE", "OTHER"] as const;
export const datasetUsages = ["TRAINING", "VALIDATION", "TESTING", "BENCHMARKING", "OTHER"] as const;
export const paperMethodLink = z.object({
  method_id: idParam,
  usage_type: z.enum(methodUsages).default("USED"),
});
export const paperDatasetLink = z.object({
  dataset_id: idParam,
  usage_type: z.enum(datasetUsages).default("BENCHMARKING"),
});

const labId = z.string().regex(/^[A-Z]\d{2}$/, "a catalog id such as Q15");
const labParams = z.record(z.string().regex(/^\w{1,40}$/), z.string().max(500)).optional();
export const labRun = z.object({
  id: labId,
  params: labParams,
  mode: z.enum(["run", "explain"]).default("run"),
  commit: z.boolean().default(false),
});
export const labCypher = z.object({
  id: labId,
  params: labParams,
  mode: z.enum(["run", "profile"]).default("run"),
});
