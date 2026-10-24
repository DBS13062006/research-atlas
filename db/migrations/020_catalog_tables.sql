-- migrate:up
-- 020 · The research catalog: institutions, authors, venues, papers and everything linked to them.
SET ROLE ra_owner;

CREATE TABLE institution (
  institution_id   BIGINT GENERATED ALWAYS AS IDENTITY,
  openalex_id      VARCHAR(20),
  ror_id           VARCHAR(40),
  institution_name VARCHAR(200) NOT NULL,
  country_code     CHAR(2),
  institution_type VARCHAR(20),
  website          VARCHAR(500),
  CONSTRAINT pk_institution PRIMARY KEY (institution_id),
  CONSTRAINT uq_institution_openalex_id UNIQUE (openalex_id),
  CONSTRAINT uq_institution_ror_id UNIQUE (ror_id),
  CONSTRAINT chk_institution_country_code CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_institution_type CHECK (institution_type IN
    ('EDUCATION', 'COMPANY', 'GOVERNMENT', 'FACILITY', 'NONPROFIT', 'HEALTHCARE', 'ARCHIVE', 'OTHER'))
);

CREATE TABLE author (
  author_id      BIGINT GENERATED ALWAYS AS IDENTITY,
  openalex_id    VARCHAR(20),
  orcid          VARCHAR(19),
  author_name    VARCHAR(200) NOT NULL,
  institution_id BIGINT,                     -- current or primary affiliation
  profile_url    VARCHAR(500),
  CONSTRAINT pk_author PRIMARY KEY (author_id),
  CONSTRAINT uq_author_openalex_id UNIQUE (openalex_id),
  CONSTRAINT uq_author_orcid UNIQUE (orcid),
  CONSTRAINT fk_author_institution FOREIGN KEY (institution_id) REFERENCES institution ON DELETE SET NULL,
  CONSTRAINT chk_author_orcid_format CHECK (orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  CONSTRAINT chk_author_name_not_blank CHECK (length(btrim(author_name)) > 0)
);

CREATE TABLE venue (
  venue_id    BIGINT GENERATED ALWAYS AS IDENTITY,
  openalex_id VARCHAR(20),
  venue_name  VARCHAR(250) NOT NULL,
  venue_type  VARCHAR(20)  NOT NULL,
  publisher   VARCHAR(200),
  issn_l      CHAR(9),
  CONSTRAINT pk_venue PRIMARY KEY (venue_id),
  CONSTRAINT uq_venue_openalex_id UNIQUE (openalex_id),
  CONSTRAINT uq_venue_issn_l UNIQUE (issn_l),
  CONSTRAINT chk_venue_type CHECK (venue_type IN
    ('JOURNAL', 'CONFERENCE', 'WORKSHOP', 'REPOSITORY', 'BOOK_SERIES', 'OTHER')),
  CONSTRAINT chk_venue_issn_l_format CHECK (issn_l ~ '^\d{4}-\d{3}[\dX]$')
);

CREATE TABLE paper (
  paper_id             BIGINT GENERATED ALWAYS AS IDENTITY,
  openalex_id          VARCHAR(20),
  doi                  VARCHAR(255),          -- lower-case, without the https://doi.org/ prefix
  arxiv_id             VARCHAR(30),
  title                VARCHAR(1000) NOT NULL,
  abstract             TEXT,
  publication_date     DATE,
  publication_year     SMALLINT GENERATED ALWAYS AS (EXTRACT(YEAR FROM publication_date)::SMALLINT) VIRTUAL,
  venue_id             BIGINT,
  work_type            VARCHAR(20) NOT NULL DEFAULT 'ARTICLE',
  open_access          BOOLEAN NOT NULL DEFAULT FALSE,
  oa_status            VARCHAR(10),
  cited_by_count       INT NOT NULL DEFAULT 0,  -- global count reported by OpenAlex
  local_citation_count INT NOT NULL DEFAULT 0,  -- derived from citation; maintained by trigger
  paper_url            VARCHAR(1000),
  search_vector        TSVECTOR GENERATED ALWAYS AS (
                         setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                         setweight(to_tsvector('english', coalesce(abstract, '')), 'B')) STORED,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_paper PRIMARY KEY (paper_id),
  CONSTRAINT uq_paper_openalex_id UNIQUE (openalex_id),
  CONSTRAINT uq_paper_doi UNIQUE (doi),
  CONSTRAINT uq_paper_arxiv_id UNIQUE (arxiv_id),
  CONSTRAINT fk_paper_venue FOREIGN KEY (venue_id) REFERENCES venue ON DELETE SET NULL,
  CONSTRAINT chk_paper_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT chk_paper_doi_format CHECK (doi ~* '^10\.\d{4,9}/\S+$'),
  CONSTRAINT chk_paper_doi_lowercase CHECK (doi = lower(doi)),
  CONSTRAINT chk_paper_publication_date_floor CHECK (publication_date >= DATE '1665-01-01'),
  CONSTRAINT chk_paper_work_type CHECK (work_type IN
    ('ARTICLE', 'PREPRINT', 'PROCEEDINGS', 'REVIEW', 'BOOK_CHAPTER', 'DATASET', 'OTHER')),
  CONSTRAINT chk_paper_oa_status CHECK (oa_status IN ('DIAMOND', 'GOLD', 'GREEN', 'HYBRID', 'BRONZE', 'CLOSED')),
  CONSTRAINT chk_paper_cited_by_count_non_negative CHECK (cited_by_count >= 0),
  CONSTRAINT chk_paper_local_citation_count_non_negative CHECK (local_citation_count >= 0),
  -- Cross-column rule: a CLOSED status means not open access, any other status means open access.
  CONSTRAINT chk_paper_oa_status_matches_flag CHECK (oa_status IS NULL OR (oa_status = 'CLOSED') <> open_access)
);

CREATE TABLE paper_author (
  paper_id                   BIGINT   NOT NULL,
  author_id                  BIGINT   NOT NULL,
  author_order               SMALLINT NOT NULL,
  is_corresponding           BOOLEAN  NOT NULL DEFAULT FALSE,
  affiliation_institution_id BIGINT,          -- affiliation at publication time, so history never changes
  CONSTRAINT pk_paper_author PRIMARY KEY (paper_id, author_id),
  CONSTRAINT fk_paper_author_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_paper_author_author FOREIGN KEY (author_id) REFERENCES author ON DELETE RESTRICT,
  CONSTRAINT fk_paper_author_institution FOREIGN KEY (affiliation_institution_id)
    REFERENCES institution ON DELETE SET NULL,
  CONSTRAINT chk_paper_author_order_positive CHECK (author_order > 0),
  -- Deferrable so two authors can swap positions inside one transaction.
  CONSTRAINT uq_paper_author_order UNIQUE (paper_id, author_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE citation (
  citing_paper_id BIGINT NOT NULL,
  cited_paper_id  BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_citation PRIMARY KEY (citing_paper_id, cited_paper_id),
  CONSTRAINT fk_citation_citing FOREIGN KEY (citing_paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_citation_cited FOREIGN KEY (cited_paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT chk_no_self_citation CHECK (citing_paper_id <> cited_paper_id)
);

CREATE TABLE topic (
  topic_id        BIGINT GENERATED ALWAYS AS IDENTITY,
  openalex_id     VARCHAR(20),
  topic_name      VARCHAR(200) NOT NULL,
  topic_level     SMALLINT NOT NULL,         -- 0 domain, 1 field, 2 subfield, 3 topic
  description     TEXT,
  parent_topic_id BIGINT,
  CONSTRAINT pk_topic PRIMARY KEY (topic_id),
  CONSTRAINT uq_topic_openalex_id UNIQUE (openalex_id),
  CONSTRAINT fk_topic_parent FOREIGN KEY (parent_topic_id) REFERENCES topic ON DELETE RESTRICT,
  CONSTRAINT chk_topic_level_range CHECK (topic_level BETWEEN 0 AND 3),
  CONSTRAINT chk_topic_not_own_parent CHECK (parent_topic_id IS NULL OR parent_topic_id <> topic_id),
  CONSTRAINT chk_topic_only_domains_are_roots CHECK ((topic_level = 0) = (parent_topic_id IS NULL)),
  CONSTRAINT uq_topic_name_in_parent UNIQUE NULLS NOT DISTINCT (parent_topic_id, topic_name)
);

CREATE TABLE paper_topic (
  paper_id        BIGINT NOT NULL,
  topic_id        BIGINT NOT NULL,
  relevance_score NUMERIC(5, 4),
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT pk_paper_topic PRIMARY KEY (paper_id, topic_id),
  CONSTRAINT fk_paper_topic_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_paper_topic_topic FOREIGN KEY (topic_id) REFERENCES topic ON DELETE RESTRICT,
  CONSTRAINT chk_paper_topic_relevance_range CHECK (relevance_score BETWEEN 0 AND 1)
);
-- At most one primary topic per paper.
CREATE UNIQUE INDEX uq_one_primary_topic ON paper_topic (paper_id) WHERE is_primary;

CREATE TABLE method (
  method_id       BIGINT GENERATED ALWAYS AS IDENTITY,
  method_name     VARCHAR(200) NOT NULL,
  method_category VARCHAR(80),
  description     TEXT,
  introduced_year SMALLINT,
  pwc_slug        VARCHAR(200),
  CONSTRAINT pk_method PRIMARY KEY (method_id),
  CONSTRAINT uq_method_name UNIQUE (method_name),
  CONSTRAINT uq_method_pwc_slug UNIQUE (pwc_slug),
  CONSTRAINT chk_method_introduced_year CHECK (introduced_year BETWEEN 1900 AND 2100)
);

CREATE TABLE paper_method (
  paper_id   BIGINT NOT NULL,
  method_id  BIGINT NOT NULL,
  usage_type VARCHAR(20) NOT NULL,
  CONSTRAINT pk_paper_method PRIMARY KEY (paper_id, method_id),
  CONSTRAINT fk_paper_method_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_paper_method_method FOREIGN KEY (method_id) REFERENCES method ON DELETE RESTRICT,
  CONSTRAINT chk_paper_method_usage_type CHECK (usage_type IN
    ('PROPOSED', 'USED', 'COMPARED', 'EXTENDED', 'BASELINE', 'OTHER'))
);

CREATE TABLE dataset (
  dataset_id   BIGINT GENERATED ALWAYS AS IDENTITY,
  dataset_name VARCHAR(200) NOT NULL,
  modality     VARCHAR(40),
  domain       VARCHAR(150),
  dataset_url  VARCHAR(1000),
  description  TEXT,
  pwc_slug     VARCHAR(200),
  CONSTRAINT pk_dataset PRIMARY KEY (dataset_id),
  CONSTRAINT uq_dataset_name UNIQUE (dataset_name),
  CONSTRAINT uq_dataset_pwc_slug UNIQUE (pwc_slug)
);

CREATE TABLE paper_dataset (
  paper_id   BIGINT NOT NULL,
  dataset_id BIGINT NOT NULL,
  usage_type VARCHAR(20) NOT NULL,
  CONSTRAINT pk_paper_dataset PRIMARY KEY (paper_id, dataset_id),
  CONSTRAINT fk_paper_dataset_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_paper_dataset_dataset FOREIGN KEY (dataset_id) REFERENCES dataset ON DELETE RESTRICT,
  CONSTRAINT chk_paper_dataset_usage_type CHECK (usage_type IN
    ('TRAINING', 'VALIDATION', 'TESTING', 'BENCHMARKING', 'OTHER'))
);

CREATE TABLE resource (
  resource_id   BIGINT GENERATED ALWAYS AS IDENTITY,
  paper_id      BIGINT NOT NULL,
  resource_type VARCHAR(20) NOT NULL,
  resource_url  VARCHAR(1000) NOT NULL,
  CONSTRAINT pk_resource PRIMARY KEY (resource_id),
  CONSTRAINT fk_resource_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT uq_resource_per_paper UNIQUE (paper_id, resource_type, resource_url),
  CONSTRAINT chk_resource_type CHECK (resource_type IN
    ('PDF', 'CODE', 'DATASET', 'PROJECT_PAGE', 'SUPPLEMENTARY', 'VIDEO', 'SLIDES', 'OTHER')),
  CONSTRAINT chk_resource_url_is_http CHECK (resource_url ~* '^https?://')
);

CREATE TABLE retraction (
  retraction_id   BIGINT GENERATED ALWAYS AS IDENTITY,
  paper_id        BIGINT NOT NULL,
  retraction_date DATE   NOT NULL,           -- must not precede publication_date; enforced by trigger
  reason          TEXT,
  notice_url      VARCHAR(1000),
  status          VARCHAR(30) NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  rw_record_id    INT,
  recorded_by     BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_retraction PRIMARY KEY (retraction_id),
  CONSTRAINT uq_retraction_paper UNIQUE (paper_id),
  CONSTRAINT uq_retraction_rw_record_id UNIQUE (rw_record_id),
  CONSTRAINT fk_retraction_paper FOREIGN KEY (paper_id) REFERENCES paper ON DELETE CASCADE,
  CONSTRAINT fk_retraction_recorded_by FOREIGN KEY (recorded_by) REFERENCES user_account ON DELETE SET NULL,
  CONSTRAINT chk_retraction_status CHECK (status IN
    ('RETRACTED', 'CORRECTED', 'EXPRESSION_OF_CONCERN', 'REINSTATED')),
  CONSTRAINT chk_retraction_source CHECK (source IN ('RETRACTION_WATCH', 'OPENALEX', 'MANUAL'))
);

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP TABLE IF EXISTS retraction;
DROP TABLE IF EXISTS resource;
DROP TABLE IF EXISTS paper_dataset;
DROP TABLE IF EXISTS dataset;
DROP TABLE IF EXISTS paper_method;
DROP TABLE IF EXISTS method;
DROP TABLE IF EXISTS paper_topic;
DROP TABLE IF EXISTS topic;
DROP TABLE IF EXISTS citation;
DROP TABLE IF EXISTS paper_author;
DROP TABLE IF EXISTS paper;
DROP TABLE IF EXISTS venue;
DROP TABLE IF EXISTS author;
DROP TABLE IF EXISTS institution;
RESET ROLE;
