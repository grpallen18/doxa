# Doxa API Endpoints

## Core Endpoints

### Nodes

**GET `/api/nodes`**
- List all nodes (with optional filters)
- Query params: `?status=draft|under_review|stable`, `?limit=10`, `?offset=0`
- Returns: Array of nodes with basic info

**GET `/api/nodes/[id]`**
- Get a single node with full details
- Includes: perspectives, sources, relationships, validation stats
- Returns: `NodeWithDetails` object

**POST `/api/nodes`** (Admin/Manual)
- Create a new node
- Body: `{ question, status, shared_facts, perspectives: [...] }`
- Returns: Created node

### Graph

**GET `/api/graph`**
- Get the full graph structure
- Returns: `{ nodes: [...], links: [...] }` format for visualization
- Includes all nodes and relationships

**GET `/api/graph/[id]/neighbors`**
- Get neighboring nodes for a specific node
- Query params: `?depth=1` (default), `?relationship_type=...`
- Returns: Array of connected nodes with relationship info

**GET `/api/graph/[id]/path?to=[targetId]`**
- Find path between two nodes (optional, for future)
- Returns: Array of nodes forming the path

### Validation

**POST `/api/validate`**
- Submit a validation
- Body: `{ node_id, perspective_id, is_represented: boolean, feedback?: string }`
- Requires: Authenticated user (via Supabase Auth)
- Returns: Created validation

**GET `/api/validate/[nodeId]/stats`**
- Get validation statistics for a node
- Returns: `{ perspective_id, total_validations, positive_validations, validation_rate }[]`
- Aggregated per perspective

**GET `/api/validate/[nodeId]`**
- Get all validations for a node (for admin/debugging)
- Returns: Array of validation objects

### Perspectives

**GET `/api/perspectives`**
- List all perspectives
- Returns: Array of perspective objects

**GET `/api/perspectives/[id]`**
- Get a single perspective with details
- Returns: Perspective object

### Sources

**GET `/api/sources?node_id=[id]`**
- Get sources for a node
- Query params: `?perspective_id=[id]` (optional filter)
- Returns: Array of source objects

### AI Content Generation (Optional for Prototype)

**POST `/api/generate`**
- Generate node content using AI
- Body: `{ question, sources: [...], perspectives: [...] }`
- Returns: Generated node structure (draft)
- Requires: OpenAI API key

## Response Format

All endpoints return JSON with consistent structure:

```typescript
// Success
{
  data: T,
  error: null
}

// Error
{
  data: null,
  error: {
    message: string,
    code?: string
  }
}
```

## Authentication

- Public endpoints: Nodes (read), Graph, Perspectives, Sources
- Protected endpoints: Validation (POST), Node creation (POST)
- Uses Supabase Auth for protected routes

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error
