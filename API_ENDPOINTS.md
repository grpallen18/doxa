# Doxa API Endpoints

## Core Endpoints

### Topics

**GET `/api/topics`**
- List all topics (with optional filters)
- Query params: `?status=draft|published|archived`, `?limit=100`, `?offset=0`
- Returns: Array of topics (`topic_id`, `slug`, `title`, `summary`, `status`, `metadata`, `created_at`, `updated_at`)

**GET `/api/topics/[id]`**
- Get a single topic by `topic_id` with viewpoints
- Returns: `TopicWithDetails` (topic + `viewpoints[]`)

**POST `/api/topics`** (Admin/Manual)
- Create a new topic (optional for v1)
- Body: `{ slug, title, summary, status, metadata }`
- Returns: Created topic

### Viewpoints

**GET `/api/viewpoints`**
- List viewpoints, optionally filtered by topic
- Query params: `?topic_id=[uuid]` (optional)
- Returns: Array of viewpoint objects (`viewpoint_id`, `topic_id`, `archetype_id`, `title`, `summary`, `metadata`, …)

### Sources (optional for v1)

**GET `/api/sources`**
- List publisher sources (new schema: name, domain, bias_tags)
- Returns: Array of source objects

### Topic graph (removed)

The previous graph API (`/api/graph`, `/api/graph/[id]/neighbors`) and `topic_relationships` table have been removed. The `/graph` page now shows a topic list; related-topics can be re-added later via a `topic_links` table if needed.

## Response Format

All endpoints return JSON:

```typescript
// Success
{ data: T, error: null }

// Error
{ data: null, error: { message: string, code?: string } }
```

## Authentication

- Public read: Topics, Viewpoints
- Protected writes: Use service role or authenticated pipeline for creating topics/viewpoints

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error
