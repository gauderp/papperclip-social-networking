import { describe, expect, it, vi } from "vitest";
import { publishLinkedInPostNow } from "../src/linkedin/publish-now.js";
import { createMemoryPluginDb } from "./helpers/memory-db.js";

describe("publish-linkedin-now", () => {
  it("publica imediatamente via API LinkedIn quando conta conectada", async () => {
    const companyId = "co-now";
    const nowIso = new Date().toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-now",
      company_id: companyId,
      network_key: "linkedin",
      display_name: "Test User",
      status: "connected",
      connected_at: nowIso,
      metadata_json: JSON.stringify({
        accessToken: "token-now",
        refreshToken: null,
        expiresAt: null,
        scope: null,
        memberId: "member-now",
      }),
      created_at: nowIso,
      updated_at: nowIso,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:now-1" },
      }),
    );

    const result = await publishLinkedInPostNow({
      db,
      httpFetch: fetchMock,
      companyId,
      body: "Post imediato de teste",
      now: () => new Date(nowIso),
    });

    expect(result).toMatchObject({
      ok: true,
      externalPostId: "urn:li:share:now-1",
      publishedAt: nowIso,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    if (result.ok) {
      const posts = await db.query<{ status: string; external_post_id: string | null }>(
        `SELECT status, external_post_id FROM scheduled_posts WHERE id = $1`,
        [result.postId],
      );
      expect(posts[0]?.status).toBe("published");
      expect(posts[0]?.external_post_id).toBe("urn:li:share:now-1");
    }
  });

  it("retorna linkedin_not_connected quando conta desconectada", async () => {
    const companyId = "co-no-account-now";

    const db = createMemoryPluginDb();

    const result = await publishLinkedInPostNow({
      db,
      httpFetch: vi.fn(),
      companyId,
      body: "Sem conta",
    });

    expect(result).toEqual({ ok: false, error: "linkedin_not_connected" });
  });

  it("marca failed quando API LinkedIn falha", async () => {
    const companyId = "co-api-fail";
    const nowIso = new Date().toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-fail",
      company_id: companyId,
      network_key: "linkedin",
      display_name: "Test User",
      status: "connected",
      connected_at: nowIso,
      metadata_json: JSON.stringify({
        accessToken: "token-fail",
        refreshToken: null,
        expiresAt: null,
        scope: null,
        memberId: "member-fail",
      }),
      created_at: nowIso,
      updated_at: nowIso,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    const result = await publishLinkedInPostNow({
      db,
      httpFetch: fetchMock,
      companyId,
      body: "Post que falha",
      now: () => new Date(nowIso),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("linkedin_http_429");
    }

    const posts = await db.query<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM scheduled_posts WHERE company_id = $1 AND network_key = $2`,
      [companyId, "linkedin"],
    );
    expect(posts[0]?.status).toBe("failed");
    expect(posts[0]?.error_message).toContain("linkedin_http_429");
  });

  it("rejeita body vazio", async () => {
    const db = createMemoryPluginDb();

    const result = await publishLinkedInPostNow({
      db,
      httpFetch: vi.fn(),
      companyId: "co-empty",
      body: "   ",
    });

    expect(result).toEqual({ ok: false, error: "body_required" });
  });
});
