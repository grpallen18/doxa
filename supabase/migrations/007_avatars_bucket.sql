-- Avatars bucket for profile photos (public read; authenticated users upload only to their own path)

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload/update/delete only their own files under avatars/{user_id}
-- Path format: {auth.uid()}/avatar.jpg (first folder segment must be the user's id)

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.jwt() ->> 'sub')
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.jwt() ->> 'sub')
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.jwt() ->> 'sub')
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.jwt() ->> 'sub')
);

-- Public read is implied by public bucket; no SELECT policy needed for public buckets.
