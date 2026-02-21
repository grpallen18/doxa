# Doxa Cloudflare Workers

This folder is a **single Cloudflare Worker** for the Doxa project. It is deployed as one unit; behavior is split into **handlers** selected by the request path. Each path (e.g. `/scrape`) is a “handler”: a piece of logic you invoke by sending an HTTP request to that path.

- **Repo role:** Cloudflare can connect to the repo and deploy from this folder (set **Root directory** to `workers` in the dashboard).
- **Stack:** Wrangler, TypeScript. Entry point is `src/index.ts`; it routes by URL path and calls into modules under `src/`.

---

## Layout

| Path | Purpose |
|------|--------|
| `wrangler.toml` | Worker config: name (`doxa`), main script (`src/index.ts`), compatibility date, observability (logs). Comment documents required secrets. |
| `deploy-with-secrets.sh` | For Git-connected deploys: pushes Build secrets to Worker, then runs `wrangler deploy`. Use as the Cloudflare Build deploy command. |
| `package.json` | Scripts: `npm run deploy` (wrangler deploy), `npm run dev` (wrangler dev). Dependencies: `@mozilla/readability`, `linkedom`. Dev: `wrangler` (v4). |
| `src/index.ts` | Entry point. Exports a `fetch(request, env)` handler; routes by `request.url` path and method, returns JSON or plain text. |
| `src/scrape.ts` | Article scrape handler: URL → fetch HTML or use Browser Rendering fallback → always return Readability `textContent`. Used by the `/scrape` and `/extract` routes. |

---

## Routes (handlers)

- **`POST /scrape`** and **`POST /extract`** — same behavior: article text extraction (see below).
- Any other path/method — returns plain text: `Hello from doxa worker`.

All JSON responses use `Content-Type: application/json`. Success responses are `{ "title", "content" }`; error responses are `{ "error", "story_id"? }` with an appropriate status code.

---

## Scrape handler (POST /scrape and POST /extract)

**Purpose:** Given a URL, return the main article text (and title) in a single, consistent format: **Readability `textContent`** only. Used so downstream chunking, embeddings, and claim extraction see one style of output.

**Request**

- **Method:** POST only (405 for GET etc.).
- **Body:** JSON.
  - `url` (string, required) — the page to scrape.
  - `story_id` (string, optional) — idempotency/logging; echoed in error responses so callers can map failures to a story deterministically.

**Flow**

1. **Validate URL** — Allowlist/denylist before any fetch:
   - Allowed: `http:` and `https:` only.
   - Rejected: localhost, loopback, private IPs (e.g. 127.x, 10.x, 172.16–31.x, 192.168.x, ::1, fe80:).
   - Invalid or disallowed URL → 400 and `{ "error", "story_id"? }`.

2. **Primary path**
   - Fetch the URL (timeout 15s, User-Agent `DoxaBot/1.0 (content extraction)`).
   - **Max HTML size:** 5 MB. If `Content-Length` or streamed body exceeds that, the handler returns a deterministic error (no partial body).
   - Parse HTML with **linkedom** (Worker-safe DOM from `linkedom/worker`), run **Mozilla Readability** on the document.
   - If Readability returns an article with at least 500 characters of `textContent`, return 200 and `{ "title", "content" }` (content is that textContent).

3. **Fallback (when primary yields little or nothing)**
   - **Render-cap check:** If `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` is missing, do **not** call Browser Rendering; return an error (e.g. "Browser Rendering not configured") and optional `story_id`.
   - If both are set: call **Cloudflare Browser Rendering** REST API **`/content`** with the same URL to get fully rendered HTML.
   - Run **Readability again** on that HTML in the worker (linkedom + Readability).
   - If that yields enough textContent, return 200 and `{ "title", "content" }`. Otherwise return an error and optional `story_id`.

**Response**

- **200** — `{ "title": string, "content": string }`. `content` is always Readability `textContent` (normalized format).
- **400** — Bad request (e.g. missing/invalid URL, URL not allowed). Body: `{ "error", "story_id"? }`.
- **405** — Method not POST.
- **401** — Missing or invalid **Authorization: Bearer SCRAPE_SECRET**.
- **502** — Scrape failed (fetch failed, body too large, Readability failed, Browser Rendering not configured or failed). Body: `{ "error", "story_id"? }`.

