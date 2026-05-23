export const MANAGED_SKILL_KEY = "linkedin-agent";
export const X_MANAGED_SKILL_KEY = "x-agent";
export const META_MANAGED_SKILL_KEY = "meta-agent";

export const TOOL_NAMES = {
  networkStatus: "linkedin-network-status",
  schedulePost: "schedule-linkedin-post",
  publishNow: "publish-linkedin-now",
  listScheduled: "list-linkedin-scheduled-posts",
  cancelScheduled: "cancel-linkedin-scheduled-post",
} as const;

export const X_TOOL_NAMES = {
  networkStatus: "x-network-status",
  schedulePost: "schedule-x-post",
  listScheduled: "list-x-scheduled-posts",
  cancelScheduled: "cancel-x-scheduled-post",
} as const;

export const META_TOOL_NAMES = {
  networkStatus: "meta-network-status",
  schedulePost: "schedule-meta-post",
  listScheduled: "list-meta-scheduled-posts",
  cancelScheduled: "cancel-meta-scheduled-post",
} as const;

export const AGENT_SKILL_MARKDOWN = `# Social Networking — LinkedIn (agentes)

Use as ferramentas do plugin \`gauderp.social-networking\` para agendar publicações no LinkedIn quando a conta da empresa estiver conectada.

## Pré-requisitos

1. Plugin instalado na instância (\`paperclipai plugin install\`).
2. Secret refs do LinkedIn configurados em **Instance settings** do plugin.
3. Conta LinkedIn conectada na UI (\`/:prefix/social-linkedin\`) ou status \`connected\` via ferramenta de status.
4. Skill reconciliada na empresa: action \`setup-company-capabilities\` (ou \`ctx.skills.managed.reconcile("linkedin-agent", companyId)\`).

## Ferramentas (namespace \`gauderp.social-networking:\`)

| Ferramenta | Quando usar | Parâmetros |
|------------|-------------|------------|
| \`gauderp.social-networking:linkedin-network-status\` | Antes de publicar/agendar; verificar OAuth | \`{}\` — \`companyId\` vem do run context |
| \`gauderp.social-networking:publish-linkedin-now\` | Publicar texto imediatamente | \`body\` (string) |
| \`gauderp.social-networking:schedule-linkedin-post\` | Agendar texto para publicação futura | \`body\` (string), \`scheduledAt\` (ISO 8601, futuro) |
| \`gauderp.social-networking:list-linkedin-scheduled-posts\` | Listar fila pendente | \`{}\` |
| \`gauderp.social-networking:cancel-linkedin-scheduled-post\` | Cancelar post ainda \`pending\` | \`postId\` (string) |

## Rotas HTTP alternativas (auth \`board-or-agent\`)

Se as ferramentas do plugin não estiverem expostas no adapter do agente, use as rotas declaradas no manifest com \`companyId\` na query:

- \`GET /api/plugins/gauderp.social-networking/api/networks/linkedin/status?companyId=...\`
- \`GET /api/plugins/gauderp.social-networking/api/networks/linkedin/scheduled-posts?companyId=...\`
- \`POST /api/plugins/gauderp.social-networking/api/networks/linkedin/scheduled-posts?companyId=...\` — body \`{ "body", "scheduledAt" }\`
- \`DELETE /api/plugins/gauderp.social-networking/api/networks/linkedin/scheduled-posts/:postId?companyId=...\`

## Fluxo mínimo (publicação imediata)

1. \`linkedin-network-status\` → status \`connected\`.
2. \`publish-linkedin-now\` com \`body\` — publica na hora e grava histórico (\`published\`).

## Fluxo mínimo (agendamento)

1. \`linkedin-network-status\` → status \`connected\`.
2. \`schedule-linkedin-post\` com \`body\` e \`scheduledAt\`.
3. Job \`publish-scheduled\` (cron */5) publica quando \`scheduledAt <= now\`.

## Registro para novos plugins

1. Manifest: \`capabilities\` inclui \`agent.tools.register\` e \`skills.managed\`; declare \`tools[]\` e \`skills[]\`.
2. Worker: \`ctx.tools.register(...)\` com handlers; \`ctx.skills.managed.reconcile(skillKey, companyId)\` no setup da empresa.
3. Host: na ativação do plugin, registra tools no \`PluginToolRegistry\` (já implementado no Paperclip core).
4. Atribua a skill reconciliada aos agentes (\`desiredSkills\` ou biblioteca da empresa).

Ver \`doc/plugins/PLUGIN_AUTHORING_GUIDE.md\` (Managed skills + agent tools) no repositório Paperclip.
`;

