export const PLUGIN_ID = "gauderp.social-networking";
export const PLUGIN_VERSION = "0.1.0";

export const ROUTES = {
  hub: "social",
  linkedin: "social-linkedin",
} as const;

export const NETWORKS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    routePath: ROUTES.linkedin,
    enabled: true,
  },
] as const;
