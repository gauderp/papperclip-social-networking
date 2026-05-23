import type { PluginContext } from "@paperclipai/plugin-sdk";
import { pluginTable } from "../constants.js";
import type { NormalizedPostMetrics, PostHistoryItem } from "../linkedin/types.js";

const scheduledPosts = pluginTable("scheduled_posts");
const postMetrics = pluginTable("post_metrics");

type HistoryRow = {
  id: string;
  body: string;
  status: string;
  published_at: string | null;
  external_post_id: string | null;
  created_at: string;
  created_by_agent_id: string | null;
  created_by_run_id: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  fetched_at: string | null;
};

export async function listLinkedInPostHistory(
  ctx: PluginContext,
  companyId: string,
  limit = 50,
): Promise<PostHistoryItem[]> {
  const rows = await ctx.db.query<HistoryRow>(
    `SELECT
       sp.id,
       sp.body,
       sp.status,
       sp.published_at,
       sp.external_post_id,
       sp.created_at,
       sp.created_by_agent_id,
       sp.created_by_run_id,
       pm.likes,
       pm.comments,
       pm.shares,
       pm.impressions,
       pm.fetched_at
     FROM ${scheduledPosts} sp
     LEFT JOIN ${postMetrics} pm
       ON pm.company_id = sp.company_id
      AND pm.network_key = sp.network_key
      AND pm.external_post_id = sp.external_post_id
      AND sp.external_post_id IS NOT NULL
     WHERE sp.company_id = $1
       AND sp.network_key = 'linkedin'
       AND sp.status IN ('published', 'failed')
     ORDER BY COALESCE(sp.published_at, sp.created_at) DESC
     LIMIT $2`,
    [companyId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    status: row.status,
    publishedAt: row.published_at,
    externalPostId: row.external_post_id,
    createdAt: row.created_at,
    createdByAgentId: row.created_by_agent_id,
    createdByRunId: row.created_by_run_id,
    metrics:
      row.external_post_id && row.fetched_at
        ? {
            likes: row.likes ?? 0,
            comments: row.comments ?? 0,
            shares: row.shares ?? 0,
            impressions: row.impressions,
            fetchedAt: row.fetched_at,
          }
        : null,
  }));
}

export async function listPublishedPostsForSync(
  ctx: PluginContext,
  companyId: string,
): Promise<Array<{ externalPostId: string }>> {
  const rows = await ctx.db.query<{ external_post_id: string }>(
    `SELECT external_post_id
     FROM ${scheduledPosts}
     WHERE company_id = $1
       AND network_key = 'linkedin'
       AND status = 'published'
       AND external_post_id IS NOT NULL
       AND TRIM(external_post_id) != ''`,
    [companyId],
  );
  return rows.map((row) => ({ externalPostId: row.external_post_id }));
}

export async function upsertPostMetrics(
  ctx: PluginContext,
  companyId: string,
  networkKey: string,
  externalPostId: string,
  metrics: NormalizedPostMetrics,
): Promise<void> {
  const id = crypto.randomUUID();
  await ctx.db.execute(
    `INSERT INTO ${postMetrics} (
       id, company_id, network_key, external_post_id,
       likes, comments, shares, impressions, fetched_at, raw_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
     ON CONFLICT (company_id, network_key, external_post_id) DO UPDATE SET
       likes = excluded.likes,
       comments = excluded.comments,
       shares = excluded.shares,
       impressions = excluded.impressions,
       fetched_at = excluded.fetched_at,
       raw_json = excluded.raw_json`,
    [
      id,
      companyId,
      networkKey,
      externalPostId,
      metrics.likes,
      metrics.comments,
      metrics.shares,
      metrics.impressions,
      JSON.stringify(metrics.raw),
    ],
  );
}
