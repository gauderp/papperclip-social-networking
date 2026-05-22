export type ScheduledPostStatus = "pending" | "published" | "failed";

export type ScheduledPostRow = {
  id: string;
  company_id: string;
  network_key: string;
  body: string;
  media_json: string | null;
  scheduled_at: string;
  status: ScheduledPostStatus;
  published_at: string | null;
  external_post_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduledPost = {
  id: string;
  companyId: string;
  networkKey: string;
  body: string;
  mediaJson: unknown;
  scheduledAt: string;
  status: ScheduledPostStatus;
  publishedAt: string | null;
  externalPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function rowToScheduledPost(row: ScheduledPostRow): ScheduledPost {
  let mediaJson: unknown = null;
  if (row.media_json) {
    try {
      mediaJson = JSON.parse(row.media_json) as unknown;
    } catch {
      mediaJson = null;
    }
  }
  return {
    id: row.id,
    companyId: row.company_id,
    networkKey: row.network_key,
    body: row.body,
    mediaJson,
    scheduledAt: row.scheduled_at,
    status: row.status,
    publishedAt: row.published_at,
    externalPostId: row.external_post_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
