export const PLUGIN_ID = "gauderp.social-networking";
export const PLUGIN_VERSION = "0.1.0";

/** Must match Paperclip `derivePluginDatabaseNamespace(PLUGIN_ID)` and migrations. */
export const PLUGIN_DB_NAMESPACE = "plugin_gauderp_social_networking_73c869526e";

export function pluginTable(table: string): string {
  return `${PLUGIN_DB_NAMESPACE}.${table}`;
}

export const ROUTES = {
  hub: "social",
  linkedin: "social-linkedin",
  x: "social-x",
  meta: "social-meta",
} as const;

export const NETWORKS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    routePath: ROUTES.linkedin,
    enabled: true,
  },
  {
    key: "x",
    label: "X (Twitter)",
    routePath: ROUTES.x,
    enabled: true,
  },
  {
    key: "meta",
    label: "Meta (Facebook + Instagram)",
    routePath: ROUTES.meta,
    enabled: true,
  },
] as const;
