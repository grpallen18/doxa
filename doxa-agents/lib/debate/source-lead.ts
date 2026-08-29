/**
 * Turn a Bot source lead into a stories row so scrape/relevance can pick it up.
 */

/**
 * SSRF guard for bot/LLM-supplied lead URLs. Leads are later fetched by the
 * scrape pipeline, so reject anything that could point the scraper at
 * loopback, link-local (cloud metadata), or private-network hosts. The WHATWG
 * URL parser canonicalizes IPv4 literals (hex/octal/int forms), so the
 * dotted-quad check below covers obfuscated addresses too.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("url is not a valid absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must be http(s)");
  }
  if (parsed.username || parsed.password) {
    throw new Error("url must not contain credentials");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  ) {
    throw new Error("url host is not a public hostname");
  }
  // IPv6 literals (URL keeps brackets in hostname) — no legitimate lead needs one.
  if (host.includes(":") || host.startsWith("[")) {
    throw new Error("url must not use an IPv6 literal");
  }
  const quad = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (quad) {
    const a = Number(quad[1]);
    const b = Number(quad[2]);
    const isReserved =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
    if (isReserved) throw new Error("url must not target a private or reserved IP");
  }
  return parsed;
}

export async function ingestSourceLead(
  supabase: { from: (table: string) => any },
  lead: { url: string; title?: string; question_uid: string; note?: string }
): Promise<{ story_url: string; source_id: string }> {
  const url = lead.url.trim();
  const parsedUrl = assertPublicHttpUrl(url);
  const host = parsedUrl.hostname.replace(/^www\./, "");

  const existing = await supabase
    .from("sources")
    .select("source_id")
    .eq("name", "L3 acquisition")
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  let sourceId = String(existing.data?.source_id ?? "");
  if (!sourceId) {
    const ins = await supabase
      .from("sources")
      .insert({
        name: "L3 acquisition",
        domain: host,
        metadata: { l3: true },
      })
      .select("source_id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    sourceId = String(ins.data?.source_id ?? "");
  }
  if (!sourceId) throw new Error("failed to resolve L3 acquisition source");

  const { error } = await supabase.from("stories").upsert(
    {
      source_id: sourceId,
      url,
      title: (lead.title ?? url).slice(0, 500),
      relevance_score: 75,
      relevance_ran_at: new Date().toISOString(),
      metadata: {
        l3_lead: true,
        question_uid: lead.question_uid,
        note: lead.note ?? "",
        expected_domain: host,
      },
    },
    { onConflict: "url", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
  return { story_url: url, source_id: sourceId };
}
