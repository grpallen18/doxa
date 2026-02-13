-- Update column comment to reflect rename: thesis_drift_relabel -> label_thesis.
comment on column public.theses.thesis_text is 'LLM-generated one-sentence label; written by label_thesis.';
