-- Function tests: known answers on db/seed/test_seed.sql.
BEGIN;
SELECT * FROM no_plan();

-- app_current_user_id
SELECT is(app_current_user_id(), NULL, 'no app.user_id means an anonymous caller');
SELECT set_config('app.user_id', '3', TRUE);
SELECT is(app_current_user_id(), 3::BIGINT, 'app.user_id is read back as a bigint');
SELECT set_config('app.user_id', '', TRUE);

-- fn_has_permission
SELECT ok(fn_has_permission(1, 'users:manage'), 'an admin can manage users');
SELECT ok(fn_has_permission(2, 'import:run'), 'a curator can import papers');
SELECT ok(NOT fn_has_permission(2, 'retractions:manage'), 'a curator cannot manage retractions');
SELECT ok(fn_has_permission(3, 'notes:own'), 'a researcher can own notes');
SELECT ok(NOT fn_has_permission(3, 'papers:write'), 'a researcher cannot write papers');
SELECT ok(NOT fn_has_permission(999, 'papers:read'), 'an unknown user has no permissions');

-- fn_topic_path and fn_topic_descendants
SELECT is(fn_topic_path(4), 'Physical Sciences › Computer Science › Artificial Intelligence › Spiking Neural Networks',
          'topic path walks up to the root domain');
SELECT is(fn_topic_path(1), 'Physical Sciences', 'a root domain is its own path');
SELECT is((SELECT count(*)::INT FROM fn_topic_descendants(2)), 6, 'Computer Science has itself plus 5 topics below it');
SELECT is((SELECT max(depth) FROM fn_topic_descendants(1)), 3, 'a domain reaches level-3 topics at depth 3');

-- fn_paper_lineage
SELECT set_eq($$SELECT paper_id FROM fn_paper_lineage(18, 'ancestors', 1)$$, ARRAY[10, 12]::BIGINT[],
              'paper 18 directly cites papers 10 and 12');
SELECT is((SELECT count(*)::INT FROM fn_paper_lineage(18, 'ancestors', 3)), 7, 'paper 18 has 7 ancestors within 3 levels');
SELECT is((SELECT depth FROM fn_paper_lineage(18, 'ancestors', 3) WHERE paper_id = 4), 3,
          'paper 4 is three hops behind paper 18');
SELECT is((SELECT path FROM fn_paper_lineage(18, 'ancestors', 3) WHERE paper_id = 4), ARRAY[18, 12, 7, 4]::BIGINT[],
          'the lineage path records each hop');
SELECT is((SELECT depth FROM fn_paper_lineage(18, 'ancestors', 3) WHERE paper_id = 3), 2,
          'a paper reachable at several depths is reported at its shortest depth');
SELECT set_eq($$SELECT paper_id FROM fn_paper_lineage(1, 'descendants', 2)$$, ARRAY[2, 4, 7, 15, 22]::BIGINT[],
              'descendants follow citations forwards');
SELECT throws_ok($$SELECT * FROM fn_paper_lineage(1, 'sideways', 2)$$, '22023', NULL, 'direction is validated');

-- fn_author_h_index
SELECT is(fn_author_h_index(5), 11, 'author 5 has h-index 11');
SELECT is(fn_author_h_index(2), 3, 'author 2 has h-index 3');
SELECT is(fn_author_h_index(999), 0, 'an author with no papers has h-index 0');

-- fn_search_papers
SELECT is((SELECT paper_id FROM fn_search_papers('spiking attention', 1, 0)), 12::BIGINT,
          'the best full-text match for "spiking attention" is paper 12');
SELECT ok((SELECT headline LIKE '%<mark>%' FROM fn_search_papers('spiking attention', 1, 0)),
          'search results carry a highlighted snippet');
SELECT is((SELECT matched_by FROM fn_search_papers('transfromer survey', 1, 0)), 'trigram',
          'a misspelled query falls back to trigram similarity');
SELECT is((SELECT paper_id FROM fn_search_papers('transfromer survey', 1, 0)), 14::BIGINT,
          'the trigram fallback still finds the survey');

-- fn_retraction_exposure
SELECT results_eq($$SELECT retracted_paper_id, hops FROM fn_retraction_exposure(27)$$,
                  $$VALUES (22::BIGINT, 2)$$, 'paper 27 is two hops from retracted paper 22');
SELECT results_eq($$SELECT retracted_paper_id, hops FROM fn_retraction_exposure(24)$$,
                  $$VALUES (22::BIGINT, 1)$$, 'paper 24 cites retracted paper 22 directly');
SELECT is_empty($$SELECT * FROM fn_retraction_exposure(3)$$, 'paper 3 has no retracted work behind it');

-- fn_topic_growth
SELECT is((SELECT count(*)::INT FROM fn_topic_growth(4, 2018, 2024)), 7, 'one row per year, including empty years');
SELECT is((SELECT papers FROM fn_topic_growth(4, 2018, 2024) WHERE year = 2021), 2::BIGINT, 'two SNN papers in 2021');
SELECT is((SELECT yoy_pct FROM fn_topic_growth(4, 2018, 2024) WHERE year = 2023), 100.0,
          'year-on-year growth compares with the previous calendar year');
SELECT is((SELECT yoy_pct FROM fn_topic_growth(4, 2018, 2024) WHERE year = 2021), NULL,
          'growth from an empty year is undefined, not infinite');

-- Authentication helpers
SELECT is((SELECT role_code FROM fn_auth_lookup('RHEA@atlas.test')), 'RESEARCHER', 'email lookup is case-insensitive');
SELECT is_empty($$SELECT * FROM fn_auth_lookup('nobody@atlas.test')$$, 'an unknown email returns nothing');
SELECT lives_ok($$SELECT fn_record_login_success(3, repeat('e', 64), now() + INTERVAL '30 days', '127.0.0.1', 'pgTAP')$$,
                'a successful login stores a session');
SELECT is((SELECT user_id FROM fn_session_user(repeat('e', 64))), 3::BIGINT, 'the session resolves to its user');
SELECT is((SELECT db_role_name FROM fn_session_user(repeat('e', 64))), 'ra_researcher', 'and to the user''s database role');
SELECT is(fn_session_delete(repeat('e', 64)), 1, 'logout deletes one session');
SELECT is_empty($$SELECT * FROM fn_session_user(repeat('e', 64))$$, 'a deleted session no longer resolves');
SELECT lives_ok($sql$DO $d$ BEGIN FOR i IN 1..4 LOOP PERFORM fn_record_login_failure(4); END LOOP; END $d$$sql$,
                'four failed logins are recorded');
SELECT is((SELECT failed_login_count FROM user_account WHERE user_id = 4), 4::SMALLINT, 'the counter reaches four');
SELECT is((SELECT locked_until FROM user_account WHERE user_id = 4), NULL, 'four failures do not lock the account');
SELECT isnt(fn_record_login_failure(4), NULL, 'the fifth failure locks the account');
SELECT ok((SELECT locked_until > now() + INTERVAL '14 minutes' FROM user_account WHERE user_id = 4),
          'the lock lasts fifteen minutes');

SELECT * FROM finish();
ROLLBACK;
