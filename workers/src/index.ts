import { extractArticleText } from "./scrape"

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function getBearerSecret(request: Request): string | null {
  const auth = request.headers.get("Authorization")
  if (!auth || !auth.startsWith("Bearer ")) return null
  return auth.slice(7).trim() || null
}

/** Returns { ok: true } or { ok: false, status, body } so caller can log and return 502 if callback failed. */
async function notifyReceiveScrapedContent(
  receiveUrl: string,
  secret: string,
  storyId: string,
  result: { ok: true; title: string; content: string } | { ok: false; error: string }
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const body = result.ok
    ? { story_id: storyId, title: result.title, content: result.content }
    : { story_id: storyId, error: result.error }
  try {
    const res = await fetch(receiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    })
    const resBody = await res.text()
    if (!res.ok) {
      console.error("[doxa] receive_scraped_content failed", {
        story_id: storyId,
        status: res.status,
        body: resBody.slice(0, 500),
      })
      return { ok: false, status: res.status, body: resBody }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[doxa] receive_scraped_content request error", { story_id: storyId, error: msg })
    return { ok: false, status: 0, body: msg }
  }
}

export default {
  async fetch(
    request: Request,
    env: {
      SCRAPE_SECRET?: string
      SUPABASE_RECEIVE_URL?: string
      CLOUDFLARE_ACCOUNT_ID?: string
      CLOUDFLARE_API_TOKEN?: string
    }
  ): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/scrape" || url.pathname === "/extract") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Use POST" }, 405)
      }
      const secret = env.SCRAPE_SECRET
      const bearer = getBearerSecret(request)
      if (!secret?.trim() || bearer !== secret.trim()) {
        return jsonResponse({ error: "Unauthorized" }, 401)
      }
      let body: { url?: string; story_id?: string } = {}
      try {
        body = (await request.json()) as { url?: string; story_id?: string }
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400)
      }
      const targetUrl = typeof body.url === "string" ? body.url : ""
      const storyId = typeof body.story_id === "string" ? body.story_id : undefined
      const result = await extractArticleText(
        { url: targetUrl, story_id: storyId },
        {
          CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
          CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        }
      )
      if (result.ok) {
        console.log("[doxa] scrape ok", { story_id: storyId, url: targetUrl, contentLength: result.content.length })
      } else {
        console.log("[doxa] scrape failed", { story_id: storyId, url: targetUrl, error: result.error })
      }

      const receiveUrl = env.SUPABASE_RECEIVE_URL?.trim()
      if (storyId && receiveUrl) {
        console.log("[doxa] calling receive_scraped_content", { story_id: storyId })
        const callbackResult = await notifyReceiveScrapedContent(receiveUrl, secret.trim(), storyId, result)
        if (!callbackResult.ok) {
          const errBody = callbackResult.body.slice(0, 300)
          return jsonResponse(
            {
              error: `receive_scraped_content failed: ${callbackResult.status}`,
              callback_status: callbackResult.status,
              callback_body: errBody,
              story_id: storyId,
            },
            502
          )
        }
        console.log("[doxa] receive_scraped_content ok", { story_id: storyId })
      } else if (storyId) {
        console.log("[doxa] skip callback: no SUPABASE_RECEIVE_URL", { story_id: storyId })
      }

      if (result.ok) {
        return jsonResponse({ title: result.title, content: result.content }, 200)
      }
      const status =
        result.error === "URL is required" ||
        result.error === "Invalid URL" ||
        result.error.includes("allowed")
          ? 400
          : 502
      return jsonResponse(
        { error: result.error, ...(result.story_id != null && { story_id: result.story_id }) },
        status
      )
    }

    return new Response("Hello from doxa worker", {
      headers: { "Content-Type": "text/plain" },
    })
  },
}
