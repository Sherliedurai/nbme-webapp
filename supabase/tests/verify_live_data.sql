-- =============================================================================
-- Live data-path verification (run in the Supabase SQL Editor)
-- =============================================================================

-- (1) Block 1 should have 20 enriched rows.
select count(*) as enriched_rows
from public.questions
where block_number = 1 and enriched_explanation is not null;
-- expect: 20

-- (2) Spot-check the enrichment jsonb shape on a few rows.
select q_number,
       left(enriched_explanation->>'answer_lock', 60)               as bottom_line_preview,
       jsonb_array_length(enriched_explanation->'knockdowns')       as n_knockdowns,
       jsonb_array_length(enriched_explanation->'high_yield')       as n_high_yield,
       jsonb_array_length(enriched_explanation->'how_they_test')    as n_how_they_test
from public.questions
where block_number = 1
order by q_number
limit 5;

-- (3) AFTER you answer a practice question in the app, this shows the attempt
-- row written under RLS — stamped with your user_id and mode='practice'.
select a.created_at, a.user_id, a.selected_letter, a.is_correct,
       a.seconds_spent, a.flagged, bs.mode
from public.attempts a
join public.block_sessions bs on bs.id = a.block_session_id
where bs.mode = 'practice'
order by a.created_at desc
limit 5;
