import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { TOOL_NAMES } from "../src/agent-capabilities.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { validatePublishNowInput, validateSchedulePostInput } from "../src/scheduled-posts/validation.js";

describe("social-networking plugin", () => {
  it("declares sidebar, pages, database, api routes, agent tools, and managed skill", () => {
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.capabilities).toContain("ui.sidebar.register");
    expect(manifest.capabilities).toContain("database.namespace.migrate");
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect(manifest.capabilities).toContain("skills.managed");
    expect(manifest.tools?.length).toBeGreaterThanOrEqual(5);
    expect(manifest.tools?.some((t) => t.name === TOOL_NAMES.publishNow)).toBe(true);
    expect(manifest.skills?.some((s) => s.skillKey === "linkedin-agent")).toBe(true);
    expect(manifest.apiRoutes?.length).toBeGreaterThan(0);

    const slotTypes = manifest.ui?.slots?.map((slot) => slot.type) ?? [];
    expect(slotTypes).toContain("routeSidebar");
    expect(slotTypes).toContain("page");
  });

  it("validates publish-now input", () => {
    expect(validatePublishNowInput({ body: "" })).toEqual({ ok: false, error: "body_required" });
    const ok = validatePublishNowInput({ body: "  Publicar agora  " });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.body).toBe("Publicar agora");
    }
  });

  it("validates schedule post input", () => {
    expect(validateSchedulePostInput({ body: "", scheduledAt: "2026-12-01T10:00:00.000Z" })).toEqual({
      ok: false,
      error: "body_required",
    });
    const future = new Date(Date.now() + 3600_000).toISOString();
    const ok = validateSchedulePostInput({ body: "  Ola  ", scheduledAt: future });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.body).toBe("Ola");
      expect(ok.scheduledAt).toBe(future);
    }
  });

  it("registers overview data handler", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<{
      networks: Array<{ networkKey: string; pendingCount: number }>;
      totalPending: number;
    }>("overview", {
      companyId: "co-test",
    });
    expect(data.networks.some((n) => n.networkKey === "linkedin")).toBe(true);
    expect(typeof data.totalPending).toBe("number");
    expect(data.networks[0]?.pendingCount).toBeGreaterThanOrEqual(0);
  });

  it("registers cross-network scheduled-posts data handler", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<{ posts: unknown[] }>("scheduled-posts", {
      companyId: "co-test",
    });
    expect(Array.isArray(data.posts)).toBe(true);
  });

  it("exposes linkedin network status agent tool", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"],
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool<{ data?: { status?: string } }>(
      TOOL_NAMES.networkStatus,
      {},
      { companyId: "co-test", projectId: "proj-1", agentId: "agent-1", runId: "run-1" },
    );
    expect(result.data?.status).toBeDefined();
  });
});
