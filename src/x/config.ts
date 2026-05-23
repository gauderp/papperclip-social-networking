import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { InstanceConfig } from "../linkedin/types.js";
import type { XCredentials } from "./types.js";

export async function getXCredentials(ctx: PluginContext): Promise<XCredentials> {
  const config = (await ctx.config.get()) as InstanceConfig & {
    xClientIdSecretRef?: string;
    xClientSecretSecretRef?: string;
  };
  const clientIdRef = config.xClientIdSecretRef?.trim();
  const clientSecretRef = config.xClientSecretSecretRef?.trim();

  if (!clientIdRef || !clientSecretRef) {
    throw new Error(
      "Configure xClientIdSecretRef e xClientSecretSecretRef nas settings da instancia do plugin.",
    );
  }

  const [clientId, clientSecret] = await Promise.all([
    ctx.secrets.resolve(clientIdRef),
    ctx.secrets.resolve(clientSecretRef),
  ]);

  if (!clientId || !clientSecret) {
    throw new Error("Secret refs do X resolveram vazios.");
  }

  return { clientId, clientSecret };
}
