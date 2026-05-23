import { describe, expect, it, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import type { NetworkStatus } from "../src/linkedin/types.js";
import {
  buildRedirectUri,
  codeChallengeFromVerifier,
  createOAuthState,
  verifyOAuthState,
} from "../src/x/oauth.js";

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

describe("X OAuth", () => {
  const companyId = "co-test-x";
  const companyPrefix = "CUS";
  const publicOrigin = "http://127.0.0.1:3100";
  const credentials = { clientId: "x-client-id", clientSecret: "x-client-secret" };

  it("builds redirect URI, PKCE challenge and signed OAuth state", () => {
    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    expect(redirectUri).toBe("http://127.0.0.1:3100/CUS/social-x");

    const { state, codeVerifier } = createOAuthState(companyId, credentials.clientSecret);
    const payload = verifyOAuthState(state, credentials.clientSecret);
    expect(payload.companyId).toBe(companyId);
    expect(payload.codeVerifier).toBe(codeVerifier);
    expect(codeChallengeFromVerifier(codeVerifier)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("starts OAuth with authorize URL when secret refs are configured", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        xClientIdSecretRef: "X_CLIENT_ID",
        xClientSecretSecretRef: "X_CLIENT_SECRET",
      },
    });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "X_CLIENT_ID") return credentials.clientId;
      if (ref === "X_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const result = (await harness.performAction("x-start-oauth", {
      companyId,
      publicOrigin,
      companyPrefix,
    })) as { authorizeUrl: string; state: string; redirectUri: string };

    expect(result.redirectUri).toBe(buildRedirectUri(publicOrigin, companyPrefix));
    expect(result.authorizeUrl).toContain("twitter.com/i/oauth2/authorize");
    expect(result.authorizeUrl).toContain("code_challenge=");
    expect(verifyOAuthState(result.state, credentials.clientSecret).companyId).toBe(companyId);
  });

  it("completes OAuth happy path and persists connected account", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        xClientIdSecretRef: "X_CLIENT_ID",
        xClientSecretSecretRef: "X_CLIENT_SECRET",
      },
    });
    const accounts = installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "X_CLIENT_ID") return credentials.clientId;
      if (ref === "X_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const redirectUri = buildRedirectUri(publicOrigin, companyPrefix);
    const { state, codeVerifier } = createOAuthState(companyId, credentials.clientSecret);

    harness.ctx.http.fetch = vi.fn(async (url, init) => {
      if (url === "https://api.twitter.com/2/oauth2/token") {
        const body = init?.body?.toString() ?? "";
        expect(body).toContain(`code_verifier=${encodeURIComponent(codeVerifier)}`);
        return new Response(
          JSON.stringify({
            access_token: "x-access-token",
            expires_in: 7200,
            refresh_token: "x-refresh",
            scope: "tweet.write users.read offline.access",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("https://api.twitter.com/2/users/me")) {
        return new Response(
          JSON.stringify({ data: { id: "12345", name: "Gaud", username: "gauderp" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("x-complete-oauth", {
      companyId,
      code: "auth-code-x",
      state,
      publicOrigin,
      companyPrefix,
    })) as { ok: boolean; status: NetworkStatus };

    expect(result.ok).toBe(true);
    expect(result.status.status).toBe("connected");
    expect(result.status.displayName).toBe("Gaud");

    const stored = accounts.get(`${companyId}:x`);
    expect(stored?.status).toBe("connected");
    const metadata = JSON.parse(stored?.metadata_json ?? "{}") as {
      accessToken: string;
      userId: string;
    };
    expect(metadata.accessToken).toBe("x-access-token");
    expect(metadata.userId).toBe("12345");

    const apiStatus = (await plugin.definition.onApiRequest?.({
      routeKey: "network-status",
      method: "GET",
      path: "/networks/x/status",
      params: { networkKey: "x" },
      query: { companyId },
      body: null,
      actor: { actorType: "user", actorId: "user-1" },
      companyId,
      headers: {},
    })) as { status: number; body: NetworkStatus };

    expect(apiStatus?.status).toBe(200);
    expect(apiStatus?.body.status).toBe("connected");
  });

  it("marks account as error when token exchange fails", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        xClientIdSecretRef: "X_CLIENT_ID",
        xClientSecretSecretRef: "X_CLIENT_SECRET",
      },
    });
    installMemoryDb(harness);
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref) => {
      if (ref === "X_CLIENT_ID") return credentials.clientId;
      if (ref === "X_CLIENT_SECRET") return credentials.clientSecret;
      return "";
    };

    const { state } = createOAuthState(companyId, credentials.clientSecret);
    harness.ctx.http.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof harness.ctx.http.fetch;

    const result = (await harness.performAction("x-complete-oauth", {
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
});
