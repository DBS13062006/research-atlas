-- Trigger tests: each trigger's side effect, and each guard rejecting a bad row.
BEGIN;
SELECT * FROM no_plan();

SELECT has_trigger('paper', 'trg_set_updated_at', 'paper keeps updated_at');
SELECT has_trigger('retraction', 'trg_retraction_date_guard', 'retraction has the date guard');
SELECT has_trigger('topic', 'trg_topic_hierarchy_guard', 'topic has the hierarchy guard');
SELECT has_trigger('citation', 'trg_citation_count_ins', 'citation keeps counts on insert');
SELECT has_trigger('citation', 'trg_citation_count_del', 'citation keeps counts on delete');
SELECT has_trigger('collection_paper', 'trg_reading_status_read_at', 'collection_paper keeps read_at');
SELECT has_trigger('user_account', 'trg_protect_last_admin', 'user_account protects the last admin');
SELECT has_trigger('note', 'trg_note_owner_immutable', 'note owner is immutable');
SELECT has_trigger('paper', 'trg_audit', 'paper is audited');
SELECT has_trigger('citation', 'trg_graph_outbox', 'citation feeds the graph outbox');

-- trg_set_updated_at
UPDATE note SET updated_at = TIMESTAMPTZ '2026-01-01', created_at = TIMESTAMPTZ '2026-01-01' WHERE note_id = 1;
SELECT ok((SELECT updated_at > TIMESTAMPTZ '2026-01-02' FROM note WHERE note_id = 1),
          'updated_at is set by the database on update, whatever the client sends');

-- trg_retraction_date_guard
SELECT throws_ok($$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (24, DATE '2023-01-01', 'RETRACTED')$$,
                 '23514', NULL, 'a retraction dated before publication is rejected');
SELECT is(ra_test.state_as('postgres', NULL,
          $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (24, DATE '2023-01-01', 'RETRACTED')$$),
          '23514', 'the guard reports SQLSTATE 23514 (check_violation)');
SELECT lives_ok($$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (24, DATE '2023-05-20', 'RETRACTED')$$,
                'a retraction on the publication day itself is fine');
SELECT throws_ok($$UPDATE retraction SET retraction_date = DATE '2000-01-01' WHERE paper_id = 22$$,
                 '23514', NULL, 'the guard also runs on update');

-- trg_topic_hierarchy_guard
SELECT throws_ok($$UPDATE topic SET parent_topic_id = 4 WHERE topic_id = 3$$, '23514', NULL,
                 'making a topic its own grandparent is rejected (level rule)');
SELECT throws_ok($$INSERT INTO topic (topic_name, topic_level, parent_topic_id) VALUES ('Too deep', 3, 4)$$, '23514', NULL,
                 'a child must sit exactly one level below its parent');
-- The level rule alone already makes cycles impossible; the ancestor walk is a second line of defence.
-- Moving "Artificial Intelligence" (3) under its own child (4) with a matching level isolates the walk.
SELECT throws_like($$UPDATE topic SET parent_topic_id = 4, topic_level = 4 WHERE topic_id = 3$$,
                   '%would become its own ancestor%', 'a topic cannot become its own ancestor');
SELECT lives_ok($$INSERT INTO topic (topic_name, topic_level, parent_topic_id) VALUES ('Liquid State Machines', 3, 3)$$,
                'a correctly placed topic is accepted');

-- trg_citation_count_* (statement-level, transition tables)
SELECT is((SELECT local_citation_count FROM paper WHERE paper_id = 1), 2, 'paper 1 starts with two local citations');
INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (29, 1), (28, 1), (27, 1);
SELECT is((SELECT local_citation_count FROM paper WHERE paper_id = 1), 5, 'a three-row insert adds three in one statement');
DELETE FROM citation WHERE cited_paper_id = 1 AND citing_paper_id IN (28, 29);
SELECT is((SELECT local_citation_count FROM paper WHERE paper_id = 1), 3, 'deletes subtract');
UPDATE citation SET cited_paper_id = 2 WHERE citing_paper_id = 27 AND cited_paper_id = 1;
SELECT results_eq($$SELECT local_citation_count FROM paper WHERE paper_id IN (1, 2) ORDER BY paper_id$$,
                  $$VALUES (2), (2)$$, 'moving a citation updates both papers');
SELECT is((SELECT count(*)::INT FROM paper p
           WHERE p.local_citation_count <> (SELECT count(*) FROM citation c WHERE c.cited_paper_id = p.paper_id)), 0,
          'every stored count equals the real count');

