/** Marker for posts created via board UI / human plugin actions (not agent tools). */
export const BOARD_AUDIT_AGENT_ID = "__board__";

export type CreatedByAudit = {
  createdByAgentId: string | null;
  createdByRunId: string | null;
};

export function auditFromRunCtx(runCtx: {
  agentId?: string | null;
  runId?: string | null;
}): CreatedByAudit {
  const agentId =
    typeof runCtx.agentId === "string" && runCtx.agentId.trim().length > 0
      ? runCtx.agentId.trim()
      : null;
  const runId =
    typeof runCtx.runId === "string" && runCtx.runId.trim().length > 0
      ? runCtx.runId.trim()
      : null;
  return { createdByAgentId: agentId, createdByRunId: runId };
}

export function auditFromBoard(): CreatedByAudit {
  return { createdByAgentId: BOARD_AUDIT_AGENT_ID, createdByRunId: null };
}
