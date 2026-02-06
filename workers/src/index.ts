import { extractArticleText } from "./scrape"

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export default {
  async fetch(
    request: Request,
    env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string }
  ): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/scrape" || url.pathname === "/extract") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Use POST" }, 405)
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
