/**
 * Consumer publish gate for projected controversies.
 * Single source of truth — projection writes status; explore reads `open` only.
 */

export type ControversyPublishStatus = "open" | "developing" | "closed";

export type PublishBlockReason =
  | "insufficient_sides"
  | "no_sources"
  | "no_viewpoints";

export type PublishabilityInput = {
  sidesCount: number;
  sourceCount: number;
  viewpointCount: number;
  existingStatus?: string | null;
};

export type PublishabilityResult = {
  status: ControversyPublishStatus;
  publishBlockReason: PublishBlockReason | null;
};

export function evaluatePublishability(input: PublishabilityInput): PublishabilityResult {
  if (input.existingStatus === "closed") {
    return { status: "closed", publishBlockReason: null };
  }

  if (input.sidesCount < 2) {
    return { status: "developing", publishBlockReason: "insufficient_sides" };
  }
  if (input.sourceCount < 1) {
    return { status: "developing", publishBlockReason: "no_sources" };
  }
  if (input.viewpointCount < 1) {
    return { status: "developing", publishBlockReason: "no_viewpoints" };
  }

  return { status: "open", publishBlockReason: null };
}

export function isPublishable(result: PublishabilityResult): boolean {
  return result.status === "open";
}
