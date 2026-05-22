import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginApiRequestInput, PluginApiResponse, PluginContext } from "@paperclipai/plugin-sdk";
import { listLinkedInPostHistory } from "./db/post-history.js";
import { runPublishScheduledJob } from "./jobs/publish-scheduled.js";
import {
  disconnectAccount,
  getNetworkStatus,
  markAccountError,
  saveConnectedAccount,
} from "./linkedin/accounts.js";
import { getLinkedInCredentials } from "./linkedin/config.js";
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  createOAuthState,
  exchangeCodeForTokens,
  fetchLinkedInProfile,
  verifyOAuthState,
} from "./linkedin/oauth.js";
import {
  syncAllConnectedLinkedInAccounts,
  syncLinkedInMetricsForCompany,
} from "./linkedin/sync.js";
import type { NetworkStatus } from "./linkedin/types.js";
import {
  createScheduledPost,
  deletePendingScheduledPost,
  getScheduledPost,
  listScheduledPosts,
  type PluginDb,
} from "./scheduled-posts/store.js";
import { validateSchedulePostInput } from "./scheduled-posts/validation.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} e obrigatorio.`);
  }
  return value.trim();
}

function registerLinkedInActions(ctx: PluginContext) {
  ctx.actions.register("linkedin-start-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    const credentials = await getLinkedInCredentials(ctx);
    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    const state = createOAuthState(companyId, credentials.clientSecret);
    const authorizeUrl = buildAuthorizeUrl({ credentials, redirectUri, state });

    return { authorizeUrl, state, redirectUri };
  });

  ctx.actions.register("linkedin-complete-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const code = requireString(input.code, "code");
    const state = requireString(input.state, "state");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    try {
      const credentials = await getLinkedInCredentials(ctx);
      const statePayload = verifyOAuthState(state, credentials.clientSecret);
      if (statePayload.companyId !== companyId) {
        throw new Error("State OAuth nao corresponde a empresa atual.");
      }

      const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
      const tokens = await exchangeCodeForTokens(ctx.http, {
        credentials,
        code,
        redirectUri,
      });

      const profile = await fetchLinkedInProfile(ctx.http, tokens.accessToken);
      tokens.memberId = profile.memberId;

      const status = await saveConnectedAccount(ctx, {
        companyId,
        displayName: profile.displayName,
        tokens,
      });

      return { ok: true as const, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = await markAccountError(ctx, companyId, message);
      return { ok: false as const, error: message, status };
    }
  });

  ctx.actions.register("linkedin-disconnect", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const status = await disconnectAccount(ctx, companyId);
    return { status };
  });
}

async function handleScheduledPostsList(
  db: PluginDb,
  companyId: string,
  networkKey: string,
): Promise<PluginApiResponse> {
  const posts = await listScheduledPosts(db, companyId, networkKey);
  return { status: 200, body: { posts } };
}

async function handleScheduledPostsCreate(
  db: PluginDb,
  companyId: string,
  networkKey: string,
  body: unknown,
): Promise<PluginApiResponse> {
  const payload = body as { body?: string; scheduledAt?: string } | null;
  const validated = validateSchedulePostInput({
    body: payload?.body ?? "",
    scheduledAt: payload?.scheduledAt ?? "",
  });
  if (!validated.ok) {
    return { status: 400, body: { error: validated.error } };
  }

  const post = await createScheduledPost(db, {
    companyId,
    networkKey,
    body: validated.body,
    scheduledAt: validated.scheduledAt,
  });
  return { status: 201, body: { post } };
}

async function handleScheduledPostsDelete(
  db: PluginDb,
  companyId: string,
  postId: string,
): Promise<PluginApiResponse> {
  const existing = await getScheduledPost(db, companyId, postId);
  if (!existing) {
    return { status: 404, body: { error: "not_found" } };
  }
  if (existing.status !== "pending") {
    return { status: 409, body: { error: "only_pending_can_be_deleted" } };
  }

  const deleted = await deletePendingScheduledPost(db, companyId, postId);
  if (!deleted) {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 200, body: { ok: true } };
}

