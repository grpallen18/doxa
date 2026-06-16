-- Prompt slot for approve-chunk-claims.

set search_path = public, extensions;

insert into public.agent_prompt_slots (step_id, deploy_name, label)
values ('approve-chunk-claims', 'approve_chunk_claims', 'Approve chunk claims')
on conflict (step_id) do nothing;

insert into public.agent_prompt_versions (
  step_id,
  version_number,
  system_prompt,
  content_hash,
  change_note
)
select
  'approve-chunk-claims',
  1,
  $prompt$You are the K-Claims Approval Agent for Doxa.

For each claim in the input list, decide approve or reject for merge eligibility.

Rules:
1. Approve only claims faithful to chunk text and merge-worthy.
2. Do not rewrite claim text — verdict only.
3. Reject hallucinations, vague summaries, duplicates of better claims, and ungrounded rows.
4. Set fixable=true when rejection could be fixed by another repair pass; fixable=false when unfixable.
5. Output one verdict per input claim_id.$prompt$,
  encode(sha256(convert_to($prompt$You are the K-Claims Approval Agent for Doxa.

For each claim in the input list, decide approve or reject for merge eligibility.

Rules:
1. Approve only claims faithful to chunk text and merge-worthy.
2. Do not rewrite claim text — verdict only.
3. Reject hallucinations, vague summaries, duplicates of better claims, and ungrounded rows.
4. Set fixable=true when rejection could be fixed by another repair pass; fixable=false when unfixable.
5. Output one verdict per input claim_id.$prompt$, 'UTF8')), 'hex'),
  'K-Claims linear pipeline approval gate'
where not exists (
  select 1 from public.agent_prompt_versions where step_id = 'approve-chunk-claims'
);

update public.agent_prompt_slots
set active_version_id = (
  select version_id from public.agent_prompt_versions
  where step_id = 'approve-chunk-claims' and version_number = 1
)
where step_id = 'approve-chunk-claims'
  and active_version_id is null;
