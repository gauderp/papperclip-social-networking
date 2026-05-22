import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { parseLinkedInStatisticsPayload } from "../src/linkedin/metrics-api.js";
import { createMemoryPluginDb } from "./helpers/memory-db.js";

describe("linkedin metrics", () => {
  it("parses LinkedIn statistics payload shapes", () => {
    const parsed = parseLinkedInStatisticsPayload({
      totalShareStatistics: {
        likeCount: 12,
        commentCount: 3,
        shareCount: 2,
        impressionCount: 400,
      },
    });
    expect(parsed).toEqual({
      likes: 12,
      comments: 3,
      shares: 2,
      impressions: 400,
      raw: expect.any(Object),
    });
  });

  it("lists post history and sync skips when disconnected", async () => {
    const companyId = "co-metrics-test";
    const postId = "post-1";
    const externalId = "urn:li:share:123";
    const now = new Date().toISOString();

    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    harness.ctx.db = createMemoryPluginDb({
      scheduled_posts: [
        {
          id: postId,
          company_id: companyId,
          network_key: "linkedin",
          body: "Hello world",
          media_json: null,
          scheduled_at: now,
          status: "published",
          published_at: now,
          external_post_id: externalId,
          error_message: null,
          created_at: now,
          updated_at: now,
        },
      ],
      post_metrics: [
        {
          id: "metric-1",
          company_id: companyId,
          network_key: "linkedin",
          external_post_id: externalId,
          likes: 5,
          comments: 1,
          shares: 0,
          impressions: 100,
          fetched_at: now,
          raw_json: null,
        },
      ],
    });
    await plugin.definition.setup(harness.ctx);

    const history = await harness.getData<{ posts: Array<{ id: string; metrics: unknown }> }>(
      "linkedin-history",
      { companyId },
    );
    expect(history.posts).toHaveLength(1);
    expect(history.posts[0]?.id).toBe(postId);
    expect(history.posts[0]?.metrics).toMatchObject({ likes: 5, comments: 1 });

    const syncResult = await harness.performAction("sync-linkedin-metrics", { companyId });
    expect(syncResult).toMatchObject({ reason: "not_connected", synced: 0 });
  });

  it("syncs metrics for connected account via LinkedIn API", async () => {
    const companyId = "co-connected";
    const externalId = "urn:li:share:999";
    const now = new Date().toISOString();

    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    harness.ctx.db = createMemoryPluginDb({
      network_accounts: [
        {
          id: "acc-1",
          company_id: companyId,
          network_key: "linkedin",
          display_name: "Test",
          status: "connected",
          connected_at: now,
          metadata_json: JSON.stringify({
            accessToken: "test-token",
            refreshToken: null,
            expiresAt: null,
            scope: null,
            memberId: "abc",
          }),
          created_at: now,
          updated_at: now,
        },
      ],
      scheduled_posts: [
        {
          id: "post-sync",
          company_id: companyId,
          network_key: "linkedin",
          body: "Synced post",
          media_json: null,
          scheduled_at: now,
          status: "published",
          published_at: now,
          external_post_id: externalId,
          error_message: null,
          created_at: now,
          updated_at: now,
        },
      ],
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          totalShareStatistics: { likeCount: 7, commentCount: 2, shareCount: 1, impressionCount: 50 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    harness.ctx.http.fetch = fetchMock;

    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("sync-linkedin-metrics", { companyId });
    expect(result).toMatchObject({ synced: 1, errors: 0 });

    const history = await harness.getData<{
      posts: Array<{ metrics: { likes: number } | null }>;
    }>("linkedin-history", { companyId });
    expect(history.posts[0]?.metrics?.likes).toBe(7);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
