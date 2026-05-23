import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { pluginTable } from "../constants.js";
import { getNetworkStatus } from "../linkedin/accounts.js";
import type { NetworkStatus } from "../linkedin/types.js";
import type { XTokenMetadata } from "./types.js";

const networkAccounts = pluginTable("network_accounts");

const NETWORK_KEY = "x";

function accountId(companyId: string): string {
  return `${companyId}:${NETWORK_KEY}`;
}

function parseMetadata(raw: string | null): XTokenMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as XTokenMetadata;
  } catch {
    return null;
  }
}

export { getNetworkStatus };

export async function saveConnectedAccount(
  ctx: PluginContext,
  input: {
    companyId: string;
    displayName: string | null;
    tokens: XTokenMetadata;
  },
): Promise<NetworkStatus> {
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify(input.tokens);

  await ctx.db.execute(
    `INSERT INTO ${networkAccounts} (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES ($1, $2, $3, $4, 'connected', $5, $6, $7)
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

  return getNetworkStatus(ctx, input.companyId, NETWORK_KEY);
}

export async function markAccountError(
  ctx: PluginContext,
  companyId: string,
  message: string,
): Promise<NetworkStatus> {
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify({ errorMessage: message, at: now });

  await ctx.db.execute(
    `INSERT INTO ${networkAccounts} (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES ($1, $2, $3, NULL, 'error', NULL, $4, $5)
     ON CONFLICT (company_id, network_key) DO UPDATE SET
       status = 'error',
       connected_at = NULL,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
    [accountId(companyId), companyId, NETWORK_KEY, metadataJson, now],
  );

  return getNetworkStatus(ctx, companyId, NETWORK_KEY);
}

export async function disconnectAccount(
  ctx: PluginContext,
  companyId: string,
): Promise<NetworkStatus> {
  const now = new Date().toISOString();

  await ctx.db.execute(
    `INSERT INTO ${networkAccounts} (
       id, company_id, network_key, display_name, status, connected_at, metadata_json, updated_at
     ) VALUES ($1, $2, $3, NULL, 'disconnected', NULL, NULL, $4)
     ON CONFLICT (company_id, network_key) DO UPDATE SET
       display_name = NULL,
       status = 'disconnected',
       connected_at = NULL,
       metadata_json = NULL,
       updated_at = excluded.updated_at`,
    [accountId(companyId), companyId, NETWORK_KEY, now],
  );

  return getNetworkStatus(ctx, companyId, NETWORK_KEY);
}

export async function getTokenMetadata(
  ctx: Pick<PluginContext, "db">,
  companyId: string,
): Promise<XTokenMetadata | null> {
  const rows = await ctx.db.query<{ metadata_json: string | null; status: string }>(
    `SELECT metadata_json, status FROM ${networkAccounts}
     WHERE company_id = $1 AND network_key = $2
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

export async function getXPublishCredentials(
  ctx: Pick<PluginContext, "db">,
  companyId: string,
): Promise<{ accessToken: string } | null> {
  const tokens = await getTokenMetadata(ctx, companyId);
  const accessToken = tokens?.accessToken;
  if (!accessToken) {
    return null;
  }
  return { accessToken };
}
