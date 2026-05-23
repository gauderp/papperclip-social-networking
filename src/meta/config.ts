import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { InstanceConfig } from "../linkedin/types.js";
import type { MetaCredentials } from "./types.js";

export async function getMetaCredentials(ctx: PluginContext): Promise<MetaCredentials> {
  const config = (await ctx.config.get()) as InstanceConfig & {
    metaAppIdSecretRef?: string;
    metaAppSecretSecretRef?: string;
  };
  const appIdRef = config.metaAppIdSecretRef?.trim();
  const appSecretRef = config.metaAppSecretSecretRef?.trim();

  if (!appIdRef || !appSecretRef) {
    throw new Error(
      "Configure metaAppIdSecretRef e metaAppSecretSecretRef nas settings da instancia do plugin.",
    );
  }

  const [appId, appSecret] = await Promise.all([
    ctx.secrets.resolve(appIdRef),
    ctx.secrets.resolve(appSecretRef),
  ]);

  if (!appId || !appSecret) {
    throw new Error("Secret refs da Meta resolveram vazios.");
  }

  return { appId, appSecret };
}