-- trg_reading_status_read_at
UPDATE collection_paper SET reading_status = 'READ' WHERE collection_id = 1 AND paper_id = 24;
SELECT isnt((SELECT read_at FROM collection_paper WHERE collection_id = 1 AND paper_id = 24), NULL,
            'marking READ stamps read_at');
UPDATE collection_paper SET reading_status = 'READING' WHERE collection_id = 1 AND paper_id = 24;
SELECT is((SELECT read_at FROM collection_paper WHERE collection_id = 1 AND paper_id = 24), NULL,
          'moving back to READING clears read_at');
INSERT INTO collection_paper (collection_id, paper_id, reading_status) VALUES (1, 29, 'READ');
SELECT isnt((SELECT read_at FROM collection_paper WHERE collection_id = 1 AND paper_id = 29), NULL,
            'inserting as READ stamps read_at');

-- trg_protect_last_admin
SELECT throws_ok($$UPDATE user_account SET role_id = (SELECT role_id FROM role WHERE role_code = 'RESEARCHER') WHERE user_id = 1$$,
                 'RA002', NULL, 'the only admin cannot be demoted');
SELECT throws_ok($$UPDATE user_account SET is_active = FALSE WHERE user_id = 1$$, 'RA002', NULL,
                 'the only admin cannot be deactivated');
SELECT throws_ok($$DELETE FROM user_account WHERE user_id = 1$$, 'RA002', NULL, 'the only admin cannot be deleted');
UPDATE user_account SET role_id = (SELECT role_id FROM role WHERE role_code = 'ADMIN') WHERE user_id = 2;
SELECT lives_ok($$UPDATE user_account SET role_id = (SELECT role_id FROM role WHERE role_code = 'RESEARCHER') WHERE user_id = 1$$,
                'with a second admin, the first can be demoted');

-- trg_note_owner_immutable
SELECT throws_ok($$UPDATE note SET user_id = 4 WHERE note_id = 1$$, '23514', NULL, 'a note cannot change owner');
SELECT throws_ok($$UPDATE note SET paper_id = 5 WHERE note_id = 1$$, '23514', NULL, 'a note cannot move to another paper');
SELECT lives_ok($$UPDATE note SET note_text = 'Edited' WHERE note_id = 1$$, 'its text can still change');

-- trg_audit
SELECT set_config('app.user_id', '2', TRUE);
UPDATE paper SET cited_by_count = cited_by_count + 1 WHERE paper_id = 5;
SELECT is((SELECT count(*)::INT FROM audit_log WHERE table_name = 'paper' AND operation = 'U'
           AND row_pk = '{"paper_id": 5}' AND actor_user_id = 2), 1, 'an update is audited with its actor');
SELECT is((SELECT (new_row ->> 'cited_by_count')::INT - (old_row ->> 'cited_by_count')::INT FROM audit_log
           WHERE table_name = 'paper' AND row_pk = '{"paper_id": 5}' ORDER BY audit_id DESC LIMIT 1), 1,
          'old and new row images are kept');
UPDATE user_account SET name = 'Rhea R.' WHERE user_id = 3;
SELECT ok((SELECT NOT (new_row ? 'password_hash') FROM audit_log WHERE table_name = 'user_account'
           ORDER BY audit_id DESC LIMIT 1), 'password hashes never reach the audit log');
SELECT set_config('app.user_id', '', TRUE);

-- trg_graph_outbox
CREATE TEMP TABLE outbox_mark AS SELECT coalesce(max(outbox_id), 0) AS id FROM graph_outbox;
INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (26, 3);
SELECT results_eq($$SELECT aggregate::TEXT, operation::TEXT, aggregate_key FROM graph_outbox
                    WHERE outbox_id > (SELECT id FROM outbox_mark) AND aggregate = 'citation'$$,
                  $$VALUES ('citation', 'UPSERT', '{"cited_paper_id": 3, "citing_paper_id": 26}'::JSONB)$$,
                  'a new citation queues one UPSERT for the graph');
DELETE FROM citation WHERE citing_paper_id = 26 AND cited_paper_id = 3;
SELECT is((SELECT operation FROM graph_outbox WHERE outbox_id > (SELECT id FROM outbox_mark) AND aggregate = 'citation'
           ORDER BY outbox_id DESC LIMIT 1), 'DELETE'::VARCHAR, 'deleting it queues a DELETE');
SELECT ok((SELECT NOT (payload ? 'abstract') FROM graph_outbox WHERE aggregate = 'paper' AND payload IS NOT NULL LIMIT 1),
          'paper payloads leave out the abstract');

SELECT * FROM finish();
ROLLBACK;
