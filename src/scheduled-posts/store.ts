import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { pluginTable } from "../constants.js";
import { rowToScheduledPost, type ScheduledPost, type ScheduledPostRow, type ScheduledPostStatus } from "./types.js";

export type PluginDb = PluginContext["db"];

const scheduledPosts = pluginTable("scheduled_posts");

export async function createScheduledPost(
  db: PluginDb,
  input: {
    companyId: string;
    networkKey: string;
    body: string;
    scheduledAt: string;
    mediaJson?: unknown;
  },
): Promise<ScheduledPost> {
  const id = randomUUID();
  const mediaJson = input.mediaJson != null ? JSON.stringify(input.mediaJson) : null;

  await db.execute(
    `INSERT INTO ${scheduledPosts} (
      id, company_id, network_key, body, media_json, scheduled_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [id, input.companyId, input.networkKey, input.body, mediaJson, input.scheduledAt],
  );

  const rows = await db.query<ScheduledPostRow>(
    `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
            published_at, external_post_id, error_message, created_at, updated_at
     FROM ${scheduledPosts} WHERE id = $1 AND company_id = $2`,
    [id, input.companyId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("scheduled_post_insert_failed");
  }
  return rowToScheduledPost(row);
}

export async function listPendingScheduledPostsForCompany(
  db: PluginDb,
  companyId: string,
  networkKeys: readonly string[],
  options?: { limit?: number },
): Promise<ScheduledPost[]> {
  if (networkKeys.length === 0) {
    return [];
  }

  const limit = Math.min(options?.limit ?? 100, 200);
  const rows = await db.query<ScheduledPostRow>(
    `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
            published_at, external_post_id, error_message, created_at, updated_at
     FROM ${scheduledPosts}
     WHERE company_id = $1
       AND network_key = ANY($2::text[])
       AND status = 'pending'
     ORDER BY scheduled_at ASC
     LIMIT $3`,
    [companyId, networkKeys, limit],
  );
  return rows.map(rowToScheduledPost);
}

export async function countPendingScheduledPosts(
  db: PluginDb,
  companyId: string,
  networkKey: string,
): Promise<number> {
  const rows = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ${scheduledPosts}
     WHERE company_id = $1 AND network_key = $2 AND status = 'pending'`,
    [companyId, networkKey],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listScheduledPosts(
  db: PluginDb,
  companyId: string,
  networkKey: string,
  options?: { status?: ScheduledPostStatus; limit?: number },
): Promise<ScheduledPost[]> {
  const limit = Math.min(options?.limit ?? 50, 100);
  const params: unknown[] = [companyId, networkKey];

  let sql = `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
                    published_at, external_post_id, error_message, created_at, updated_at
             FROM ${scheduledPosts}
             WHERE company_id = $1 AND network_key = $2`;

  if (options?.status) {
    sql += ` AND status = $3`;
    params.push(options.status);
  }

  const limitParam = params.length + 1;
  sql += ` ORDER BY scheduled_at ASC LIMIT $${limitParam}`;
  params.push(limit);

  const rows = await db.query<ScheduledPostRow>(sql, params);
  return rows.map(rowToScheduledPost);
}

export async function getScheduledPost(
  db: PluginDb,
  companyId: string,
  postId: string,
): Promise<ScheduledPost | null> {
  const rows = await db.query<ScheduledPostRow>(
    `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
            published_at, external_post_id, error_message, created_at, updated_at
     FROM ${scheduledPosts} WHERE id = $1 AND company_id = $2`,
    [postId, companyId],
  );
  const row = rows[0];
  return row ? rowToScheduledPost(row) : null;
}

export async function deletePendingScheduledPost(
  db: PluginDb,
  companyId: string,
  postId: string,
): Promise<boolean> {
  const result = await db.execute(
    `DELETE FROM ${scheduledPosts}
     WHERE id = $1 AND company_id = $2 AND status = 'pending'`,
    [postId, companyId],
  );
  return result.rowCount > 0;
}

export async function listDuePendingPosts(
  db: PluginDb,
  nowIso: string,
): Promise<ScheduledPost[]> {
  const rows = await db.query<ScheduledPostRow>(
    `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
            published_at, external_post_id, error_message, created_at, updated_at
     FROM ${scheduledPosts}
     WHERE status = 'pending' AND scheduled_at <= $1
     ORDER BY scheduled_at ASC
     LIMIT 25`,
    [nowIso],
  );
  return rows.map(rowToScheduledPost);
}

export async function markScheduledPostPublished(
  db: PluginDb,
  postId: string,
  externalPostId: string,
  publishedAt: string,
): Promise<void> {
  await db.execute(
    `UPDATE ${scheduledPosts}
     SET status = 'published',
         published_at = $1,
         external_post_id = $2,
         error_message = NULL,
         updated_at = now()
     WHERE id = $3`,
    [publishedAt, externalPostId, postId],
  );
}

export async function markScheduledPostFailed(
  db: PluginDb,
  postId: string,
  errorMessage: string,
): Promise<void> {
  await db.execute(
    `UPDATE ${scheduledPosts}
     SET status = 'failed',
         error_message = $1,
         updated_at = now()
     WHERE id = $2`,
    [errorMessage.slice(0, 2000), postId],
  );
}
