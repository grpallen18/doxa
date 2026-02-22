-- Remove all anonymous auth users.
-- public.users rows are removed automatically via ON DELETE CASCADE from auth.users.

DELETE FROM auth.users
WHERE raw_app_meta_data->>'provider' = 'anonymous';
