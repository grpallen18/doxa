// Read-only gut check: pipeline stage counts
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function count(table, filter = {}) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) {
    q = q.eq(k, v);
  }
  const { count: c, error } = await q;
  if (error) return { error: error.message };
  return c ?? 0;
}

async function run() {
  console.log("=== Pipeline gut check (read-only) ===\n");

  // 1. Claims
  const claimsTotal = await count("claims");
  const claimsTotalNum = typeof claimsTotal === "number" ? claimsTotal : 0;
  const claimsWithCanonical = await supabase
    .from("claims")
    .select("claim_id", { count: "exact", head: true })
    .not("canonical_text", "is", null);
  const claimsNotClustered = await supabase
    .from("claims")
    .select("claim_id", { count: "exact", head: true })
    .is("cluster_computed_at", null);
  const claimsNeedsUpdate = await supabase
    .from("claims")
    .select("claim_id", { count: "exact", head: true })
    .eq("needs_cluster_update", true);
  console.log("1. CLAIMS");
  console.log("   Total claims:", typeof claimsTotal === "object" ? claimsTotal : claimsTotal);
  console.log("   With canonical_text:", claimsWithCanonical.count ?? "?");
  console.log("   Not yet clustered (cluster_computed_at null):", claimsNotClustered.count ?? "?");
  console.log("   Flagged needs_cluster_update:", claimsNeedsUpdate.count ?? "?");
  if (claimsWithCanonical.error) console.log("   Error:", claimsWithCanonical.error);

  // 2. Claim relationships (classify_claim_pairs output)
  const relTotal = await count("claim_relationships");
  const { data: relRows } = await supabase
    .from("claim_relationships")
    .select("relationship")
    .range(0, 4999);
  const typeCounts = {};
  for (const r of relRows ?? []) {
    typeCounts[r.relationship] = (typeCounts[r.relationship] ?? 0) + 1;
  }
  const relControversial = (typeCounts.contradicts ?? 0) + (typeCounts.competing_framing ?? 0);
  console.log("\n2. CLAIM_RELATIONSHIPS (classify_claim_pairs)");
  console.log("   Total:", relTotal);
  console.log("   By type:", typeCounts);
  console.log("   Controversial (contradicts + competing_framing):", relControversial);

  // 3. Position clusters
  const posTotal = await count("position_clusters");
  const posActive = await count("position_clusters", { status: "active" });
  const posWithCentroid = await supabase
    .from("position_clusters")
    .select("position_cluster_id", { count: "exact", head: true })
    .eq("status", "active")
    .not("centroid_embedding", "is", null);
  console.log("\n3. POSITION_CLUSTERS");
  console.log("   Total:", posTotal);
  console.log("   Active:", posActive);
  console.log("   Active with centroid:", posWithCentroid.count ?? "?");

  // 4. Position cluster claims (positions -> claims)
  const pcc = await supabase
    .from("position_cluster_claims")
    .select("position_cluster_id", { count: "exact", head: true });
  // Distinct position count: sample
  const { data: pccSample } = await supabase
    .from("position_cluster_claims")
    .select("position_cluster_id")
    .limit(5000);
  const uniquePosInPcc = new Set((pccSample ?? []).map((r) => r.position_cluster_id));
  const { data: allPcc } = await supabase.from("position_cluster_claims").select("claim_id");
  const uniqueClaims = new Set((allPcc ?? []).map((r) => r.claim_id));
  console.log("\n4. POSITION_CLUSTER_CLAIMS");
  console.log("   Total rows:", pcc.count ?? "?");
  console.log("   Unique positions with claims:", uniquePosInPcc.size);
  console.log("   Unique claims in any position:", uniqueClaims.size, `(of ${claimsTotalNum} total = ${((uniqueClaims.size / claimsTotalNum) * 100).toFixed(1)}%)`);

  // 5. Position pair scores (aggregate_position_pair_scores output)
  const ppsTotal = await count("position_pair_scores");
  const ppsScoreGte1 = await supabase
    .from("position_pair_scores")
    .select("position_a_id", { count: "exact", head: true })
    .gte("controversy_score", 1);
  console.log("\n5. POSITION_PAIR_SCORES (aggregate_position_pair_scores)");
  console.log("   Total pairs:", ppsTotal);
  console.log("   Pairs with controversy_score >= 1:", ppsScoreGte1.count ?? "?");

  // 6. Controversy clusters
  const ccTotal = await count("controversy_clusters");
  const ccActive = await count("controversy_clusters", { status: "active" });
  console.log("\n6. CONTROVERSY_CLUSTERS");
  console.log("   Total:", ccTotal);
  console.log("   Active:", ccActive);

  // 7. Controversy cluster positions (link table)
  const ccp = await count("controversy_cluster_positions");
  console.log("\n7. CONTROVERSY_CLUSTER_POSITIONS (links)");
  console.log("   Total:", ccp);

  console.log("\n=== Summary ===");
  console.log("Pipeline: claims -> claim_relationships -> position_clusters -> position_pair_scores -> controversy_clusters");
}

run().catch(console.error);
