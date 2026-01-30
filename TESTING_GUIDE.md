# API Endpoint Testing Guide

## Prerequisites

1. **Environment Variables**: Make sure `.env.local` exists with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
   ```

2. **Database Seeded**: Run `supabase/seed.sql` in Supabase SQL Editor

3. **Dev Server Running**: `npm run dev`

## Manual Testing

### 1. Test Perspectives Endpoint
Open in browser or use curl:
```
http://localhost:3000/api/perspectives
```

**Expected**: JSON with 3 perspectives (Conservative, Progressive, Libertarian)

### 2. Test Nodes Endpoint
```
http://localhost:3000/api/nodes
```

**Expected**: JSON array with 5 nodes

### 3. Test Graph Endpoint
```
http://localhost:3000/api/graph
```

**Expected**: JSON with `nodes` and `links` arrays

### 4. Test Node Details
Get a node ID from step 2, then:
```
http://localhost:3000/api/nodes/[node-id]
```

**Expected**: Full node details with perspectives, sources, relationships

### 5. Test Neighbors
```
http://localhost:3000/api/graph/[node-id]/neighbors
```

**Expected**: Array of connected nodes

### 6. Test Validation Stats
```
http://localhost:3000/api/validate/[node-id]/stats
```

**Expected**: Array of validation statistics per perspective

## Troubleshooting

### 500 Internal Server Error
- Check that `.env.local` exists and has correct values
- Restart the dev server after creating/editing `.env.local`
- Check browser console or terminal for detailed error messages

### Empty Results
- Verify database was seeded (check Supabase Table Editor)
- Check RLS policies allow public read access

### Connection Errors
- Make sure `npm run dev` is running
- Check that port 3000 is not in use by another application

## Automated Testing

Run the test script:
```bash
node test-api.js
```

Make sure the dev server is running first!
