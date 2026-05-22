import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { LinkedInTokenMetadata, NetworkAccountStatus, NetworkStatus } from "./types.js";

const NETWORK_KEY = "linkedin";

function accountId(companyId: string): string {
  return `${companyId}:${NETWORK_KEY}`;
}

function parseMetadata(raw: string | null): LinkedInTokenMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LinkedInTokenMetadata;
  } catch {
    return null;
  }
}

export async function getNetworkStatus(
  ctx: Pick<PluginContext, "db">,
  companyId: string,
  networkKey: string = NETWORK_KEY,
): Promise<NetworkStatus> {
  const rows = await ctx.db.query<{
    status: string;
    display_name: string | null;
    connected_at: string | null;
  }>(
    `SELECT status, display_name, connected_at
     FROM network_accounts
     WHERE company_id = ? AND network_key = ?
     LIMIT 1`,
    [companyId, networkKey],
  );

  const row = rows[0];
  return {
    networkKey,
    status: (row?.status as NetworkAccountStatus) ?? "disconnected",
    displayName: row?.display_name ?? null,
    connectedAt: row?.connected_at ?? null,
  };
}

export async function saveConnectedAccount(
  ctx: PluginContext,
  input: {
    companyId: string;
    displayName: string | null;
    tokens: LinkedInTokenMetadata;
  },
): Promise<NetworkStatus> {
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify(input.tokens);

  await ctx.db.execute(
    `INSERT INTO network_accounts (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES (?, ?, ?, ?, 'connected', ?, ?, ?)
     ON CONFLICT (company_id, network_key) DO UPDATE SET
       display_name = excluded.display_name,
       status = 'connected',
       connected_at = excluded.connected_at,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
    [
      accountId(input.companyId),
      input.companyId,
      NETWORK_KEY,
      input.displayName,
      now,
      metadataJson,
      now,
    ],
  );

  return getNetworkStatus(ctx, input.companyId);
}

export async function markAccountError(
  ctx: PluginContext,
  companyId: string,
  message: string,
): Promise<NetworkStatus> {
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify({ errorMessage: message, at: now });

  await ctx.db.execute(
    `INSERT INTO network_accounts (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES (?, ?, ?, NULL, 'error', NULL, ?, ?)
     ON CONFLICT (company_id, network_key) DO UPDATE SET
       status = 'error',
       connected_at = NULL,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
    [accountId(companyId), companyId, NETWORK_KEY, metadataJson, now],
  );

  return getNetworkStatus(ctx, companyId);
}

export async function disconnectAccount(
  ctx: PluginContext,
  companyId: string,
): Promise<NetworkStatus> {
  const now = new Date().toISOString();

  await ctx.db.execute(
    `INSERT INTO network_accounts (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES (?, ?, ?, NULL, 'disconnected', NULL, NULL, ?)
     ON CONFLICT (company_id, network_key) DO UPDATE SET
       display_name = NULL,
       status = 'disconnected',
       connected_at = NULL,
       metadata_json = NULL,
       updated_at = excluded.updated_at`,
    [accountId(companyId), companyId, NETWORK_KEY, now],
  );

  return getNetworkStatus(ctx, companyId);
}

export async function getTokenMetadata(
  ctx: Pick<PluginContext, "db">,
  companyId: string,
): Promise<LinkedInTokenMetadata | null> {
  const rows = await ctx.db.query<{ metadata_json: string | null; status: string }>(
    `SELECT metadata_json, status FROM network_accounts
     WHERE company_id = ? AND network_key = ?
     LIMIT 1`,
    [companyId, NETWORK_KEY],
  );
  const row = rows[0];
  if (!row || row.status !== "connected") return null;
  return parseMetadata(row.metadata_json);
}

export function newAccountRowId(): string {
  return randomUUID();
}

export function linkedInAuthorUrn(tokens: LinkedInTokenMetadata | null): string | null {
  const memberId = tokens?.memberId;
  if (typeof memberId !== "string" || memberId.length === 0) {
    return null;
  }
  if (memberId.startsWith("urn:li:")) {
    return memberId;
  }
  return `urn:li:person:${memberId}`;
}

export async function getLinkedInPublishCredentials(
  ctx: Pick<PluginContext, "db">,
  companyId: string,
): Promise<{ accessToken: string; authorUrn: string } | null> {
  const tokens = await getTokenMetadata(ctx, companyId);
  const accessToken = tokens?.accessToken;
  const authorUrn = linkedInAuthorUrn(tokens);
  if (!accessToken || !authorUrn) {
    return null;
  }
  return { accessToken, authorUrn };
}
