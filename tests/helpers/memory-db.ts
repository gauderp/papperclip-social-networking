import { randomUUID } from "node:crypto";
import { PLUGIN_DB_NAMESPACE } from "../../src/constants.js";
import type { PluginDb } from "../../src/scheduled-posts/store.js";

function normalizeSql(sql: string): string {
  return sql
    .replace(new RegExp(`${PLUGIN_DB_NAMESPACE}\\.`, "gi"), "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type ScheduledPostRow = {
  id: string;
  company_id: string;
  network_key: string;
  body: string;
  media_json: string | null;
  scheduled_at: string;
  status: string;
  published_at: string | null;
  external_post_id: string | null;
  error_message: string | null;
  created_by_agent_id: string | null;
  created_by_run_id: string | null;
  created_at: string;
  updated_at: string;
};

type NetworkAccountRow = {
  id: string;
  company_id: string;
  network_key: string;
  display_name: string | null;
  status: string;
  connected_at: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

type PostMetricRow = {
  id: string;
  company_id: string;
  network_key: string;
  external_post_id: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number | null;
  fetched_at: string;
  raw_json: string | null;
};

export type MemoryDbState = {
  scheduled_posts: ScheduledPostRow[];
  network_accounts: NetworkAccountRow[];
  post_metrics: PostMetricRow[];
};

export type MemoryPluginDb = PluginDb & {
  seed: {
    addScheduledPost(row: ScheduledPostRow): void;
    addNetworkAccount(row: NetworkAccountRow): void;
    addPostMetric(row: PostMetricRow): void;
  };
};

function normalizeScheduledPostRow(row: ScheduledPostRow): ScheduledPostRow {
  return {
    created_by_agent_id: null,
    created_by_run_id: null,
    ...row,
  };
}

export function createMemoryPluginDb(initial?: Partial<MemoryDbState>): MemoryPluginDb {
  const state: MemoryDbState = {
    scheduled_posts: (initial?.scheduled_posts ?? []).map(normalizeScheduledPostRow),
    network_accounts: [...(initial?.network_accounts ?? [])],
    post_metrics: [...(initial?.post_metrics ?? [])],
  };

  const db: MemoryPluginDb = {
    seed: {
      addScheduledPost(row) {
        state.scheduled_posts.push({
          created_by_agent_id: null,
          created_by_run_id: null,
          ...row,
        });
      },
      addNetworkAccount(row) {
        const idx = state.network_accounts.findIndex(
          (r) => r.company_id === row.company_id && r.network_key === row.network_key,
        );
        if (idx >= 0) state.network_accounts[idx] = row;
        else state.network_accounts.push(row);
      },
      addPostMetric(row) {
        const idx = state.post_metrics.findIndex(
          (m) =>
            m.company_id === row.company_id &&
            m.network_key === row.network_key &&
            m.external_post_id === row.external_post_id,
        );
        if (idx >= 0) state.post_metrics[idx] = row;
        else state.post_metrics.push(row);
      },
    },
    namespace: "test_memory",
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const normalized = normalizeSql(sql);

      if (normalized.includes("from scheduled_posts sp") && normalized.includes("left join post_metrics")) {
        const companyId = params[0] as string;
        const limit = params[1] as number;
        const rows = state.scheduled_posts
          .filter(
            (sp) =>
              sp.company_id === companyId &&
              sp.network_key === "linkedin" &&
              (sp.status === "published" || sp.status === "failed"),
          )
          .sort((a, b) => {
            const aKey = a.published_at ?? a.created_at;
            const bKey = b.published_at ?? b.created_at;
            return bKey.localeCompare(aKey);
          })
          .slice(0, limit);

        return rows.map((sp) => {
          const pm = state.post_metrics.find(
            (m) =>
              m.company_id === sp.company_id &&
              m.network_key === sp.network_key &&
              m.external_post_id === sp.external_post_id &&
              sp.external_post_id,
          );
          return {
            id: sp.id,
            body: sp.body,
            status: sp.status,
            published_at: sp.published_at,
            external_post_id: sp.external_post_id,
            created_at: sp.created_at,
            created_by_agent_id: sp.created_by_agent_id,
            created_by_run_id: sp.created_by_run_id,
            likes: pm?.likes ?? null,
            comments: pm?.comments ?? null,
            shares: pm?.shares ?? null,
            impressions: pm?.impressions ?? null,
            fetched_at: pm?.fetched_at ?? null,
          };
        }) as T[];
      }

      if (normalized.includes("from scheduled_posts") && normalized.includes("status = 'pending'")) {
        const nowIso = params[0] as string;
        return state.scheduled_posts
          .filter((row) => row.status === "pending" && row.scheduled_at <= nowIso)
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
          .slice(0, 25) as T[];
      }

      if (normalized.includes("from scheduled_posts where id = $1")) {
        if (normalized.includes("company_id = $2")) {
          const [id, companyId] = params as [string, string];
          const row = state.scheduled_posts.find((r) => r.id === id && r.company_id === companyId);
          return row ? [row] as T[] : [];
        }
        const [id] = params as [string];
        const row = state.scheduled_posts.find((r) => r.id === id);
        if (row) {
          if (normalized.includes("select status, external_post_id")) {
            return [{ status: row.status, external_post_id: row.external_post_id }] as T[];
          }
          if (normalized.includes("select status, error_message")) {
            return [{ status: row.status, error_message: row.error_message }] as T[];
          }
        }
        return row ? [row] as T[] : [];
      }

      if (
        normalized.includes("select external_post_id from scheduled_posts") &&
        normalized.includes("status = 'published'")
      ) {
        const companyId = params[0] as string;
        return state.scheduled_posts
          .filter(
            (row) =>
              row.company_id === companyId &&
              row.network_key === "linkedin" &&
              row.status === "published" &&
              row.external_post_id &&
              row.external_post_id.trim() !== "",
          )
          .map((row) => ({ external_post_id: row.external_post_id })) as T[];
      }

      if (normalized.includes("select metadata_json, status from network_accounts")) {
        const [companyId, networkKey] = params as [string, string];
        const row = state.network_accounts.find(
          (r) => r.company_id === companyId && r.network_key === networkKey,
        );
        return row ? [{ metadata_json: row.metadata_json, status: row.status }] as T[] : [];
      }

      if (normalized.includes("from scheduled_posts where company_id = $1 and network_key = $2")) {
        const [companyId, networkKey, ...rest] = params as [string, string, ...unknown[]];
        let rows = state.scheduled_posts.filter(
          (r) => r.company_id === companyId && r.network_key === networkKey,
        );
        if (normalized.includes("and status = $3")) {
          const status = rest[0] as string;
          rows = rows.filter((r) => r.status === status);
        }
        rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        const limit = typeof rest[rest.length - 1] === "number" ? (rest[rest.length - 1] as number) : 50;
        return rows.slice(0, limit) as T[];
      }

      if (normalized.includes("from network_accounts")) {
        const companyId = params[0] as string;
        const networkKey = (params[1] as string) ?? "linkedin";
        const row = state.network_accounts.find(
          (r) => r.company_id === companyId && r.network_key === networkKey,
        );
        return row ? [row] as T[] : [];
      }

      if (normalized.includes("select network_key, status from network_accounts")) {
        const companyId = params[0] as string;
        return state.network_accounts
          .filter((r) => r.company_id === companyId)
          .map((r) => ({ network_key: r.network_key, status: r.status })) as T[];
      }

      if (normalized.includes("select company_id") && normalized.includes("status = 'connected'")) {
        return state.network_accounts
          .filter((r) => r.network_key === "linkedin" && r.status === "connected")
          .map((r) => ({ company_id: r.company_id })) as T[];
      }

      return [];
    },

    async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
      const normalized = normalizeSql(sql);

      if (normalized.startsWith("insert into scheduled_posts")) {
        const [
          id,
          companyId,
          networkKey,
          body,
          mediaJson,
          scheduledAt,
          statusOrAgentId,
          publishedAtOrRunId,
          externalPostId,
        ] = params as [
          string,
          string,
          string,
          string,
          string | null,
          string,
          string?,
          string | null?,
          string?,
        ];

        const hasAuditColumns =
          normalized.includes("created_by_agent_id") && params.length >= 8;
        const status = hasAuditColumns ? "pending" : (statusOrAgentId ?? "pending");
        const createdByAgentId = hasAuditColumns ? (statusOrAgentId ?? null) : null;
        const createdByRunId = hasAuditColumns ? (publishedAtOrRunId ?? null) : null;
        const publishedAt = hasAuditColumns ? null : (publishedAtOrRunId ?? null);
        const externalPostIdValue = hasAuditColumns ? null : (externalPostId ?? null);

        const now = new Date().toISOString();
        state.scheduled_posts.push({
          id: id ?? randomUUID(),
          company_id: companyId,
          network_key: networkKey,
          body,
          media_json: mediaJson ?? null,
          scheduled_at: scheduledAt,
          status,
          published_at: publishedAt,
          external_post_id: externalPostIdValue,
          error_message: null,
          created_by_agent_id: createdByAgentId,
          created_by_run_id: createdByRunId,
          created_at: now,
          updated_at: now,
        });
        return { rowCount: 1 };
      }

      if (normalized.startsWith("insert into network_accounts")) {
        let id: string;
        let companyId: string;
        let networkKey: string;
        let displayName: string | null = null;
        let status: string;
        let connectedAt: string | null = null;
        let metadataJson: string | null = null;

        if (params.length === 4) {
          [id, companyId, networkKey] = params as [string, string, string];
          status = "disconnected";
        } else if (params.length === 5) {
          [id, companyId, networkKey, metadataJson] = params as [
            string,
            string,
            string,
            string | null,
          ];
          status = "error";
        } else {
          [id, companyId, networkKey, displayName, connectedAt, metadataJson] = params as [
            string,
            string,
            string,
            string | null,
            string,
            string | null,
          ];
          status = "connected";
        }
        const existing = state.network_accounts.findIndex(
          (r) => r.company_id === companyId && r.network_key === networkKey,
        );
        const now = new Date().toISOString();
        const row: NetworkAccountRow = {
          id,
          company_id: companyId,
          network_key: networkKey,
          display_name: displayName,
          status,
          connected_at: connectedAt,
          metadata_json: metadataJson,
          created_at: now,
          updated_at: now,
        };
        if (existing >= 0) {
          state.network_accounts[existing] = { ...state.network_accounts[existing], ...row };
        } else {
          state.network_accounts.push(row);
        }
        return { rowCount: 1 };
      }

      if (normalized.startsWith("insert into post_metrics")) {
        const [
          id,
          companyId,
          networkKey,
          externalPostId,
          likes,
          comments,
          shares,
          impressions,
          ,
          rawJson,
        ] = params as [
          string,
          string,
          string,
          string,
          number,
          number,
          number,
          number | null,
          string,
          string,
        ];
        const existing = state.post_metrics.findIndex(
          (m) =>
            m.company_id === companyId &&
            m.network_key === networkKey &&
            m.external_post_id === externalPostId,
        );
        const row: PostMetricRow = {
          id,
          company_id: companyId,
          network_key: networkKey,
          external_post_id: externalPostId,
          likes,
          comments,
          shares,
          impressions,
          fetched_at: new Date().toISOString(),
          raw_json: rawJson,
        };
        if (existing >= 0) {
          state.post_metrics[existing] = row;
        } else {
          state.post_metrics.push(row);
        }
        return { rowCount: 1 };
      }

      if (normalized.startsWith("update scheduled_posts") && normalized.includes("status = 'published'")) {
        const [publishedAt, externalPostId, postId] = params as [string, string, string];
        const row = state.scheduled_posts.find((r) => r.id === postId);
        if (row) {
          row.status = "published";
          row.published_at = publishedAt;
          row.external_post_id = externalPostId;
          row.error_message = null;
          row.updated_at = new Date().toISOString();
        }
        return { rowCount: row ? 1 : 0 };
      }

      if (normalized.startsWith("update scheduled_posts") && normalized.includes("status = 'failed'")) {
        const [errorMessage, postId] = params as [string, string];
        const row = state.scheduled_posts.find((r) => r.id === postId);
        if (row) {
          row.status = "failed";
          row.error_message = errorMessage;
          row.updated_at = new Date().toISOString();
        }
        return { rowCount: row ? 1 : 0 };
      }

      if (normalized.startsWith("delete from scheduled_posts")) {
        const [postId, companyId] = params as [string, string];
        const before = state.scheduled_posts.length;
        state.scheduled_posts = state.scheduled_posts.filter(
          (r) => !(r.id === postId && r.company_id === companyId && r.status === "pending"),
        );
        return { rowCount: before - state.scheduled_posts.length };
      }

      return { rowCount: 0 };
    },
  };

  return db;
}
