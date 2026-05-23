import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  AGENT_SKILL_MARKDOWN,
  MANAGED_SKILL_KEY,
  META_AGENT_SKILL_MARKDOWN,
  META_MANAGED_SKILL_KEY,
  META_TOOL_NAMES,
  TOOL_NAMES,
  X_AGENT_SKILL_MARKDOWN,
  X_MANAGED_SKILL_KEY,
  X_TOOL_NAMES,
} from "./agent-capabilities.js";
import { NETWORKS, PLUGIN_ID, PLUGIN_VERSION, ROUTES } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Social Networking",
  description:
    "Conecta contas de redes sociais, agenda publicacoes e exibe historico com metricas. Redes: LinkedIn, X e Meta.",
  author: "Gaud ERP",
  categories: ["connector", "ui"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "secrets.read-ref",
    "http.outbound",
    "jobs.schedule",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "api.routes.register",
    "ui.sidebar.register",
    "ui.page.register",
    "instance.settings.register",
    "agent.tools.register",
    "companies.read",
    "skills.managed",
  ],
  tools: [
    {
      name: TOOL_NAMES.networkStatus,
      displayName: "LinkedIn network status",
      description:
        "Returns LinkedIn connection status for the current company before scheduling posts.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.publishNow,
      displayName: "Publish LinkedIn post now",
      description:
        "Publishes a LinkedIn post immediately. Requires a connected LinkedIn account.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string", description: "Post text" },
        },
        required: ["body"],
      },
    },
    {
      name: TOOL_NAMES.schedulePost,
      displayName: "Schedule LinkedIn post",
      description:
        "Schedules a LinkedIn post for a future time. Requires a connected LinkedIn account.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string", description: "Post text" },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime in the future",
          },
        },
        required: ["body", "scheduledAt"],
      },
    },
    {
      name: TOOL_NAMES.listScheduled,
      displayName: "List LinkedIn scheduled posts",
      description: "Lists pending and recent scheduled LinkedIn posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.cancelScheduled,
      displayName: "Cancel LinkedIn scheduled post",
      description: "Deletes a pending scheduled post by id.",
      parametersSchema: {
        type: "object",
        properties: {
          postId: { type: "string", description: "Scheduled post id" },
        },
        required: ["postId"],
      },
    },
    {
      name: X_TOOL_NAMES.networkStatus,
      displayName: "X network status",
      description: "Returns X connection status for the current company before scheduling posts.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: X_TOOL_NAMES.schedulePost,
      displayName: "Schedule X post",
      description: "Schedules an X post for a future time. Requires a connected X account.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string", description: "Post text" },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime in the future",
          },
        },
        required: ["body", "scheduledAt"],
      },
    },
    {
      name: X_TOOL_NAMES.listScheduled,
      displayName: "List X scheduled posts",
      description: "Lists pending and recent scheduled X posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: X_TOOL_NAMES.cancelScheduled,
      displayName: "Cancel X scheduled post",
      description: "Deletes a pending scheduled post by id.",
      parametersSchema: {
        type: "object",
        properties: {
          postId: { type: "string", description: "Scheduled post id" },
        },
        required: ["postId"],
      },
    },
    {
      name: META_TOOL_NAMES.networkStatus,
      displayName: "Meta network status",
      description:
        "Returns Meta (Facebook Page + Instagram Business) connection status for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: META_TOOL_NAMES.schedulePost,
      displayName: "Schedule Meta post",
      description:
        "Schedules a Facebook Page feed post for a future time. Requires a connected Meta account.",
      parametersSchema: {
        type: "object",
        properties: {
          body: { type: "string", description: "Post text" },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime in the future",
          },
        },
        required: ["body", "scheduledAt"],
      },
    },
    {
      name: META_TOOL_NAMES.listScheduled,
      displayName: "List Meta scheduled posts",
      description: "Lists pending and recent scheduled Meta posts for the company.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: META_TOOL_NAMES.cancelScheduled,
      displayName: "Cancel Meta scheduled post",
      description: "Deletes a pending scheduled post by id.",
      parametersSchema: {
        type: "object",
        properties: {
          postId: { type: "string", description: "Scheduled post id" },
        },
        required: ["postId"],
      },
    },
  ],
  skills: [
    {
      skillKey: MANAGED_SKILL_KEY,
      displayName: "Social Networking — LinkedIn",
      slug: "social-linkedin-agent",
      description:
        "Agenda publicações no LinkedIn via ferramentas do plugin gauderp.social-networking.",
      markdown: AGENT_SKILL_MARKDOWN,
    },
    {
      skillKey: X_MANAGED_SKILL_KEY,
      displayName: "Social Networking — X",
      slug: "social-x-agent",
      description: "Agenda publicações no X via ferramentas do plugin gauderp.social-networking.",
      markdown: X_AGENT_SKILL_MARKDOWN,
    },
    {
      skillKey: META_MANAGED_SKILL_KEY,
      displayName: "Social Networking — Meta",
      slug: "social-meta-agent",
      description:
        "Agenda publicações na Pagina Facebook (Graph API) via plugin gauderp.social-networking.",
      markdown: META_AGENT_SKILL_MARKDOWN,
    },
  ],
  database: {
    migrationsDir: "migrations",
    coreReadTables: [],
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  apiRoutes: [
    {
      routeKey: "network-status",
      method: "GET",
      path: "/networks/:networkKey/status",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "linkedin-sync-metrics",
      method: "POST",
      path: "/linkedin/sync-metrics",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "scheduled-posts-list",
      method: "GET",
      path: "/networks/:networkKey/scheduled-posts",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "scheduled-posts-create",
      method: "POST",
      path: "/networks/:networkKey/scheduled-posts",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "scheduled-posts-delete",
      method: "DELETE",
      path: "/networks/:networkKey/scheduled-posts/:postId",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
  jobs: [
    {
      jobKey: "publish-scheduled",
      displayName: "Publicar posts agendados",
      description: "Processa fila de publicacoes com scheduledAt <= agora.",
      schedule: "*/5 * * * *",
    },
    {
      jobKey: "sync-linkedin-metrics",
      displayName: "Sincronizar metricas LinkedIn",
      description: "Atualiza likes, comentarios, shares e impressions em post_metrics.",
      schedule: "0 */6 * * *",
    },
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      linkedinClientIdSecretRef: {
        type: "string",
        title: "LinkedIn Client ID (secret ref)",
        default: "",
      },
      linkedinClientSecretSecretRef: {
        type: "string",
        title: "LinkedIn Client Secret (secret ref)",
        default: "",
      },
      xClientIdSecretRef: {
        type: "string",
        title: "X Client ID (secret ref)",
        default: "",
      },
      xClientSecretSecretRef: {
        type: "string",
        title: "X Client Secret (secret ref)",
        default: "",
      },
      metaAppIdSecretRef: {
        type: "string",
        title: "Meta App ID (secret ref)",
        default: "",
      },
      metaAppSecretSecretRef: {
        type: "string",
        title: "Meta App Secret (secret ref)",
        default: "",
      },
    },
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "social-sidebar-link",
        displayName: "Social Networking",
        exportName: "SidebarLink",
        order: 45,
      },
      {
        type: "page",
        id: "social-hub-page",
        displayName: "Social Networking",
        exportName: "SocialHubPage",
        routePath: ROUTES.hub,
      },
      {
        type: "routeSidebar",
        id: "social-route-sidebar",
        displayName: "Social Networking",
        exportName: "SocialRouteSidebar",
        routePath: ROUTES.hub,
      },
      {
        type: "page",
        id: "linkedin-page",
        displayName: "LinkedIn",
        exportName: "LinkedInPage",
        routePath: ROUTES.linkedin,
      },
      {
        type: "routeSidebar",
        id: "linkedin-route-sidebar",
        displayName: "Social Networking",
        exportName: "SocialRouteSidebar",
        routePath: ROUTES.linkedin,
      },
      {
        type: "page",
        id: "x-page",
        displayName: "X (Twitter)",
        exportName: "XPage",
        routePath: ROUTES.x,
      },
      {
        type: "routeSidebar",
        id: "x-route-sidebar",
        displayName: "Social Networking",
        exportName: "SocialRouteSidebar",
        routePath: ROUTES.x,
      },
      {
        type: "page",
        id: "meta-page",
        displayName: "Meta (Facebook + Instagram)",
        exportName: "MetaPage",
        routePath: ROUTES.meta,
      },
      {
        type: "routeSidebar",
        id: "meta-route-sidebar",
        displayName: "Social Networking",
        exportName: "SocialRouteSidebar",
        routePath: ROUTES.meta,
      },
      {
        type: "settingsPage",
        id: "social-settings",
        displayName: "Social Networking",
        exportName: "SettingsPage",
      },
    ],
  },
};

export default manifest;
export { NETWORKS };
