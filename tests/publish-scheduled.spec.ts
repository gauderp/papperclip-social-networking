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
      `SELECT status, external_post_id FROM scheduled_posts WHERE id = ?`,
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
      `SELECT status, error_message FROM scheduled_posts WHERE id = ?`,
      [postId],
    );
    expect(posts[0]?.status).toBe("failed");
    expect(posts[0]?.error_message).toBe("linkedin_not_connected");
  });
});
