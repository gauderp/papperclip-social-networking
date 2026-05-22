import type { PluginContext } from "@paperclipai/plugin-sdk";
import { listPublishedPostsForSync, upsertPostMetrics } from "../db/post-history.js";
import { getNetworkStatus, getTokenMetadata } from "./accounts.js";
import { fetchLinkedInPostMetrics } from "./metrics-api.js";
import type { SyncMetricsResult } from "./types.js";

const NETWORK_KEY = "linkedin";

export async function syncLinkedInMetricsForCompany(
  ctx: PluginContext,
  companyId: string,
): Promise<SyncMetricsResult> {
  const status = await getNetworkStatus(ctx, companyId);
  const tokens = await getTokenMetadata(ctx, companyId);
  const accessToken = tokens?.accessToken ?? null;

  if (status.status !== "connected" || !accessToken) {
    return {
      companyId,
      synced: 0,
      skipped: 0,
      errors: 0,
      reason: "not_connected",
    };
  }

  const posts = await listPublishedPostsForSync(ctx, companyId);
  if (posts.length === 0) {
    return {
      companyId,
      synced: 0,
      skipped: 0,
      errors: 0,
      reason: "no_posts",
    };
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const { externalPostId } of posts) {
    try {
      const metrics = await fetchLinkedInPostMetrics(ctx, accessToken, externalPostId);
      await upsertPostMetrics(ctx, companyId, NETWORK_KEY, externalPostId, metrics);
      synced += 1;
    } catch (err) {
      ctx.logger.warn("linkedin metrics sync failed for post", {
        companyId,
        externalPostId,
        error: err instanceof Error ? err.message : String(err),
      });
      errors += 1;
    }
  }

  skipped = posts.length - synced - errors;

  return { companyId, synced, skipped, errors };
}

export async function syncAllConnectedLinkedInAccounts(ctx: PluginContext): Promise<void> {
  const accounts = await ctx.db.query<{ company_id: string }>(
    `SELECT company_id
     FROM network_accounts
     WHERE network_key = 'linkedin' AND status = 'connected'`,
  );

  for (const { company_id } of accounts) {
    const result = await syncLinkedInMetricsForCompany(ctx, company_id);
    ctx.logger.info("sync-linkedin-metrics company finished", result);
  }
}
