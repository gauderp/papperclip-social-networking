import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { InstanceConfig, LinkedInCredentials } from "./types.js";

export async function getInstanceConfig(ctx: PluginContext): Promise<InstanceConfig> {
  const config = await ctx.config.get();
  return config as InstanceConfig;
}

export async function getLinkedInCredentials(ctx: PluginContext): Promise<LinkedInCredentials> {
  const config = await getInstanceConfig(ctx);
  const clientIdRef = config.linkedinClientIdSecretRef?.trim();
  const clientSecretRef = config.linkedinClientSecretSecretRef?.trim();

  if (!clientIdRef || !clientSecretRef) {
    throw new Error(
      "Configure linkedinClientIdSecretRef e linkedinClientSecretSecretRef nas settings da instancia do plugin.",
    );
  }

  const [clientId, clientSecret] = await Promise.all([
    ctx.secrets.resolve(clientIdRef),
    ctx.secrets.resolve(clientSecretRef),
  ]);

  if (!clientId || !clientSecret) {
    throw new Error("Secret refs do LinkedIn resolveram vazios.");
  }

  return { clientId, clientSecret };
}
