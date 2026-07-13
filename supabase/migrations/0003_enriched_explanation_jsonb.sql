-- =============================================================================
-- Migration 0003 — enriched_explanation: text → jsonb
--
-- WHY: enrichment is a structured 5-section object
--   { answer_lock, hook, knockdowns:[{option,reason}],
--     high_yield:[{fact,source}], how_they_test:[{scenario,answer,source}] }
-- Storing it as jsonb gives validation + clean querying (e.g. filtering by source
-- grounding later). The column is entirely NULL at this point, so the cast is a
-- no-op on existing rows.
--
-- Run BEFORE loading import/out/block<N>_enrichment.sql.
-- (Migration 0001 has NOT been retro-edited; jsonb is introduced here.)
-- =============================================================================
begin;

alter table public.questions
  alter column enriched_explanation type jsonb
  using enriched_explanation::jsonb;

comment on column public.questions.enriched_explanation is
  'Structured enrichment JSON: {answer_lock, hook, knockdowns[], high_yield[{fact,source}], how_they_test[{scenario,answer,source}]}. Generated once at import; null until enriched.';

commit;
