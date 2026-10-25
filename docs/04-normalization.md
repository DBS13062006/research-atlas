# 4. Normalization

Every table is in **Boyce–Codd normal form** except for two deliberate, database-maintained derived
columns, which are justified at the end of this chapter.

A relation is in BCNF when, for every non-trivial functional dependency X → Y, X is a superkey. The
check below lists each table's candidate keys and its functional dependencies (FDs), and confirms that
every determinant is a candidate key.

## 4.1 Method

1. Atomic values only (1NF): no column stores a list. Authors, topics, methods and datasets of a paper
   live in link tables, not in comma-separated text.
2. For each table, write down the FDs implied by the real-world rules, not just by the keys.
3. Confirm every determinant is a superkey (BCNF ⇒ 3NF ⇒ 2NF).

## 4.2 Worked examples

### `paper_author(paper_id, author_id, author_order, is_corresponding, affiliation_institution_id)`

Candidate keys: **{paper_id, author_id}** and **{paper_id, author_order}**.

| FD                                                                               | Why it holds                                                                            | Determinant a key?            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| paper_id, author_id → author_order, is_corresponding, affiliation_institution_id | An author has one position, one corresponding flag and one affiliation on a given paper | Yes (primary key)             |
| paper_id, author_order → author_id                                               | A position on a paper is held by exactly one author                                     | Yes (`uq_paper_author_order`) |

Both determinants are candidate keys, so the table is in BCNF. Having two overlapping candidate keys is
exactly the situation where 3NF and BCNF can differ; here they do not, because no attribute depends on
only part of either key.

`affiliation_institution_id` deliberately lives here and not only in `author`: it records the affiliation
**at publication time**. If it depended on `author_id` alone (author_id → institution) that would be a
partial dependency and a 2NF violation; it does not, because the same author has different affiliations
on different papers. `author.institution_id` separately records the _current_ affiliation.

### `venue(venue_id, openalex_id, venue_name, venue_type, publisher, issn_l)`

Candidate keys: {venue_id}, {openalex_id}, {issn_l} (the last two nullable alternate keys).

`publisher` depends on the venue, not on the paper. Storing it in `paper` would create the transitive
dependency paper_id → venue_id → publisher (a 3NF violation, and an update anomaly when a journal changes
publisher). Keeping it in `venue` removes that.

### `topic(topic_id, openalex_id, topic_name, topic_level, description, parent_topic_id)`

Candidate keys: {topic_id}, {openalex_id}, and {parent_topic_id, topic_name}
(`uq_topic_name_in_parent`, with `NULLS NOT DISTINCT` so root domains are covered too).

One might expect parent_topic_id → topic_level (the child's level is the parent's level + 1). That rule is
real, but it is enforced by `trg_topic_hierarchy_guard` rather than by deriving the column, because
`topic_level` is also used by the `chk_topic_only_domains_are_roots` CHECK and by every query that filters
by level. parent_topic_id is not a key of `topic`, so to stay in BCNF the level is treated as an attribute
of the topic itself, validated against the parent by the trigger.

## 4.3 Every table

| Table            | Candidate keys                                              | Non-trivial FDs (determinant → dependents)                  | BCNF |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ---- |
| role             | {role_id}, {role_code}, {role_name}, {db_role_name}, {rank} | each key → all other columns                                | ✓    |
| permission       | {permission_id}, {permission_code}                          | key → description                                           | ✓    |
| role_permission  | {role_id, permission_id}                                    | none (all-key)                                              | ✓    |
| user_account     | {user_id}, {public_id}, {email}                             | key → name, password_hash, role_id, flags, timestamps       | ✓    |
| user_session     | {session_id}                                                | session_id → user_id, timestamps, ip, user_agent            | ✓    |
| institution      | {institution_id}, {openalex_id}, {ror_id}                   | key → name, country_code, type, website                     | ✓    |
| author           | {author_id}, {openalex_id}, {orcid}                         | key → author_name, institution_id, profile_url              | ✓    |
| venue            | {venue_id}, {openalex_id}, {issn_l}                         | key → venue_name, venue_type, publisher                     | ✓    |
| paper            | {paper_id}, {openalex_id}, {doi}, {arxiv_id}                | key → title, abstract, dates, venue_id, OA fields, counts   | ✓*   |
| paper_author     | {paper_id, author_id}, {paper_id, author_order}             | see 4.2                                                     | ✓    |
| citation         | {citing_paper_id, cited_paper_id}                           | key → created_at                                            | ✓    |
| topic            | {topic_id}, {openalex_id}, {parent_topic_id, topic_name}    | key → level, description                                    | ✓    |
| paper_topic      | {paper_id, topic_id}                                        | key → relevance_score, is_primary                           | ✓    |
| method           | {method_id}, {method_name}, {pwc_slug}                      | key → category, description, introduced_year                | ✓    |
| paper_method     | {paper_id, method_id}                                       | key → usage_type                                            | ✓    |
| dataset          | {dataset_id}, {dataset_name}, {pwc_slug}                    | key → modality, domain, url, description                    | ✓    |
| paper_dataset    | {paper_id, dataset_id}                                      | key → usage_type                                            | ✓    |
| resource         | {resource_id}, {paper_id, resource_type, resource_url}      | resource_id → paper_id, type, url                           | ✓    |
| retraction       | {retraction_id}, {paper_id}, {rw_record_id}                 | key → date, reason, notice, status, source, recorded_by     | ✓    |
| collection       | {collection_id}, {public_id}, {user_id, collection_name}    | key → description, is_public, timestamps                    | ✓    |
| collection_paper | {collection_id, paper_id}                                   | key → reading_status, priority, position, added_at, read_at | ✓    |
| note             | {note_id}                                                   | note_id → user_id, paper_id, text, flags, timestamps        | ✓    |
| audit_log        | {audit_id, occurred_at}                                     | key → table_name, operation, row images, actor, db_role     | ✓    |
| graph_outbox     | {outbox_id}                                                 | outbox_id → aggregate, key, operation, payload, status      | ✓    |

\* apart from the two derived columns below.

`collection_paper.read_at` and `reading_status` look dependent on each other, but neither determines the
other's value (a READ entry can have any timestamp), so there is no FD between them; the CHECK
`chk_collection_paper_read_at_matches_status` only constrains which combinations are legal.

## 4.4 The two deliberate denormalizations

| Column                       | Derived from                                   | Why store it                                                                                                       | How drift is prevented                                                                                                  |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `paper.local_citation_count` | `count(*)` of `citation` rows citing the paper | Ranking and list pages sort by it on every request; counting thousands of citation rows per page would be wasteful | Statement-level triggers on `citation` with transition tables update it once per statement, inside the same transaction |
| `paper.search_vector`        | `title` and `abstract`                         | Full-text search needs an indexed `tsvector`                                                                       | `GENERATED ALWAYS AS (…) STORED`: the database recomputes it on every write; it cannot be written directly              |

`paper.publication_year` is also derived, but it is a `VIRTUAL` generated column (PostgreSQL 18): it is
computed on read and never stored, so it introduces no redundancy at all.

<!-- chapter-nav -->

---

[← Relational schema](03-relational-schema.md) · [Documentation index](README.md) · [DDL and constraints →](05-ddl.md)
