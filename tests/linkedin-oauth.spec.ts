import { describe, expect, it, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { buildRedirectUri, createOAuthState, verifyOAuthState } from "../src/linkedin/oauth.js";
import type { NetworkStatus } from "../src/linkedin/types.js";

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
    if (sql.includes("FROM network_accounts")) {
      const companyId = params?.[0] as string;
      const networkKey = params?.[1] as string | undefined;
      const rows = [...accounts.values()].filter((row) => {
        if (row.company_id !== companyId) return false;
        if (networkKey && row.network_key !== networkKey) return false;
        return true;
      });
      if (sql.includes("network_key, status")) {
        return rows.map((row) => ({ network_key: row.network_key, status: row.status }));
      }
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
    const existing = accounts.get(key);
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
        display_name: existing?.display_name ?? null,
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

describe("LinkedIn OAuth", () => {
  const companyId = "co-test";
  const companyPrefix = "CUS";
  const publicOrigin = "http://127.0.0.1:3100";
  const credentials = { clientId: "linkedin-client-id", clientSecret: "linkedin-client-secret" };

  it("builds redirect URI and signed OAuth state", () => {
    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    expect(redirectUri).toBe("http://127.0.0.1:3100/CUS/social-linkedin");

    const state = createOAuthState(companyId, credentials.clientSecret);
    const payload = verifyOAuthState(state, credentials.clientSecret);
    expect(payload.companyId).toBe(companyId);
  });

  it("starts OAuth with authorize URL when secret refs are configured", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        linkedinClientIdSecretRef: "LINKEDIN_CLIENT_ID",
        linkedinClientSecretSecretRef: "LINKEDIN_CLIENT_SECRET",
      },
    });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "LINKEDIN_CLIENT_ID") return credentials.clientId;
      if (ref === "LINKEDIN_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const result = (await harness.performAction("linkedin-start-oauth", {
      companyId,
      publicOrigin,
      companyPrefix,
    })) as { authorizeUrl: string; state: string; redirectUri: string };

    expect(result.redirectUri).toBe(buildRedirectUri(publicOrigin, companyPrefix));
    expect(result.authorizeUrl).toContain("linkedin.com/oauth/v2/authorization");
    expect(result.authorizeUrl).toContain(encodeURIComponent(credentials.clientId));
    expect(verifyOAuthState(result.state, credentials.clientSecret).companyId).toBe(companyId);
  });

  it("completes OAuth happy path and persists connected account", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        linkedinClientIdSecretRef: "LINKEDIN_CLIENT_ID",
        linkedinClientSecretSecretRef: "LINKEDIN_CLIENT_SECRET",
      },
    });
    const accounts = installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "LINKEDIN_CLIENT_ID") return credentials.clientId;
      if (ref === "LINKEDIN_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    const state = createOAuthState(companyId, credentials.clientSecret);

    harness.ctx.http.fetch = vi.fn(async (url, init) => {
      if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
        return new Response(
          JSON.stringify({
            access_token: "access-token-test",
            expires_in: 3600,
            refresh_token: "refresh-token-test",
            scope: "openid profile email w_member_social",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://api.linkedin.com/v2/userinfo") {
        return new Response(
          JSON.stringify({ sub: "member-123", name: "Gaud ERP" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("linkedin-complete-oauth", {
      companyId,
      code: "auth-code-xyz",
      state,
      publicOrigin,
      companyPrefix,
    })) as { ok: boolean; status: NetworkStatus };

    expect(result.ok).toBe(true);
    expect(result.status.status).toBe("connected");
    expect(result.status.displayName).toBe("Gaud ERP");

    const stored = accounts.get(`${companyId}:linkedin`);
    expect(stored?.status).toBe("connected");
    const metadata = JSON.parse(stored?.metadata_json ?? "{}") as {
      accessToken: string;
      refreshToken: string;
      memberId: string;
    };
    expect(metadata.accessToken).toBe("access-token-test");
    expect(metadata.refreshToken).toBe("refresh-token-test");
    expect(metadata.memberId).toBe("member-123");

    const apiStatus = (await plugin.definition.onApiRequest?.({
      routeKey: "network-status",
      method: "GET",
      path: "/networks/linkedin/status",
      params: { networkKey: "linkedin" },
      query: { companyId },
      body: null,
      actor: { actorType: "user", actorId: "user-1" },
      companyId,
      headers: {},
    })) as { status: number; body: NetworkStatus };

    expect(apiStatus?.status).toBe(200);
    expect(apiStatus?.body.status).toBe("connected");
    expect(apiStatus?.body.displayName).toBe("Gaud ERP");
  });

  it("marks account as error when token exchange fails", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        linkedinClientIdSecretRef: "LINKEDIN_CLIENT_ID",
        linkedinClientSecretSecretRef: "LINKEDIN_CLIENT_SECRET",
      },
    });
    installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "LINKEDIN_CLIENT_ID") return credentials.clientId;
      if (ref === "LINKEDIN_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const state = createOAuthState(companyId, credentials.clientSecret);
    harness.ctx.http.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("linkedin-complete-oauth", {
      companyId,
      code: "bad-code",
      state,
      publicOrigin,
      companyPrefix,
    })) as { ok: boolean; error: string; status: NetworkStatus };

    expect(result.ok).toBe(false);
    expect(result.status.status).toBe("error");
    expect(result.error).toContain("Falha ao trocar code");
  });

  it("disconnect clears connected status", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        linkedinClientIdSecretRef: "LINKEDIN_CLIENT_ID",
        linkedinClientSecretSecretRef: "LINKEDIN_CLIENT_SECRET",
      },
    });
    const accounts = installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    accounts.set(`${companyId}:linkedin`, {
      id: `${companyId}:linkedin`,
      company_id: companyId,
      network_key: "linkedin",
      display_name: "Gaud ERP",
      status: "connected",
      connected_at: new Date().toISOString(),
      metadata_json: JSON.stringify({ accessToken: "token" }),
      updated_at: new Date().toISOString(),
    });

    const result = (await harness.performAction("linkedin-disconnect", {
      companyId,
    })) as { status: NetworkStatus };

    expect(result.status.status).toBe("disconnected");
    expect(accounts.get(`${companyId}:linkedin`)?.status).toBe("disconnected");
  });
});
