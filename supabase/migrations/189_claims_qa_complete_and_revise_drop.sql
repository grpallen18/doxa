-- Claims QA: terminal status passed → complete; revise/drop review prompts (no add-ops / no human).

set search_path = public, extensions;

-- 1) Widen CHECKs before rewriting data
alter table public.story_chunks drop constraint if exists story_chunks_extraction_qa_status_check;

alter table public.story_chunks
  add constraint story_chunks_extraction_qa_status_check
    check (extraction_qa_status in (
      'pending',
      'reviewed',
      'standardized',
      'needs_refinement',
      'refined',
      'awaiting_approval',
      'atoms_passed',
      'complete',
      'passed',
      'needs_human_review'
    ));

comment on column public.story_chunks.extraction_qa_status is
  'Claims lane: pending -> complete | needs_refinement -> awaiting_approval -> complete (QA cycle finished).';

alter table public.stories drop constraint if exists stories_extraction_qa_status_check;

alter table public.stories
  add constraint stories_extraction_qa_status_check
    check (
      extraction_qa_status is null
      or extraction_qa_status in (
        'pending',
        'reviewed',
        'standardized',
        'needs_refinement',
        'refined',
        'awaiting_approval',
        'atoms_passed',
        'complete',
        'passed',
        'needs_human_review'
      )
    );

-- 2) Data migration
update public.story_chunks
set extraction_qa_status = 'complete'
where extraction_qa_status = 'passed';

update public.stories
set extraction_qa_status = 'complete'
where extraction_qa_status = 'passed';

-- 3) Merge / queue RPCs
create or replace function public.get_chunks_ready_for_chunk_qa(p_stage text, p_limit int default 5)
returns table (story_id uuid, chunk_index int, content text, extraction_json jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select sc.story_id, sc.chunk_index, sc.content, sc.extraction_json
  from public.story_chunks sc
  where sc.extraction_json is not null
    and (
      (p_stage = 'standardize' and sc.extraction_qa_status = 'pending')
      or (p_stage = 'validate_claims' and sc.extraction_qa_status = 'pending')
      or (
        p_stage = 'refine'
        and sc.extraction_qa_refinement_count < 3
        and sc.extraction_qa_validation_attempt_count < 3
        and sc.extraction_qa_status = 'needs_refinement'
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'repair_queue', '[]'::jsonb)) > 0
      )
      or (p_stage = 'approve_claims' and sc.extraction_qa_status = 'awaiting_approval')
      or (p_stage = 'validate'
          and sc.extraction_qa_status in ('standardized', 'refined')
          and sc.extraction_qa_validated_at is null)
      or (p_stage = 'link' and sc.extraction_qa_status = 'atoms_passed')
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

create or replace function public.get_stories_ready_to_merge(p_limit int default 1)
returns table (story_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.story_id
  from public.stories s
  where s.merged_at is null
    and exists (select 1 from public.story_chunks sc where sc.story_id = s.story_id)
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id and sc.extraction_json is null
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and coalesce(sc.extraction_qa_status, 'pending') not in ('complete', 'passed', 'atoms_passed')
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'repair_queue', '[]'::jsonb)) > 0
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'pending_approval_claim_ids', '[]'::jsonb)) > 0
    )
    and not exists (select 1 from public.story_claims sc where sc.story_id = s.story_id)
    and not exists (select 1 from public.story_positions sp where sp.story_id = s.story_id)
    and not exists (select 1 from public.story_events se where se.story_id = s.story_id)
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_to_merge(int) is
  'Stories ready for merge: all chunks claims QA complete, repair queue empty, no story_claims yet.';

-- 4) Prompt versions: validate v20, refine v2, approve v2
-- (v20 avoids colliding with admin-created validate versions 3–5 on shared envs)
insert into public.agent_prompt_versions (
  step_id,
  version_number,
  system_prompt,
  content_hash,
  change_note
)
select
  'validate-chunk-claims',
  20,
  $prompt$You are the Primary Claims Review Agent for Doxa.

Audit one chunk's primary claims extraction (claims array only). Do not rewrite claims in place — report findings only. Be precise and source-grounded.

METADATA RULES:
You receive published_at, story_title, and source_name as metadata only. They are NOT part of the article text.
Do not treat published_at as an event date. Do not infer years, dates, or facts from metadata or outside knowledge.
Ground all extractions exclusively in chunk_text or source_text.

INPUT: chunk_text and extraction_json.claims (each claim has raw_text, source_excerpt, span_start, span_end).

EVALUATE existing claims only. Do not suggest adding new claims. Completeness gaps are out of scope.

