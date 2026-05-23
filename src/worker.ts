import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginContext,
  ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  MANAGED_SKILL_KEY,
  META_MANAGED_SKILL_KEY,
  META_TOOL_NAMES,
  TOOL_NAMES,
  X_MANAGED_SKILL_KEY,
  X_TOOL_NAMES,
} from "./agent-capabilities.js";
import { NETWORKS } from "./constants.js";
import { listLinkedInPostHistory } from "./db/post-history.js";
import { runPublishScheduledJob } from "./jobs/publish-scheduled.js";
import {
  disconnectAccount,
  getNetworkStatus,
  markAccountError,
  saveConnectedAccount,
} from "./linkedin/accounts.js";
import { getLinkedInCredentials } from "./linkedin/config.js";
import { publishLinkedInPostNow } from "./linkedin/publish-now.js";
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
  countPendingScheduledPosts,
  createScheduledPost,
  deletePendingScheduledPost,
  getScheduledPost,
  listPendingScheduledPostsForCompany,
  listScheduledPosts,
  type PluginDb,
} from "./scheduled-posts/store.js";
import { auditFromBoard, auditFromRunCtx } from "./scheduled-posts/audit.js";
import { validatePublishNowInput, validateSchedulePostInput } from "./scheduled-posts/validation.js";
import {
  disconnectAccount as disconnectXAccount,
  getNetworkStatus as getXNetworkStatus,
  markAccountError as markXAccountError,
  saveConnectedAccount as saveXConnectedAccount,
} from "./x/accounts.js";
import { getXCredentials } from "./x/config.js";
import {
  disconnectAccount as disconnectMetaAccount,
  getNetworkStatus as getMetaNetworkStatus,
  markAccountError as markMetaAccountError,
  saveConnectedAccount as saveMetaConnectedAccount,
} from "./meta/accounts.js";
import { getMetaCredentials } from "./meta/config.js";
import {
  buildAuthorizeUrl as buildMetaAuthorizeUrl,
  buildRedirectUri as buildMetaRedirectUri,
  completeMetaOAuth,
  createOAuthState as createMetaOAuthState,
  verifyOAuthState as verifyMetaOAuthState,
} from "./meta/oauth.js";
import {
  buildAuthorizeUrl as buildXAuthorizeUrl,
  buildRedirectUri as buildXRedirectUri,
  codeChallengeFromVerifier,
  createOAuthState as createXOAuthState,
  exchangeCodeForTokens as exchangeXCodeForTokens,
  fetchXProfile,
  verifyOAuthState as verifyXOAuthState,
} from "./x/oauth.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} e obrigatorio.`);
  }
  return value.trim();
}