let runtimeCtx: PluginContext | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    runtimeCtx = ctx;

    registerLinkedInActions(ctx);

    ctx.data.register("overview", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { networks: [] };
      }

      const status = await getNetworkStatus(ctx, companyId, "linkedin");
      return {
        networks: [{ networkKey: status.networkKey, status: status.status }],
      };
    });

    ctx.data.register("linkedin-scheduled-posts", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [] };
      }
      const posts = await listScheduledPosts(ctx.db, companyId, "linkedin", { limit: 50 });
      return { posts };
    });

    ctx.data.register("linkedin-history", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [], lastSync: null };
      }
      const posts = await listLinkedInPostHistory(ctx, companyId);
      const state = await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId,
        stateKey: "linkedin-metrics-last-sync",
      });
      return {
        posts,
        lastSync: typeof state === "string" ? state : null,
      };
    });

    ctx.actions.register("schedule-linkedin-post", async (params) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : null;
      if (!companyId) {
        throw new Error("companyId_required");
      }

      const validated = validateSchedulePostInput({
        body: typeof params?.body === "string" ? params.body : "",
        scheduledAt: typeof params?.scheduledAt === "string" ? params.scheduledAt : "",
      });
      if (!validated.ok) {
        throw new Error(validated.error);
      }

      const post = await createScheduledPost(ctx.db, {
        companyId,
        networkKey: "linkedin",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
      });
      return { post };
    });

    ctx.actions.register("sync-linkedin-metrics", async (params) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : null;
      if (!companyId) {
        throw new Error("companyId_required");
      }
      const result = await syncLinkedInMetricsForCompany(ctx, companyId);
      await ctx.state.set(
        {
          scopeKind: "company",
          scopeId: companyId,
          stateKey: "linkedin-metrics-last-sync",
        },
        new Date().toISOString(),
      );
      return result;
    });

    ctx.actions.register("cancel-scheduled-post", async (params) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : null;
      const postId = typeof params?.postId === "string" ? params.postId : null;
      if (!companyId || !postId) {
        throw new Error("companyId_and_postId_required");
      }

      const deleted = await deletePendingScheduledPost(ctx.db, companyId, postId);
      if (!deleted) {
        throw new Error("not_found_or_not_pending");
      }
      return { ok: true };
    });

    ctx.jobs.register("publish-scheduled", async () => {
      const summary = await runPublishScheduledJob({
        db: ctx.db,
        httpFetch: (url, init) => ctx.http.fetch(url, init),
        logger: ctx.logger,
      });
      ctx.logger.info("publish-scheduled concluido", summary);
    });

    ctx.jobs.register("sync-linkedin-metrics", async () => {
      await syncAllConnectedLinkedInAccounts(ctx);
    });
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    if (!runtimeCtx) {
      return { status: 503, body: { error: "worker_not_ready" } };
    }

    const ctx = runtimeCtx;

    if (input.routeKey === "network-status") {
      const companyId = input.companyId;
      const networkKey = input.params.networkKey;
      if (!companyId || !networkKey) {
        return { status: 400, body: { error: "companyId and networkKey are required" } };
      }
      const status: NetworkStatus = await getNetworkStatus(ctx, companyId, networkKey);
      return { status: 200, body: status };
    }

    if (input.routeKey === "linkedin-sync-metrics") {
      if (input.method !== "POST") {
        return { status: 405, body: { error: "method_not_allowed" } };
      }
      if (!input.companyId) {
        return { status: 400, body: { error: "companyId is required" } };
      }
      const result = await syncLinkedInMetricsForCompany(ctx, input.companyId);
      await ctx.state.set(
        {
          scopeKind: "company",
          scopeId: input.companyId,
          stateKey: "linkedin-metrics-last-sync",
        },
        new Date().toISOString(),
      );
      return { status: 200, body: result };
    }

    if (input.routeKey === "scheduled-posts-list") {
      const networkKey = input.params.networkKey;
      if (!input.companyId || !networkKey) {
        return { status: 400, body: { error: "companyId and networkKey are required" } };
      }
      return handleScheduledPostsList(ctx.db, input.companyId, networkKey);
    }

    if (input.routeKey === "scheduled-posts-create") {
      const networkKey = input.params.networkKey;
      if (!input.companyId || !networkKey) {
        return { status: 400, body: { error: "companyId and networkKey are required" } };
      }
      return handleScheduledPostsCreate(ctx.db, input.companyId, networkKey, input.body);
    }

    if (input.routeKey === "scheduled-posts-delete") {
      const postId = input.params.postId;
      if (!input.companyId || !postId) {
        return { status: 400, body: { error: "companyId and postId are required" } };
      }
      return handleScheduledPostsDelete(ctx.db, input.companyId, postId);
    }

    return { status: 404, body: { error: "not_found" } };
  },

  async onHealth() {
    return { status: "ok", message: "Social Networking plugin worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
