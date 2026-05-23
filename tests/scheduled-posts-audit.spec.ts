import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { TOOL_NAMES } from "../src/agent-capabilities.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { publishLinkedInPostNow } from "../src/linkedin/publish-now.js";
import {
  BOARD_AUDIT_AGENT_ID,
  auditFromBoard,
  auditFromRunCtx,
} from "../src/scheduled-posts/audit.js";
import { createScheduledPost } from "../src/scheduled-posts/store.js";
import { createMemoryPluginDb } from "./helpers/memory-db.js";

describe("scheduled_posts audit", () => {
  it("auditFromRunCtx extrai agentId e runId", () => {
    expect(auditFromRunCtx({ agentId: "agent-abc", runId: "run-xyz" })).toEqual({
      createdByAgentId: "agent-abc",
      createdByRunId: "run-xyz",
    });
  });

  it("auditFromRunCtx ignora strings vazias", () => {
    expect(auditFromRunCtx({ agentId: "  ", runId: "" })).toEqual({
      createdByAgentId: null,
      createdByRunId: null,
    });
  });

  it("auditFromBoard marca origem painel", () => {
    expect(auditFromBoard()).toEqual({
      createdByAgentId: BOARD_AUDIT_AGENT_ID,
      createdByRunId: null,
    });
  });

  it("createScheduledPost persiste colunas de auditoria", async () => {
    const db = createMemoryPluginDb();
    const scheduledAt = new Date().toISOString();

    const post = await createScheduledPost(db, {
      companyId: "co-audit",
      networkKey: "linkedin",
      body: "Post com auditoria",
      scheduledAt,
      createdByAgentId: "agent-1",
      createdByRunId: "run-1",
    });

    expect(post.createdByAgentId).toBe("agent-1");
    expect(post.createdByRunId).toBe("run-1");

    const rows = await db.query<{ created_by_agent_id: string | null; created_by_run_id: string | null }>(
      `SELECT created_by_agent_id, created_by_run_id FROM scheduled_posts WHERE id = $1`,
      [post.id],
    );
    expect(rows[0]?.created_by_agent_id).toBe("agent-1");
    expect(rows[0]?.created_by_run_id).toBe("run-1");
  });

  it("schedule-linkedin tool grava agentId e runId do runCtx", async () => {
    const companyId = "co-tool-audit";
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();

    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    harness.ctx.db = createMemoryPluginDb({
      network_accounts: [
        {
          id: "acc-audit",
          company_id: companyId,
          network_key: "linkedin",
          display_name: "Test",
          status: "connected",
          connected_at: now,
          metadata_json: JSON.stringify({
            accessToken: "tok",
            refreshToken: null,
            expiresAt: null,
            scope: null,
            memberId: "m1",
          }),
          created_at: now,
          updated_at: now,
        },
      ],
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool<{
      data?: { post?: { createdByAgentId?: string | null; createdByRunId?: string | null } };
    }>(
      TOOL_NAMES.schedulePost,
      { body: "Post de agente", scheduledAt: future },
      { companyId, projectId: "p1", agentId: "agent-audit-99", runId: "run-audit-88" },
    );

    expect(result.data?.post?.createdByAgentId).toBe("agent-audit-99");
    expect(result.data?.post?.createdByRunId).toBe("run-audit-88");
  });

  it("publish-now grava auditoria no registro publicado", async () => {
    const companyId = "co-publish-audit";
    const nowIso = new Date().toISOString();

    const db = createMemoryPluginDb();
    db.seed.addNetworkAccount({
      id: "acc-pub-audit",
      company_id: companyId,
      network_key: "linkedin",
      display_name: "Test",
      status: "connected",
      connected_at: nowIso,
      metadata_json: JSON.stringify({
        accessToken: "token-audit",
        refreshToken: null,
        expiresAt: null,
        scope: null,
        memberId: "member-audit",
      }),
      created_at: nowIso,
      updated_at: nowIso,
    });

    const result = await publishLinkedInPostNow({
      db,
      httpFetch: vi.fn().mockResolvedValue(
        new Response(null, {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:audit-1" },
        }),
      ),
      companyId,
      body: "Publicacao com auditoria",
      createdByAgentId: "agent-pub",
      createdByRunId: "run-pub",
      now: () => new Date(nowIso),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rows = await db.query<{
        created_by_agent_id: string | null;
        created_by_run_id: string | null;
      }>(
        `SELECT created_by_agent_id, created_by_run_id FROM scheduled_posts WHERE id = $1`,
        [result.postId],
      );
      expect(rows[0]?.created_by_agent_id).toBe("agent-pub");
      expect(rows[0]?.created_by_run_id).toBe("run-pub");
    }
  });
});
