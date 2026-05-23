import { describe, expect, it, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import type { NetworkStatus } from "../src/linkedin/types.js";
import { META_GRAPH_BASE } from "../src/meta/oauth.js";
import {
  buildRedirectUri,
  createOAuthState,
  selectPrimaryPage,
  verifyOAuthState,
} from "../src/meta/oauth.js";

type AccountRow = {
  id: string;
  company_id: string;
  network_key: string;
  display_name: string | null;
  status: string;
  connected_at: string | null;
  metadata_json: string | null;
  updated_at: string;
};

function installMemoryDb(harness: TestHarness) {
  const accounts = new Map<string, AccountRow>();

  harness.ctx.db.query = (async (sql, params) => {
    harness.dbQueries.push({ sql, params });
    if (sql.includes("network_accounts")) {
      const companyId = params?.[0] as string;
      const networkKey = params?.[1] as string | undefined;
      const rows = [...accounts.values()].filter((row) => {
        if (row.company_id !== companyId) return false;
        if (networkKey && row.network_key !== networkKey) return false;
        return true;
      });
      return rows.map((row) => ({
        status: row.status,
        display_name: row.display_name,
        connected_at: row.connected_at,
        metadata_json: row.metadata_json,
      }));
    }
    return [];
  }) as typeof harness.ctx.db.query;

  harness.ctx.db.execute = async (sql, params) => {
    harness.dbExecutes.push({ sql, params });
    if (!sql.includes("network_accounts") || !params?.length) {
      return { rowCount: 0 };
    }

    const p = params as unknown[];
    const companyId = p[1] as string;
    const networkKey = p[2] as string;
    const key = `${companyId}:${networkKey}`;
    const updatedAt = (p[p.length - 1] as string) ?? new Date().toISOString();

    if (sql.includes("'connected'")) {
      accounts.set(key, {
        id: p[0] as string,
        company_id: companyId,
        network_key: networkKey,
        display_name: (p[3] as string | null) ?? null,
        status: "connected",
        connected_at: (p[4] as string | null) ?? updatedAt,
        metadata_json: (p[5] as string | null) ?? null,
        updated_at: updatedAt,
      });
    } else if (sql.includes("'disconnected'")) {
      accounts.set(key, {
        id: p[0] as string,
        company_id: companyId,
        network_key: networkKey,
        display_name: null,
        status: "disconnected",
        connected_at: null,
        metadata_json: null,
        updated_at: updatedAt,
      });
    } else if (sql.includes("'error'")) {
      accounts.set(key, {
        id: p[0] as string,
        company_id: companyId,
        network_key: networkKey,
        display_name: null,
        status: "error",
        connected_at: null,
        metadata_json: (p[3] as string | null) ?? null,
        updated_at: updatedAt,
      });
    }

    return { rowCount: 1 };
  };

  return accounts;
}

describe("Meta OAuth", () => {
  const companyId = "co-test-meta";
  const companyPrefix = "CUS";
  const publicOrigin = "http://127.0.0.1:3100";
  const credentials = { appId: "meta-app-id", appSecret: "meta-app-secret" };

  it("builds redirect URI and signed OAuth state", () => {
    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    expect(redirectUri).toBe("http://127.0.0.1:3100/CUS/social-meta");

    const state = createOAuthState(companyId, credentials.appSecret);
    const payload = verifyOAuthState(state, credentials.appSecret);
    expect(payload.companyId).toBe(companyId);
  });

  it("selectPrimaryPage prefers page with Instagram Business account", () => {
    const selected = selectPrimaryPage([
      {
        pageId: "page-1",
        pageName: "Page One",
        pageAccessToken: "tok-1",
        igBusinessAccountId: null,
        igUsername: null,
      },
      {
        pageId: "page-2",
        pageName: "Page Two",
        pageAccessToken: "tok-2",
        igBusinessAccountId: "ig-123",
        igUsername: "brand_pt",
      },
    ]);
    expect(selected?.pageId).toBe("page-2");
  });

  it("starts OAuth with Facebook authorize URL when secret refs are configured", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        metaAppIdSecretRef: "META_APP_ID",
        metaAppSecretSecretRef: "META_APP_SECRET",
      },
    });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "META_APP_ID") return credentials.appId;
      if (ref === "META_APP_SECRET") return credentials.appSecret;
      return "";
    };

    const result = (await harness.performAction("meta-start-oauth", {
      companyId,
      publicOrigin,
      companyPrefix,
    })) as { authorizeUrl: string; state: string; redirectUri: string };

    expect(result.redirectUri).toBe(buildRedirectUri(publicOrigin, companyPrefix));
    expect(result.authorizeUrl).toContain("facebook.com");
    expect(result.authorizeUrl).toContain(encodeURIComponent(credentials.appId));
    expect(verifyOAuthState(result.state, credentials.appSecret).companyId).toBe(companyId);
  });

  it("completes OAuth happy path and persists page + IG metadata", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        metaAppIdSecretRef: "META_APP_ID",
        metaAppSecretSecretRef: "META_APP_SECRET",
      },
    });
    const accounts = installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "META_APP_ID") return credentials.appId;
      if (ref === "META_APP_SECRET") return credentials.appSecret;
      return "";
    };

    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    const state = createOAuthState(companyId, credentials.appSecret);

    harness.ctx.http.fetch = vi.fn(async (url) => {
      const href = String(url);
      if (href.startsWith(`${META_GRAPH_BASE}/oauth/access_token`) && href.includes("fb_exchange_token")) {
        return new Response(
          JSON.stringify({ access_token: "long-user-token", expires_in: 5184000 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (href.startsWith(`${META_GRAPH_BASE}/oauth/access_token`)) {
        return new Response(
          JSON.stringify({ access_token: "short-user-token", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (href.startsWith(`${META_GRAPH_BASE}/me/accounts`)) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "page-999",
                name: "Gaud PT",
                access_token: "page-access-token",
                instagram_business_account: { id: "ig-456", username: "gaud_pt" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("meta-complete-oauth", {
      companyId,
      code: "auth-code-meta",
      state,
      publicOrigin,
      companyPrefix,
    })) as { ok: boolean; status: NetworkStatus };

    expect(result.ok).toBe(true);
    expect(result.status.status).toBe("connected");
    expect(result.status.displayName).toBe("Gaud PT / @gaud_pt");

    const stored = accounts.get(`${companyId}:meta`);
    expect(stored?.status).toBe("connected");
    const metadata = JSON.parse(stored?.metadata_json ?? "{}") as {
      userAccessToken: string;
      pageId: string;
      pageAccessToken: string;
      igBusinessAccountId: string;
      igUsername: string;
    };
    expect(metadata.userAccessToken).toBe("long-user-token");
    expect(metadata.pageId).toBe("page-999");
    expect(metadata.pageAccessToken).toBe("page-access-token");
    expect(metadata.igBusinessAccountId).toBe("ig-456");
    expect(metadata.igUsername).toBe("gaud_pt");
  });

  it("marks account as error when no Facebook pages are returned", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        metaAppIdSecretRef: "META_APP_ID",
        metaAppSecretSecretRef: "META_APP_SECRET",
      },
    });
    installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "META_APP_ID") return credentials.appId;
      if (ref === "META_APP_SECRET") return credentials.appSecret;
      return "";
    };

    const state = createOAuthState(companyId, credentials.appSecret);
    harness.ctx.http.fetch = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("fb_exchange_token")) {
        return new Response(JSON.stringify({ access_token: "long-token" }), { status: 200 });
      }
      if (href.includes("/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "short-token" }), { status: 200 });
      }
      if (href.includes("/me/accounts")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("meta-complete-oauth", {
      companyId,
      code: "code",
      state,
      publicOrigin,
      companyPrefix,
    })) as { ok: boolean; error: string; status: NetworkStatus };

    expect(result.ok).toBe(false);
    expect(result.status.status).toBe("error");
    expect(result.error).toContain("Nenhuma pagina Facebook");
  });

  it("disconnect clears connected status", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        metaAppIdSecretRef: "META_APP_ID",
        metaAppSecretSecretRef: "META_APP_SECRET",
      },
    });
    const accounts = installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    accounts.set(`${companyId}:meta`, {
      id: `${companyId}:meta`,
      company_id: companyId,
      network_key: "meta",
      display_name: "Gaud PT",
      status: "connected",
      connected_at: new Date().toISOString(),
      metadata_json: JSON.stringify({ pageAccessToken: "token" }),
      updated_at: new Date().toISOString(),
    });

    const result = (await harness.performAction("meta-disconnect", {
      companyId,
    })) as { status: NetworkStatus };

    expect(result.status.status).toBe("disconnected");
    expect(accounts.get(`${companyId}:meta`)?.status).toBe("disconnected");
  });
});
