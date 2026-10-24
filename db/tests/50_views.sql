-- View tests.
BEGIN;
SELECT * FROM no_plan();

SELECT has_view('v_paper_card', 'v_paper_card exists');
SELECT has_view('v_retraction_exposure', 'v_retraction_exposure exists');
SELECT has_view('v_my_library', 'v_my_library exists');
SELECT has_materialized_view('mv_topic_year_stats', 'mv_topic_year_stats exists');
SELECT has_materialized_view('mv_author_stats', 'mv_author_stats exists');

SELECT is((SELECT array_agg(c.relname::TEXT ORDER BY c.relname) FROM pg_class c
           WHERE c.relname IN ('v_paper_card', 'v_retraction_exposure', 'v_my_library')
             AND 'security_invoker=true' = ANY (c.reloptions)),
          ARRAY['v_my_library', 'v_paper_card', 'v_retraction_exposure'],
          'every plain view runs with the caller''s privileges (security_invoker)');

SELECT is((SELECT author_names FROM v_paper_card WHERE paper_id = 22), 'Asha Rao, Rahul Verma, Sofia Rossi',
          'author names come out in author order');
SELECT is((SELECT retraction_status FROM v_paper_card WHERE paper_id = 22), 'RETRACTED'::VARCHAR, 'the card shows retractions');
SELECT is((SELECT primary_topic_path FROM v_paper_card WHERE paper_id = 9),
          'Health Sciences › Medicine › Health Informatics › Clinical Prediction Models', 'the card carries the topic path');
SELECT is((SELECT author_count FROM v_paper_card WHERE paper_id = 14), 4, 'author count');
SELECT is((SELECT count(*)::INT FROM v_paper_card), (SELECT count(*)::INT FROM paper), 'one card per paper, even without authors or topics');

SELECT results_eq($$SELECT paper_id, hops FROM v_retraction_exposure ORDER BY paper_id$$,
                  $$VALUES (24::BIGINT, 1), (27::BIGINT, 2)$$, 'exposure lists the one- and two-hop citers');
UPDATE retraction SET status = 'REINSTATED' WHERE paper_id = 22;
SELECT is_empty($$SELECT * FROM v_retraction_exposure$$, 'a reinstated paper exposes nobody');
UPDATE retraction SET status = 'RETRACTED' WHERE paper_id = 22;

SELECT is(ra_test.value_as('ra_researcher', 3, $$SELECT string_agg(collection_name, ', ' ORDER BY collection_name) FROM v_my_library$$),
          'Shared transformer picks, Spiking reading list', 'v_my_library shows the caller''s collections');
SELECT is(ra_test.value_as('ra_researcher', 3, $$SELECT read || '/' || reading || '/' || not_read FROM v_my_library WHERE collection_id = 1$$),
          '1/1/1', 'with counts by reading status');
SELECT is(ra_test.value_as('ra_researcher', 4, $$SELECT string_agg(collection_name, ', ') FROM v_my_library$$),
          'Clinical ML', 'another user sees only their own');

CALL sp_refresh_analytics();
SELECT is((SELECT papers FROM mv_topic_year_stats WHERE topic_id = 2 AND year = 2021), 3,
          'a field counts papers from its whole subtree (12, 14 and 15 in 2021)');
SELECT is((SELECT papers FROM mv_topic_year_stats WHERE topic_id = 4 AND year = 2021), 2,
          'a leaf topic counts only its own papers');
SELECT is((SELECT papers || '/' || h_index FROM mv_author_stats WHERE author_id = 1), '8/7', 'author stats: papers and h-index');
SELECT has_index('mv_topic_year_stats', 'uq_mv_topic_year_stats', 'the topic MV has the unique index CONCURRENTLY needs');

SELECT * FROM finish();
ROLLBACK;
