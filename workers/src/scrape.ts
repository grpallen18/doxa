/**
 * Article scrape handler: fetch URL, extract main content with Readability (+ linkedom).
 * Fallback: Cloudflare Browser Rendering /content then Readability again so output is always textContent.
 */

import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom/worker"

const FETCH_TIMEOUT_MS = 15_000
const BROWSER_RENDER_TIMEOUT_MS = 30_000
const MAX_HTML_BYTES = 5 * 1024 * 1024 // 5 MB
const CONTENT_MIN_LENGTH = 500

const USER_AGENT = "DoxaBot/1.0 (content extraction)"

export type ScrapeResult =
  | { ok: true; title: string; content: string }
  | { ok: false; error: string; story_id?: string }

export type ScrapeInput = { url: string; story_id?: string }

/**
 * Allow only http/https; reject localhost, loopback, and private IPs.
 */
export function validateUrl(urlStr: string): { ok: true } | { ok: false; error: string } {
  if (typeof urlStr !== "string" || !urlStr.trim()) {
    return { ok: false, error: "URL is required" }
  }
  let url: URL
  try {
    url = new URL(urlStr.trim())
  } catch {
    return { ok: false, error: "Invalid URL" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" }
  }
  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
    return { ok: false, error: "localhost and loopback are not allowed" }
  }
  // Private / reserved IPv4
  if (/^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || /^192\.168\./.test(host)) {
    return { ok: false, error: "Private IP ranges are not allowed" }
  }
  // IPv6 loopback / link-local
  if (host === "[::1]" || /^fe80:/i.test(host) || /^\[fe80:/i.test(host)) {
    return { ok: false, error: "Loopback and link-local addresses are not allowed" }
  }
  return { ok: true }
}

/**
 * Read response body up to maxBytes; if larger, return null and the response body is not consumed fully.
 */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<string | null> {
  const contentLength = response.headers.get("Content-Length")
  if (contentLength) {
    const len = parseInt(contentLength, 10)
    if (!Number.isFinite(len) || len > maxBytes) return null
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) return null
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined)
}

function extractWithReadability(html: string): { title: string; content: string } | null {
  try {
    const { document } = parseHTML(html)
    const article = new Readability(document).parse()
    if (!article?.textContent || article.textContent.length < CONTENT_MIN_LENGTH) return null
    return {
      title: article.title ?? "",
      content: article.textContent,
    }
  } catch {
    return null
  }
}

/**
 * Call Cloudflare Browser Rendering /content to get rendered HTML.
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to be set.
 */
async function fetchRenderedContent(url: string, accountId: string, token: string): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BROWSER_RENDER_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      }
    )
    clearTimeout(timeoutId)
    if (!res.ok) return null
    const data = (await res.json()) as { success?: boolean; result?: string }
    if (!data.success || typeof data.result !== "string") return null
    return data.result
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/**
 * Extract article text from a URL. Primary: fetch + Readability. Fallback: Browser Rendering /content then Readability.
 * Output is always Readability textContent. story_id is passed through for logging and error responses.
 */
export async function extractArticleText(
  input: ScrapeInput,
  env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string }
): Promise<ScrapeResult> {
  const { url, story_id } = input
  const validation = validateUrl(url)
  if (!validation.ok) {
    return { ok: false, error: validation.error, story_id }
  }

  // Primary: fetch HTML with size cap
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let html: string | null = null
  let fetchError: string | null = null
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      fetchError = `Fetch failed: ${res.status}`
    } else {
      html = await readBodyWithCap(res, MAX_HTML_BYTES)
      if (html === null) {
        fetchError = "Response body exceeds max size (5 MB)"
      }
    }
  } catch (e) {
    clearTimeout(timeoutId)
    fetchError = e instanceof Error ? e.message : "Fetch failed"
  }

  if (html) {
    const primary = extractWithReadability(html)
    if (primary) {
      return { ok: true, title: primary.title, content: primary.content }
    }
  }

  // Fallback: Browser Rendering when fetch failed or Readability couldn't extract
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const token = env.CLOUDFLARE_API_TOKEN
  if (!accountId?.trim() || !token?.trim()) {
    return { ok: false, error: fetchError ?? "Browser Rendering not configured", story_id }
  }

  const renderedHtml = await fetchRenderedContent(url, accountId.trim(), token.trim())
  if (!renderedHtml) {
    const err = fetchError
      ? `${fetchError}; Browser Rendering also failed`
      : "Browser Rendering failed or returned no content"
    return { ok: false, error: err, story_id }
  }

  const fallback = extractWithReadability(renderedHtml)
  if (fallback) {
    return { ok: true, title: fallback.title, content: fallback.content }
  }

  return {
    ok: false,
    error: fetchError ? `${fetchError}; could not extract content after Browser Rendering` : "Could not extract article content",
    story_id,
  }
}
