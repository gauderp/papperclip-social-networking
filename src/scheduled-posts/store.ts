import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { rowToScheduledPost, type ScheduledPost, type ScheduledPostRow, type ScheduledPostStatus } from "./types.js";

export type PluginDb = PluginContext["db"];

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
    `INSERT INTO scheduled_posts (
      id, company_id, network_key, body, media_json, scheduled_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, input.companyId, input.networkKey, input.body, mediaJson, input.scheduledAt],
  );

  const rows = await db.query<ScheduledPostRow>(
    `SELECT id, company_id, network_key, body, media_json, scheduled_at, status,
            published_at, external_post_id, error_message, created_at, updated_at
     FROM scheduled_posts WHERE id = ? AND company_id = ?`,
    [id, input.companyId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("scheduled_post_insert_failed");
  }
  return rowToScheduledPost(row);
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
             FROM scheduled_posts
             WHERE company_id = ? AND network_key = ?`;

  if (options?.status) {
    sql += ` AND status = ?`;
    params.push(options.status);
  }

  sql += ` ORDER BY scheduled_at ASC LIMIT ?`;
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
     FROM scheduled_posts WHERE id = ? AND company_id = ?`,
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
    `DELETE FROM scheduled_posts
     WHERE id = ? AND company_id = ? AND status = 'pending'`,
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
     FROM scheduled_posts
     WHERE status = 'pending' AND scheduled_at <= ?
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
    `UPDATE scheduled_posts
     SET status = 'published',
         published_at = ?,
         external_post_id = ?,
         error_message = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
    [publishedAt, externalPostId, postId],
  );
}

export async function markScheduledPostFailed(
  db: PluginDb,
  postId: string,
  errorMessage: string,
): Promise<void> {
  await db.execute(
    `UPDATE scheduled_posts
     SET status = 'failed',
         error_message = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [errorMessage.slice(0, 2000), postId],
  );
}
