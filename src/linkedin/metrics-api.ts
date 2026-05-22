import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { NormalizedPostMetrics } from "./types.js";

const LINKEDIN_VERSION = "202405";

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

/**
 * Parses LinkedIn socialActions/statistics and related REST shapes.
 */
export function parseLinkedInStatisticsPayload(body: unknown): NormalizedPostMetrics {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const totalShareStatistics =
    (root.totalShareStatistics as Record<string, unknown> | undefined) ??
    (root.elements as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;

  const stats =
    totalShareStatistics ??
    (root.statistics as Record<string, unknown> | undefined) ??
    root;

  const likes =
    asNumber(stats.likeCount) +
    asNumber(stats.reactionCount) +
    asNumber(stats.numLikes);
  const comments =
    asNumber(stats.commentCount) +
    asNumber(stats.numComments);
  const shares =
    asNumber(stats.shareCount) +
    asNumber(stats.numShares);
  const impressions =
    stats.impressionCount !== undefined || stats.numImpressions !== undefined
      ? asNumber(stats.impressionCount ?? stats.numImpressions)
      : null;

  return {
    likes,
    comments,
    shares,
    impressions,
    raw: body,
  };
}

export async function fetchLinkedInPostMetrics(
  ctx: PluginContext,
  accessToken: string,
  externalPostId: string,
): Promise<NormalizedPostMetrics> {
  const encoded = encodeURIComponent(externalPostId);
  const response = await ctx.http.fetch(
    `https://api.linkedin.com/rest/socialActions/${encoded}/statistics`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`linkedin_metrics_${response.status}:${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as unknown;
  return parseLinkedInStatisticsPayload(body);
}
