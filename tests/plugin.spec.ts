import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { validateSchedulePostInput } from "../src/scheduled-posts/validation.js";

describe("social-networking plugin", () => {
  it("declares sidebar, pages, database, and api routes", () => {
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.capabilities).toContain("ui.sidebar.register");
    expect(manifest.capabilities).toContain("database.namespace.migrate");
    expect(manifest.apiRoutes?.length).toBeGreaterThan(0);

    const slotTypes = manifest.ui?.slots?.map((slot) => slot.type) ?? [];
    expect(slotTypes).toContain("routeSidebar");
    expect(slotTypes).toContain("page");
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

    const data = await harness.getData<{ networks: Array<{ networkKey: string }> }>("overview", {
      companyId: "co-test",
    });
    expect(data.networks.some((n) => n.networkKey === "linkedin")).toBe(true);
  });
});