async function reconcileManagedAgentSkills(ctx: PluginContext): Promise<void> {
  try {
    const companies = await ctx.companies.list({ limit: 200, offset: 0 });
    for (const company of companies) {
      await ctx.skills.managed.reconcile(MANAGED_SKILL_KEY, company.id);
      await ctx.skills.managed.reconcile(X_MANAGED_SKILL_KEY, company.id);
      await ctx.skills.managed.reconcile(META_MANAGED_SKILL_KEY, company.id);
    }
    ctx.logger.info("managed agent skills reconciled", { companies: companies.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.warn("managed agent skill reconcile skipped", { error: message });
  }
}

function registerAgentTools(ctx: PluginContext) {
  ctx.tools.register(
    TOOL_NAMES.networkStatus,
    {
      displayName: "LinkedIn network status",
      description: "LinkedIn connection status for the run company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const status = await getNetworkStatus(ctx, runCtx.companyId, "linkedin");
      return {
        content: `LinkedIn status: ${status.status}`,
        data: status,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.schedulePost,
    {
      displayName: "Schedule LinkedIn post",
      description: "Schedule a LinkedIn post for a future time.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string" },
          scheduledAt: { type: "string" },
        },
        required: ["body", "scheduledAt"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { body?: string; scheduledAt?: string };
      const validated = validateSchedulePostInput({
        body: payload.body ?? "",
        scheduledAt: payload.scheduledAt ?? "",
      });
      if (!validated.ok) {
        return { error: validated.error };
      }

      const status = await getNetworkStatus(ctx, runCtx.companyId, "linkedin");
      if (status.status !== "connected") {
        return {
          error: "linkedin_not_connected",
          content: "Conecte a conta LinkedIn antes de agendar.",
          data: status,
        };
      }

      const post = await createScheduledPost(ctx.db, {
        companyId: runCtx.companyId,
        networkKey: "linkedin",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
        ...auditFromRunCtx(runCtx),
      });
      return {
        content: `Agendado post ${post.id} para ${post.scheduledAt}`,
        data: { post },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.publishNow,
    {
      displayName: "Publish LinkedIn post now",
      description: "Publish a LinkedIn post immediately (no scheduling).",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string" },
        },
        required: ["body"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { body?: string };
      const validated = validatePublishNowInput({ body: payload.body ?? "" });
      if (!validated.ok) {
        return { error: validated.error };
      }

      const status = await getNetworkStatus(ctx, runCtx.companyId, "linkedin");
      if (status.status !== "connected") {
        return {
          error: "linkedin_not_connected",
          content: "Conecte a conta LinkedIn antes de publicar.",
          data: status,
        };
      }

      const result = await publishLinkedInPostNow({
        db: ctx.db,
        httpFetch: (url, init) => ctx.http.fetch(url, init),
        companyId: runCtx.companyId,
        body: validated.body,
        ...auditFromRunCtx(runCtx),
      });

      if (!result.ok) {
        return {
          error: result.error,
          content: `Falha ao publicar: ${result.error}`,
        };
      }

      return {
        content: `Publicado no LinkedIn (post ${result.postId}, id externo ${result.externalPostId})`,
        data: {
          postId: result.postId,
          externalPostId: result.externalPostId,
          publishedAt: result.publishedAt,
        },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.listScheduled,
    {
      displayName: "List LinkedIn scheduled posts",
      description: "List scheduled LinkedIn posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const posts = await listScheduledPosts(ctx.db, runCtx.companyId, "linkedin", {
        limit: 50,
      });
      return {
        content: `${posts.length} post(s) na fila`,
        data: { posts },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.cancelScheduled,
    {
      displayName: "Cancel LinkedIn scheduled post",
      description: "Cancel a pending scheduled LinkedIn post.",
      parametersSchema: {
        type: "object",
        properties: { postId: { type: "string" } },
        required: ["postId"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const postId = typeof (params as { postId?: string }).postId === "string"
        ? (params as { postId: string }).postId.trim()
        : "";
      if (!postId) {
        return { error: "postId_required" };
      }

      const deleted = await deletePendingScheduledPost(ctx.db, runCtx.companyId, postId);
      if (!deleted) {
        return { error: "not_found_or_not_pending" };
      }
      return { content: `Post ${postId} cancelado`, data: { ok: true, postId } };
    },
  );
}

function registerXAgentTools(ctx: PluginContext) {
  ctx.tools.register(
    X_TOOL_NAMES.networkStatus,
    {
      displayName: "X network status",
      description: "X (Twitter) connection status for the run company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const status = await getXNetworkStatus(ctx, runCtx.companyId, "x");
      return {
        content: `X status: ${status.status}`,
        data: status,
      };
    },
  );

  ctx.tools.register(
    X_TOOL_NAMES.schedulePost,
    {
      displayName: "Schedule X post",
      description: "Schedule an X post for a future time.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string" },
          scheduledAt: { type: "string" },
        },
        required: ["body", "scheduledAt"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { body?: string; scheduledAt?: string };
      const validated = validateSchedulePostInput({
        body: payload.body ?? "",
        scheduledAt: payload.scheduledAt ?? "",
      });
      if (!validated.ok) {
        return { error: validated.error };
      }

      const status = await getXNetworkStatus(ctx, runCtx.companyId, "x");
      if (status.status !== "connected") {
        return {
          error: "x_not_connected",
          content: "Conecte a conta X antes de agendar.",
          data: status,
        };
      }

      const post = await createScheduledPost(ctx.db, {
        companyId: runCtx.companyId,
        networkKey: "x",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
        ...auditFromRunCtx(runCtx),
      });
      return {
        content: `Agendado post ${post.id} para ${post.scheduledAt}`,
        data: { post },
      };
    },
  );

  ctx.tools.register(
    X_TOOL_NAMES.listScheduled,
    {
      displayName: "List X scheduled posts",
      description: "List scheduled X posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const posts = await listScheduledPosts(ctx.db, runCtx.companyId, "x", { limit: 50 });
      return {
        content: `${posts.length} post(s) na fila`,
        data: { posts },
      };
    },
  );

  ctx.tools.register(
    X_TOOL_NAMES.cancelScheduled,
    {
      displayName: "Cancel X scheduled post",
      description: "Cancel a pending scheduled X post.",
      parametersSchema: {
        type: "object",
        properties: { postId: { type: "string" } },
        required: ["postId"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const postId = typeof (params as { postId?: string }).postId === "string"
        ? (params as { postId: string }).postId.trim()
        : "";
      if (!postId) {
        return { error: "postId_required" };
      }

      const deleted = await deletePendingScheduledPost(ctx.db, runCtx.companyId, postId);
      if (!deleted) {
        return { error: "not_found_or_not_pending" };
      }
      return { content: `Post ${postId} cancelado`, data: { ok: true, postId } };
    },
  );
}

function registerMetaAgentTools(ctx: PluginContext) {
  ctx.tools.register(
    META_TOOL_NAMES.networkStatus,
    {
      displayName: "Meta network status",
      description: "Meta (Facebook Page + IG Business) connection status for the run company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const status = await getMetaNetworkStatus(ctx, runCtx.companyId, "meta");
      return {
        content: `Meta status: ${status.status}`,
        data: status,
      };
    },
  );

  ctx.tools.register(
    META_TOOL_NAMES.schedulePost,
    {
      displayName: "Schedule Meta post",
      description: "Schedule a Facebook Page feed post for a future time.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string" },
          scheduledAt: { type: "string" },
        },
        required: ["body", "scheduledAt"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { body?: string; scheduledAt?: string };
      const validated = validateSchedulePostInput({
        body: payload.body ?? "",
        scheduledAt: payload.scheduledAt ?? "",
      });
      if (!validated.ok) {
        return { error: validated.error };
      }

      const status = await getMetaNetworkStatus(ctx, runCtx.companyId, "meta");
      if (status.status !== "connected") {
        return {
          error: "meta_not_connected",
          content: "Conecte a conta Meta antes de agendar.",
          data: status,
        };
      }

      const post = await createScheduledPost(ctx.db, {
        companyId: runCtx.companyId,
        networkKey: "meta",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
        ...auditFromRunCtx(runCtx),
      });
      return {
        content: `Agendado post ${post.id} para ${post.scheduledAt}`,
        data: { post },
      };
    },
  );

  ctx.tools.register(
    META_TOOL_NAMES.listScheduled,
    {
      displayName: "List Meta scheduled posts",
      description: "List scheduled Meta posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const posts = await listScheduledPosts(ctx.db, runCtx.companyId, "meta", { limit: 50 });
      return {
        content: `${posts.length} post(s) na fila`,
        data: { posts },
      };
    },
  );

  ctx.tools.register(
    META_TOOL_NAMES.cancelScheduled,
    {
      displayName: "Cancel Meta scheduled post",
      description: "Cancel a pending scheduled Meta post.",
      parametersSchema: {
        type: "object",
        properties: { postId: { type: "string" } },
        required: ["postId"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const postId = typeof (params as { postId?: string }).postId === "string"
        ? (params as { postId: string }).postId.trim()
        : "";
      if (!postId) {
        return { error: "postId_required" };
      }

      const deleted = await deletePendingScheduledPost(ctx.db, runCtx.companyId, postId);
      if (!deleted) {
        return { error: "not_found_or_not_pending" };
      }
      return { content: `Post ${postId} cancelado`, data: { ok: true, postId } };
    },
  );
}

function registerMetaActions(ctx: PluginContext) {
  ctx.actions.register("meta-start-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    const credentials = await getMetaCredentials(ctx);
    const redirectUri = buildMetaRedirectUri(publicOrigin, companyPrefix);
    const state = createMetaOAuthState(companyId, credentials.appSecret);
    const authorizeUrl = buildMetaAuthorizeUrl({ credentials, redirectUri, state });

    return { authorizeUrl, state, redirectUri };
  });

  ctx.actions.register("meta-complete-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const code = requireString(input.code, "code");
    const state = requireString(input.state, "state");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    try {
      const credentials = await getMetaCredentials(ctx);
      const statePayload = verifyMetaOAuthState(state, credentials.appSecret);
      if (statePayload.companyId !== companyId) {
        throw new Error("State OAuth nao corresponde a empresa atual.");
      }

      const redirectUri = buildMetaRedirectUri(publicOrigin, companyPrefix);
      const tokens = await completeMetaOAuth(ctx.http, {
        credentials,
        code,
        redirectUri,
      });

      const status = await saveMetaConnectedAccount(ctx, {
        companyId,
        tokens,
      });

      return { ok: true as const, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = await markMetaAccountError(ctx, companyId, message);
      return { ok: false as const, error: message, status };
    }
  });

  ctx.actions.register("meta-disconnect", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const status = await disconnectMetaAccount(ctx, companyId);
    return { status };
  });
}

function registerXActions(ctx: PluginContext) {
  ctx.actions.register("x-start-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    const credentials = await getXCredentials(ctx);
    const redirectUri = buildXRedirectUri(publicOrigin, companyPrefix);
    const { state, codeVerifier } = createXOAuthState(companyId, credentials.clientSecret);
    const codeChallenge = codeChallengeFromVerifier(codeVerifier);
    const authorizeUrl = buildXAuthorizeUrl({
      credentials,
      redirectUri,
      state,
      codeChallenge,
    });

    return { authorizeUrl, state, redirectUri };
  });

  ctx.actions.register("x-complete-oauth", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const code = requireString(input.code, "code");
    const state = requireString(input.state, "state");
    const publicOrigin = requireString(input.publicOrigin, "publicOrigin");
    const companyPrefix = requireString(input.companyPrefix ?? "CUS", "companyPrefix");

    try {
      const credentials = await getXCredentials(ctx);
      const statePayload = verifyXOAuthState(state, credentials.clientSecret);
      if (statePayload.companyId !== companyId) {
        throw new Error("State OAuth nao corresponde a empresa atual.");
      }

      const redirectUri = buildXRedirectUri(publicOrigin, companyPrefix);
      const tokens = await exchangeXCodeForTokens(ctx.http, {
        credentials,
        code,
        redirectUri,
        codeVerifier: statePayload.codeVerifier,
      });

      const profile = await fetchXProfile(ctx.http, tokens.accessToken);
      tokens.userId = profile.userId;

      const status = await saveXConnectedAccount(ctx, {
        companyId,
        displayName: profile.displayName,
        tokens,
      });

      return { ok: true as const, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = await markXAccountError(ctx, companyId, message);
      return { ok: false as const, error: message, status };
    }
  });

  ctx.actions.register("x-disconnect", async (input) => {
    const companyId = requireString(input.companyId, "companyId");
    const status = await disconnectXAccount(ctx, companyId);
    return { status };
  });
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
    ...auditFromBoard(),
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
    registerXActions(ctx);
    registerMetaActions(ctx);
    registerAgentTools(ctx);
    registerXAgentTools(ctx);
    registerMetaAgentTools(ctx);
    await reconcileManagedAgentSkills(ctx);

    ctx.actions.register("setup-company-capabilities", async (input) => {
      const companyId = requireString(input.companyId, "companyId");
      const skill = await ctx.skills.managed.reconcile(MANAGED_SKILL_KEY, companyId);
      return {
        skillKey: skill.resourceKey,
        skillId: skill.skillId,
        status: skill.status,
        canonicalKey: `plugin/gauderp-social-networking/linkedin-agent`,
      };
    });

    const enabledNetworkKeys = () =>
      NETWORKS.filter((network) => network.enabled).map((network) => network.key);

    const metricsSyncStateKey = (networkKey: string) =>
      networkKey === "linkedin" ? "linkedin-metrics-last-sync" : `${networkKey}-metrics-last-sync`;

    ctx.data.register("overview", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { networks: [], totalPending: 0 };
      }

      const networks = await Promise.all(
        NETWORKS.filter((network) => network.enabled).map(async (network) => {
          const status = await getNetworkStatus(ctx, companyId, network.key);
          const syncState = await ctx.state.get({
            scopeKind: "company",
            scopeId: companyId,
            stateKey: metricsSyncStateKey(network.key),
          });
          const pendingCount = await countPendingScheduledPosts(ctx.db, companyId, network.key);
          return {
            networkKey: status.networkKey,
            status: status.status,
            displayName: status.displayName,
            lastMetricsSync: typeof syncState === "string" ? syncState : null,
            pendingCount,
          };
        }),
      );

      return {
        networks,
        totalPending: networks.reduce((sum, network) => sum + network.pendingCount, 0),
      };
    });

    ctx.data.register("scheduled-posts", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [] };
      }

      const posts = await listPendingScheduledPostsForCompany(
        ctx.db,
        companyId,
        enabledNetworkKeys(),
        { limit: 100 },
      );
      return {
        posts: posts.map((post) => ({
          id: post.id,
          networkKey: post.networkKey,
          body: post.body,
          scheduledAt: post.scheduledAt,
          status: post.status,
          createdByAgentId: post.createdByAgentId,
          createdByRunId: post.createdByRunId,
        })),
      };
    });

    ctx.data.register("linkedin-scheduled-posts", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [] };
      }
      const posts = await listScheduledPosts(ctx.db, companyId, "linkedin", { limit: 50 });
      return { posts };
    });

    ctx.data.register("x-scheduled-posts", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [] };
      }
      const posts = await listScheduledPosts(ctx.db, companyId, "x", { limit: 50 });
      return { posts };
    });

    ctx.data.register("meta-scheduled-posts", async ({ companyId }) => {
      if (typeof companyId !== "string" || !companyId) {
        return { posts: [] };
      }
      const posts = await listScheduledPosts(ctx.db, companyId, "meta", { limit: 50 });
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

    ctx.actions.register("schedule-meta-post", async (params) => {
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
        networkKey: "meta",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
        ...auditFromBoard(),
      });
      return { post };
    });

    ctx.actions.register("schedule-x-post", async (params) => {
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
        networkKey: "x",
        body: validated.body,
        scheduledAt: validated.scheduledAt,
        ...auditFromBoard(),
      });
      return { post };
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
        ...auditFromBoard(),
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