export const X_AGENT_SKILL_MARKDOWN = `# Social Networking — X / Twitter (agentes)

Use as ferramentas do plugin \`gauderp.social-networking\` para agendar publicações no X quando a conta da empresa estiver conectada.

## Pré-requisitos

1. Plugin instalado na instância (\`paperclipai plugin install\`).
2. Secret refs do app X configurados em **Instance settings**: \`xClientIdSecretRef\`, \`xClientSecretSecretRef\`.
3. Conta X conectada na UI (\`/:prefix/social-x\`) ou status \`connected\` via ferramenta de status.
4. Skill reconciliada: \`ctx.skills.managed.reconcile("x-agent", companyId)\`.

## Ferramentas (namespace \`gauderp.social-networking:\`)

| Ferramenta | Quando usar | Parâmetros |
|------------|-------------|------------|
| \`gauderp.social-networking:x-network-status\` | Antes de agendar; verificar OAuth | \`{}\` |
| \`gauderp.social-networking:schedule-x-post\` | Agendar texto | \`body\`, \`scheduledAt\` (ISO 8601 futuro) |
| \`gauderp.social-networking:list-x-scheduled-posts\` | Listar fila pendente | \`{}\` |
| \`gauderp.social-networking:cancel-x-scheduled-post\` | Cancelar post \`pending\` | \`postId\` |

## Rotas HTTP alternativas

- \`GET .../networks/x/status?companyId=...\`
- \`GET/POST/DELETE .../networks/x/scheduled-posts\`

## Fluxo mínimo

1. \`x-network-status\` → \`connected\`.
2. \`schedule-x-post\` com \`body\` e \`scheduledAt\`.
3. Job \`publish-scheduled\` (cron */5) publica quando vencido. Rate limit 429 mantém o post \`pending\` para retry no próximo ciclo.
`;

export const META_AGENT_SKILL_MARKDOWN = `# Social Networking — Meta (Facebook + Instagram)

Use as ferramentas do plugin \`gauderp.social-networking\` para agendar publicações na Pagina Facebook vinculada (Graph API) quando a conta Meta estiver conectada.

## Pré-requisitos

1. Plugin instalado na instância (\`paperclipai plugin install\`).
2. Secret refs do app Meta: \`metaAppIdSecretRef\`, \`metaAppSecretSecretRef\` em **Instance settings**.
3. Conta conectada na UI (\`/:prefix/social-meta\`) com Pagina FB e, se disponível, conta Instagram Business vinculada.
4. Skill reconciliada: \`ctx.skills.managed.reconcile("meta-agent", companyId)\`.

## Escopos OAuth (resumo)

\`pages_show_list\`, \`pages_read_engagement\`, \`pages_manage_posts\`, \`instagram_basic\`, \`instagram_content_publish\`, \`business_management\`.

Detalhes e dados persistidos: \`docs/META_OAUTH.md\` no pacote do plugin.

## Ferramentas (namespace \`gauderp.social-networking:\`)

| Ferramenta | Quando usar | Parâmetros |
|------------|-------------|------------|
| \`gauderp.social-networking:meta-network-status\` | Antes de agendar | \`{}\` |
| \`gauderp.social-networking:schedule-meta-post\` | Agendar texto para feed da Pagina FB | \`body\`, \`scheduledAt\` (ISO 8601 futuro) |
| \`gauderp.social-networking:list-meta-scheduled-posts\` | Listar fila | \`{}\` |
| \`gauderp.social-networking:cancel-meta-scheduled-post\` | Cancelar \`pending\` | \`postId\` |

## Fluxo mínimo

1. \`meta-network-status\` → \`connected\`.
2. \`schedule-meta-post\` com \`body\` e \`scheduledAt\`.
3. Job \`publish-scheduled\` publica no feed da Pagina Facebook quando vencido.

**Produção:** revisão [@SecurityEngineer](/CUS/agents/securityengineer) obrigatória (RGPD, escopos, retenção de tokens).
`;