1. Claim grounding — raw_text must be supported by chunk_text. Do not use outside knowledge.
2. Span/excerpt grounding — source_excerpt and spans must point to text that supports the claim. If raw_text is supported elsewhere in the chunk but source_excerpt points to unrelated text, use issue_type span_grounding_mismatch (blocking), not grounding. The refiner fixes excerpt/spans.
3. Materiality — flag weak/non-material or excess claims (major). Do not invent missing claims.
4. Temporal accuracy — dates/years/timeframes in claim text must appear in or be clearly anchored by the chunk (blocking if invented).
5. Claim quality — standalone sentences, not quotes-as-claims, not rhetorical filler, not duplicate/over-merged claims.

ISSUE TYPES (use exactly one per issue): grounding, span_grounding_mismatch, attribution, materiality, duplicate, over_merged, under_split, temporal, quote_like, schema_issue.

SEVERITY:
- blocking — unsupported factual assertion, invented date, span_grounding_mismatch, claim not a complete sentence
- major — duplicate, weak/non-material claim, bad attribution
- minor — wording polish, confidence, style that does not change meaning or attribution

RECOMMENDED_ACTION:
- validate — all claims are pass or drop; nothing needs revise (passes_review=true)
- needs_refinement — one or more claims need revise (needs_repair) (passes_review=false)

RULES:
1. Treat deterministic_issues as pre-confirmed facts (do not re-litigate). span_grounding_mismatch and attribution_drift entries are actionable — route to needs_refinement with matching issue_type.
2. Ignore span_mismatch entries in deterministic_issues (server recomputes offsets from source_excerpt).
3. Patches: update or remove on claims only — never add. entity_type must be "claim".
4. Wording or canonicalization alone is minor unless it changes meaning or attribution.
5. Write summary as 2–4 sentences synthesizing all issues (deterministic + your findings).
6. claim_audit for every claim_id: pass (park), needs_repair (revise), or drop (remove from set). Never use reject. Drop = duplicate, non-material, hallucination, or unfixable claim. Pair drops with patch action remove when useful.$prompt$,
  encode(sha256(convert_to($prompt$You are the Primary Claims Review Agent for Doxa.

Audit one chunk's primary claims extraction (claims array only). Do not rewrite claims in place — report findings only. Be precise and source-grounded.

METADATA RULES:
You receive published_at, story_title, and source_name as metadata only. They are NOT part of the article text.
Do not treat published_at as an event date. Do not infer years, dates, or facts from metadata or outside knowledge.
Ground all extractions exclusively in chunk_text or source_text.

INPUT: chunk_text and extraction_json.claims (each claim has raw_text, source_excerpt, span_start, span_end).

EVALUATE existing claims only. Do not suggest adding new claims. Completeness gaps are out of scope.

1. Claim grounding — raw_text must be supported by chunk_text. Do not use outside knowledge.
2. Span/excerpt grounding — source_excerpt and spans must point to text that supports the claim. If raw_text is supported elsewhere in the chunk but source_excerpt points to unrelated text, use issue_type span_grounding_mismatch (blocking), not grounding. The refiner fixes excerpt/spans.
3. Materiality — flag weak/non-material or excess claims (major). Do not invent missing claims.
4. Temporal accuracy — dates/years/timeframes in claim text must appear in or be clearly anchored by the chunk (blocking if invented).
5. Claim quality — standalone sentences, not quotes-as-claims, not rhetorical filler, not duplicate/over-merged claims.

ISSUE TYPES (use exactly one per issue): grounding, span_grounding_mismatch, attribution, materiality, duplicate, over_merged, under_split, temporal, quote_like, schema_issue.

SEVERITY:
- blocking — unsupported factual assertion, invented date, span_grounding_mismatch, claim not a complete sentence
- major — duplicate, weak/non-material claim, bad attribution
- minor — wording polish, confidence, style that does not change meaning or attribution

RECOMMENDED_ACTION:
- validate — all claims are pass or drop; nothing needs revise (passes_review=true)
- needs_refinement — one or more claims need revise (needs_repair) (passes_review=false)

RULES:
1. Treat deterministic_issues as pre-confirmed facts (do not re-litigate). span_grounding_mismatch and attribution_drift entries are actionable — route to needs_refinement with matching issue_type.
2. Ignore span_mismatch entries in deterministic_issues (server recomputes offsets from source_excerpt).
3. Patches: update or remove on claims only — never add. entity_type must be "claim".
4. Wording or canonicalization alone is minor unless it changes meaning or attribution.
5. Write summary as 2–4 sentences synthesizing all issues (deterministic + your findings).
6. claim_audit for every claim_id: pass (park), needs_repair (revise), or drop (remove from set). Never use reject. Drop = duplicate, non-material, hallucination, or unfixable claim. Pair drops with patch action remove when useful.$prompt$, 'UTF8')), 'hex'),
  'Claims review v20 — revise or drop only; no add-ops / missing_claim; no human reject'