**Auth (scrape workflow)**

- **POST /scrape** (and /extract) require **Authorization: Bearer SCRAPE_SECRET** (same value as Supabase). If missing or wrong, the Worker returns 401.
- When `story_id` is present in the body, the Worker calls the Supabase Edge Function **receive_scraped_content** with the result (success or failure) so the DB is updated. The Worker never needs a Supabase service-role key.

**Environment / secrets**

For **Git-connected deploys** (Cloudflare Build): add secrets in **Build → Variables and secrets**. Use `bash deploy-with-secrets.sh` as the deploy command so the script pushes those secrets to the Worker before each deploy.

For **manual deploys** (`npm run deploy`): add secrets in **Workers and Pages → doxa → Settings → Variables and Secrets**.

Required:
- **SCRAPE_SECRET** — Must match Supabase; protects /scrape and authenticates callbacks to receive_scraped_content.
- **SUPABASE_RECEIVE_URL** — Full URL of receive_scraped_content (e.g. `https://<project_ref>.supabase.co/functions/v1/receive_scraped_content`).

Optional (Browser Rendering fallback):
- **CLOUDFLARE_ACCOUNT_ID** — Get from Cloudflare dashboard (Workers or Overview page; URL or right-hand sidebar).
- **CLOUDFLARE_API_TOKEN** — Token with "Browser Rendering - Edit" permission. Create under My Profile → API Tokens. For Git deploy, use a token that also has "Edit Cloudflare Workers" so the build can deploy.

**Constants (in code)**

- Fetch timeout: 15s. Browser Rendering timeout: 30s. Max HTML size: 5 MB. Minimum content length to accept from Readability: 500 characters.

---

## Dependencies

- **`@mozilla/readability`** — Extracts main article content from a DOM document (Reader View style). Needs a DOM; we use linkedom because it runs in Workers.
- **`linkedom`** — Lightweight DOM implementation. Use **`linkedom/worker`** in this project so it works in the Cloudflare Workers runtime (jsdom is Node-oriented and not used here).

---

## Local dev and deploy

- **Install:** `npm install` (from the `workers` directory).
- **Local dev:** `npm run dev` (Wrangler dev server).
- **Deploy (manual):** `npm run deploy` (or `npx wrangler deploy`). Set Worker secrets in Settings → Variables and Secrets.
- **Deploy (Git):** In Cloudflare Build, set deploy command to `bash deploy-with-secrets.sh` and add all secrets in Build → Variables and secrets.

---

## Known issue: new deployments may fail (Cloudflare runtime)

As of Feb 2026, we observed that **new deployments can fail with 503/CPU errors** even when the Worker code is identical. A diff between a working deployment (9ddeb96) and a broken one (6de4a16) showed no changes to `workers/`—same code, same dependencies, same bundle size. The failure appears to be caused by changes on Cloudflare’s side (runtime or deployment pipeline), not our code.

**Mitigation:** Use **Build watch paths** in Cloudflare Build settings and set it to `workers` so the Worker only redeploys when this folder changes. Avoid redeploying unless you’ve actually changed the Worker.

**Rollback:** If the Worker is accidentally redeployed and scrapes start failing, roll back to the known-good version in Cloudflare:

- **Workers & Pages** → **doxa** → **Deployments**
- Find version **c0627331-6742-405b-96f1-a1d25e82c3c3** (deployed 2026-02-18)
- Use **Rollback** or **Set as active**

---

## Adding a new handler

1. Implement the logic in a new module under `src/` (e.g. `src/otherHandler.ts`).
2. In `src/index.ts`, read `new URL(request.url).pathname` (and method if needed). For the path you want (e.g. `POST /other`), parse the body, call your module, and return a `Response` (e.g. `jsonResponse(...)`).
3. No new `wrangler.toml` or separate worker is required; one worker, multiple paths.
