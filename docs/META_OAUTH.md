# Meta (Facebook + Instagram) — OAuth Graph e dados persistidos

Documentacao do slice `network_key: meta` no plugin `@gauderp/social-networking`.

## Escopos OAuth solicitados

| Escopo | Uso |
|--------|-----|
| `pages_show_list` | Listar Paginas Facebook do utilizador |
| `pages_read_engagement` | Ler metricas basicas (futuro) |
| `pages_manage_posts` | Publicar no feed da Pagina |
| `instagram_basic` | Ler perfil IG Business vinculado |
| `instagram_content_publish` | Publicacao IG (reservado; agendamento atual usa feed FB) |
| `business_management` | Acesso a activos Business Manager |

Redirect URI: `https://<host>/<companyPrefix>/social-meta` (ex.: `http://127.0.0.1:3100/CUS/social-meta`).

## Fluxo OAuth

1. `meta-start-oauth` — URL Facebook Login com state HMAC (reutiliza helper LinkedIn).
2. Callback com `code` + `state` → `meta-complete-oauth`.
3. Troca `code` → token de curta duracao → token de utilizador long-lived (`fb_exchange_token`).
4. `GET /me/accounts` — primeira Pagina com `instagram_business_account`, senao primeira Pagina.
5. Grava em `network_accounts` (`network_key = meta`, `status = connected`).

## Dados persistidos (`metadata_json`)

Campo JSON na tabela `network_accounts` (namespace do plugin):

| Campo | Descricao | RGPD |
|-------|-----------|------|
| `userAccessToken` | Token long-lived do utilizador Meta | Dado de autenticacao — minimizar retencao; revogar ao desconectar |
| `expiresAt` | Expiracao do user token (ISO 8601) | Metadado tecnico |
| `scope` | Escopos concedidos | Auditoria |
| `pageId` | ID da Pagina Facebook seleccionada | Identificador de conta ligada |
| `pageName` | Nome da Pagina | Exibicao na UI |
| `pageAccessToken` | Token da Pagina (publicacao) | Segredo — necessario para `/{page-id}/feed` |
| `igBusinessAccountId` | ID conta IG Business (se existir) | Identificador |
| `igUsername` | Username IG (se existir) | Exibicao |

**Nao** persistimos: email do utilizador Meta, lista completa de paginas, media binaria.

## Publicacao agendada

- Fila: `scheduled_posts` com `network_key = meta`.
- Job `publish-scheduled` (cron `*/5`): `POST /{pageId}/feed` com `message` e `pageAccessToken`.
- ID externo devolvido pela Graph API guardado em `scheduled_posts.external_post_id`.

## Sandbox e producao

- **Sandbox:** app Meta em modo desenvolvimento + utilizadores de teste + Pagina de teste.
- **Producao:** exige App Review Meta para escopos de pagina/IG e revisao interna [SecurityEngineer](/CUS/agents/securityengineer) (RGPD, retencao, revogacao).

## Configuracao da instancia

| Setting | Secret ref |
|---------|------------|
| App ID | `metaAppIdSecretRef` |
| App Secret | `metaAppSecretSecretRef` |
