import { describe, expect, it, vi } from "vitest";
import { runPublishScheduledJob } from "../src/jobs/publish-scheduled.js";
import { createMemoryPluginDb } from "./helpers/memory-db.js";

describe("publish-scheduled job", () => {
  it("publica posts pendentes via API LinkedIn quando conta conectada", async () => {
    const companyId = "co-publish";
    const postId = "post-due";
    const past = new Date(Date.now() - 60_000).toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-1",
      company_id: companyId,
      network_key: "linkedin",
      display_name: "Test User",
      status: "connected",
      connected_at: past,
      metadata_json: JSON.stringify({
        accessToken: "token-abc",
        refreshToken: null,
        expiresAt: null,
        scope: null,
        memberId: "abc123",
      }),
      created_at: past,
      updated_at: past,
    });
    db.seed.addScheduledPost({
      id: postId,
      company_id: companyId,
      network_key: "linkedin",
      body: "Post agendado de teste",
      media_json: null,
      scheduled_at: past,
      status: "pending",
      published_at: null,
      external_post_id: null,
      error_message: null,
      created_at: past,
      updated_at: past,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:created-1" },
      }),
    );

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const summary = await runPublishScheduledJob({
      db,
      httpFetch: fetchMock,
      logger,
      now: () => new Date(),
    });

    expect(summary).toMatchObject({ processed: 1, published: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const posts = await db.query<{ status: string; external_post_id: string | null }>(
      `SELECT status, external_post_id FROM scheduled_posts WHERE id = $1`,
      [postId],
    );
    expect(posts[0]?.status).toBe("published");
    expect(posts[0]?.external_post_id).toBe("urn:li:share:created-1");
  });

  it("marca failed com linkedin_not_connected quando conta desconectada", async () => {
    const companyId = "co-no-account";
    const postId = "post-orphan";
    const past = new Date(Date.now() - 60_000).toISOString();

    const db = createMemoryPluginDb();
    db.seed.addScheduledPost({
      id: postId,
      company_id: companyId,
      network_key: "linkedin",
      body: "Sem conta",
      media_json: null,
      scheduled_at: past,
      status: "pending",
      published_at: null,
      external_post_id: null,
      error_message: null,
      created_at: past,
      updated_at: past,
    });

    const summary = await runPublishScheduledJob({
      db,
      httpFetch: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    expect(summary).toMatchObject({ published: 0, failed: 1, skippedNotConnected: 1 });

    const posts = await db.query<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM scheduled_posts WHERE id = $1`,
      [postId],
    );
    expect(posts[0]?.status).toBe("failed");
    expect(posts[0]?.error_message).toBe("linkedin_not_connected");
  });

  it("publica posts X pendentes via API v2 quando conta conectada", async () => {
    const companyId = "co-publish-x";
    const postId = "post-x-due";
    const past = new Date(Date.now() - 60_000).toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-x",
      company_id: companyId,
      network_key: "x",
      display_name: "@gaud",
      status: "connected",
      connected_at: past,
      metadata_json: JSON.stringify({
        accessToken: "x-token",
        refreshToken: null,
        expiresAt: null,
        scope: null,
        userId: "999",
      }),
      created_at: past,
      updated_at: past,
    });
    db.seed.addScheduledPost({
      id: postId,
      company_id: companyId,
      network_key: "x",
      body: "Tweet agendado",
      media_json: null,
      scheduled_at: past,
      status: "pending",
      published_at: null,
      external_post_id: null,
      error_message: null,
      created_at: past,
      updated_at: past,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "tweet-abc" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const summary = await runPublishScheduledJob({
      db,
      httpFetch: fetchMock,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    expect(summary).toMatchObject({ processed: 1, published: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const posts = await db.query<{ status: string; external_post_id: string | null }>(
      `SELECT status, external_post_id FROM scheduled_posts WHERE id = $1`,
      [postId],
    );
    expect(posts[0]?.status).toBe("published");
    expect(posts[0]?.external_post_id).toBe("tweet-abc");
  });

  it("mantem post pending em rate limit 429 para retry no proximo ciclo", async () => {
    const companyId = "co-x-rate";
    const postId = "post-x-rate";
    const past = new Date(Date.now() - 60_000).toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-x-rate",
      company_id: companyId,
      network_key: "x",
      display_name: "@gaud",
      status: "connected",
      connected_at: past,
      metadata_json: JSON.stringify({ accessToken: "x-token", refreshToken: null, expiresAt: null, scope: null, userId: "1" }),
      created_at: past,
      updated_at: past,
    });
    db.seed.addScheduledPost({
      id: postId,
      company_id: companyId,
      network_key: "x",
      body: "Tweet rate limited",
      media_json: null,
      scheduled_at: past,
      status: "pending",
      published_at: null,
      external_post_id: null,
      error_message: null,
      created_at: past,
      updated_at: past,
    });

    const summary = await runPublishScheduledJob({
      db,
      httpFetch: vi.fn().mockResolvedValue(new Response("", { status: 429 })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    expect(summary).toMatchObject({ published: 0, failed: 0, rateLimited: 1 });

    const posts = await db.query<{ status: string }>(
      `SELECT status FROM scheduled_posts WHERE id = $1`,
      [postId],
    );
    expect(posts[0]?.status).toBe("pending");
  });

  it("publica posts Meta pendentes no feed da Pagina Facebook", async () => {
    const companyId = "co-publish-meta";
    const postId = "post-meta-due";
    const past = new Date(Date.now() - 60_000).toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-meta",
      company_id: companyId,
      network_key: "meta",
      display_name: "Gaud PT / @gaud_pt",
      status: "connected",
      connected_at: past,
      metadata_json: JSON.stringify({
        userAccessToken: "user-token",
        pageId: "page-111",
        pageAccessToken: "page-token-111",
        pageName: "Gaud PT",
        igBusinessAccountId: "ig-1",
        igUsername: "gaud_pt",
      }),
      created_at: past,
      updated_at: past,
    });
    db.seed.addScheduledPost({
      id: postId,
      company_id: companyId,
      network_key: "meta",
      body: "Ola Portugal!",
      media_json: null,
      scheduled_at: past,
      status: "pending",
      published_at: null,
      external_post_id: null,
      error_message: null,
      created_at: past,
      updated_at: past,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "fb-post-777" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const summary = await runPublishScheduledJob({
      db,
      httpFetch: fetchMock,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    expect(summary).toMatchObject({ processed: 1, published: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/page-111/feed");

    const posts = await db.query<{ status: string; external_post_id: string | null }>(
      `SELECT status, external_post_id FROM scheduled_posts WHERE id = $1`,
      [postId],
    );
    expect(posts[0]?.status).toBe("published");
    expect(posts[0]?.external_post_id).toBe("fb-post-777");
  });
});
