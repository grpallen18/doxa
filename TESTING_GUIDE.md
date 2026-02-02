# API Endpoint Testing Guide

## Prerequisites

1. **Environment Variables**: Make sure `.env.local` exists with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

2. **Database**: Run migrations 010 and 011, then `supabase/seed_new_schema.sql` (see supabase/README.md).

3. **Dev Server Running**: `npm run dev`

## Manual Testing

### 1. Test Topics Endpoint
```
http://localhost:3000/api/topics
```

**Expected**: JSON array of topics (`topic_id`, `slug`, `title`, `summary`, `status`).

### 2. Test Viewpoints Endpoint
```
http://localhost:3000/api/viewpoints
```

**Expected**: JSON array of viewpoints (topic-scoped: `viewpoint_id`, `topic_id`, `title`, `summary`).

### 3. Test Viewpoints by Topic
Get a `topic_id` from step 1, then:
```
http://localhost:3000/api/viewpoints?topic_id=[topic-id]
```

**Expected**: Viewpoints for that topic only.

### 4. Test Topic Details
Get a topic ID from step 1, then:
```
http://localhost:3000/api/topics/[topic-id]
```

**Expected**: Full topic object plus `viewpoints` array.

## Troubleshooting

### 500 Internal Server Error
- Check that `.env.local` exists and has correct values
- Restart the dev server after creating/editing `.env.local`
- Check browser console or terminal for detailed error messages

### Empty Results
- Run migrations 010 and 011, then `supabase/seed_new_schema.sql`
- Check RLS policies allow public read on `topics` and `viewpoints`

### Connection Errors
- Make sure `npm run dev` is running
- Check that port 3000 is not in use by another application

## Automated Testing

Run the test script:
```bash
node test-api.js
```

Make sure the dev server is running first!