where not exists (
  select 1 from public.agent_prompt_versions
  where step_id = 'validate-chunk-claims' and version_number = 20
);

update public.agent_prompt_slots
set active_version_id = (
  select version_id from public.agent_prompt_versions
  where step_id = 'validate-chunk-claims' and version_number = 20
),
updated_at = now()
where step_id = 'validate-chunk-claims'
  and exists (
    select 1 from public.agent_prompt_versions
    where step_id = 'validate-chunk-claims' and version_number = 20
  );

insert into public.agent_prompt_versions (
  step_id,
  version_number,
  system_prompt,
  content_hash,
  change_note
)
select
  'refine-chunk-claims',
  2,
  $prompt$You are the K-Claims Refiner Agent for Doxa.

Revise only the claims in repair_queue using the prior claim version and Review K-Claims feedback.

Output a complete replacement claims JSON for the repair subset only. No commentary or markdown.

Rules:
1. Preserve valid claims unless review requires change.
2. Apply review issues, claim_audit (needs_repair only), and refinement_instruction exactly.
3. Do not invent or add claims — only revise the queued claim_ids. Output length must not exceed the repair set.
4. Fix grounding: accurate span_start, span_end, source_excerpt in chunk text. For span_grounding_mismatch issues, correct the excerpt/spans to verbatim supporting text.
5. Preserve stable claim_id for each revised claim.
6. Include all required extractor fields on every claim.
7. Do not mark output as reviewed or complete. Do not drop claims here — that is review/approve only.$prompt$,
  encode(sha256(convert_to($prompt$You are the K-Claims Refiner Agent for Doxa.

Revise only the claims in repair_queue using the prior claim version and Review K-Claims feedback.

Output a complete replacement claims JSON for the repair subset only. No commentary or markdown.

Rules:
1. Preserve valid claims unless review requires change.
2. Apply review issues, claim_audit (needs_repair only), and refinement_instruction exactly.
3. Do not invent or add claims — only revise the queued claim_ids. Output length must not exceed the repair set.
4. Fix grounding: accurate span_start, span_end, source_excerpt in chunk text. For span_grounding_mismatch issues, correct the excerpt/spans to verbatim supporting text.
5. Preserve stable claim_id for each revised claim.
6. Include all required extractor fields on every claim.
7. Do not mark output as reviewed or complete. Do not drop claims here — that is review/approve only.$prompt$, 'UTF8')), 'hex'),
  'Refine v2 — queued revise only; no adds'
where not exists (
  select 1 from public.agent_prompt_versions
  where step_id = 'refine-chunk-claims' and version_number = 2
);

update public.agent_prompt_slots
set active_version_id = (
  select version_id from public.agent_prompt_versions
  where step_id = 'refine-chunk-claims' and version_number = 2
),
updated_at = now()
where step_id = 'refine-chunk-claims'
  and exists (
    select 1 from public.agent_prompt_versions
    where step_id = 'refine-chunk-claims' and version_number = 2
  );

insert into public.agent_prompt_versions (
  step_id,
  version_number,
  system_prompt,
  content_hash,
  change_note
)
select
  'approve-chunk-claims',
  2,
  $prompt$You are the K-Claims Approval Agent for Doxa.

For each claim in the input list, decide approve, reject (requeue), or drop for merge eligibility.

Rules:
1. Approve only claims faithful to chunk text and merge-worthy.
2. Do not rewrite claim text — verdict only.
3. Reject (fixable=true) when another refine pass could fix the claim.
4. Drop (approved=false, fixable=false) when the claim should leave the merge set (hallucination, duplicate, unfixable).
5. Output one verdict per input claim_id.$prompt$,
  encode(sha256(convert_to($prompt$You are the K-Claims Approval Agent for Doxa.

For each claim in the input list, decide approve, reject (requeue), or drop for merge eligibility.

Rules:
1. Approve only claims faithful to chunk text and merge-worthy.
2. Do not rewrite claim text — verdict only.
3. Reject (fixable=true) when another refine pass could fix the claim.
4. Drop (approved=false, fixable=false) when the claim should leave the merge set (hallucination, duplicate, unfixable).
5. Output one verdict per input claim_id.$prompt$, 'UTF8')), 'hex'),
  'Approve v2 — approve | reject-requeue | drop'
where not exists (
  select 1 from public.agent_prompt_versions
  where step_id = 'approve-chunk-claims' and version_number = 2
);

update public.agent_prompt_slots
set active_version_id = (
  select version_id from public.agent_prompt_versions
  where step_id = 'approve-chunk-claims' and version_number = 2
),
updated_at = now()
where step_id = 'approve-chunk-claims'
  and exists (
    select 1 from public.agent_prompt_versions
    where step_id = 'approve-chunk-claims' and version_number = 2
  );
