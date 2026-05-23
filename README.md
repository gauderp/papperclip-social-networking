# @gaud_erp/social-networking

Plugin Paperclip para gerenciar redes sociais no Gaud ERP — conexão de contas, agendamento de posts, histórico e métricas. Slice inicial: **LinkedIn**.

## Funcionalidades

- Módulo **Social Networking** na sidebar da empresa
- Páginas por rede (LinkedIn no slice inicial)
- Conexão de conta, agendamento de posts, histórico e métricas
- Job agendado `publish-scheduled` (a cada 5 minutos)

## Requisitos

- Instância Paperclip com runtime de plugins
- Secret refs do app LinkedIn configurados em **Instance settings** do plugin (nunca commitar tokens)

## Repositório

Código-fonte: [gauderp/papperclip-social-networking](https://github.com/gauderp/papperclip-social-networking) (redirect de `social-networking`)

## Desenvolvimento local

```bash
pnpm install
pnpm run dev
paperclipai plugin install /absolute/path/to/social-networking
paperclipai plugin inspect gauderp.social-networking
```

## Instalar na instância Paperclip

### Clone local

```bash
git clone https://github.com/gauderp/papperclip-social-networking.git
cd papperclip-social-networking
pnpm install && pnpm run build
paperclipai plugin install "$(pwd)"
```

No Windows (PowerShell):

```powershell
git clone https://github.com/gauderp/papperclip-social-networking.git
cd papperclip-social-networking
pnpm install; pnpm run build
paperclipai plugin install (Resolve-Path .).Path
```

### npm (recomendado em produção)

Após a primeira publicação no [npmjs](https://www.npmjs.com/package/@gaud_erp/social-networking):

```bash
paperclipai plugin install @gaud_erp/social-networking@0.1.0
```

`prepublishOnly` executa o build antes de `npm publish`.

## Releases e publicação no npm

Cada **tag `v*`** no GitHub dispara o workflow [Publish npm](.github/workflows/publish-npm.yml), que valida CI, confere se a tag bate com `package.json` e executa `npm publish --access public --provenance`.

### Pré-requisitos (uma vez, no repositório GitHub)

1. Usar o escopo npm **`@gaud_erp`** ([org no npmjs](https://www.npmjs.com/package/@gaud_erp)).
2. Gerar um **Access Token** de publish (Classic: scope `publish`; Granular: Packages read/write para `@gaud_erp`).
3. Adicionar o secret **`NPM_TOKEN`** em *Settings → Secrets and variables → Actions* do repo `gauderp/social-networking`.

### Fluxo de release

```bash
# 1. Atualizar versão em package.json (ex.: 0.1.1)
# 2. Commit na main
git add package.json pnpm-lock.yaml
git commit -m "chore: release v0.1.1"
git push origin main

# 3. Tag alinhada à versão do package.json
git tag v0.1.1
git push origin v0.1.1
```

O workflow publica `@gaud_erp/social-networking@<versão>` no npmjs. Para republicar a mesma versão, é preciso bump ou `npm unpublish` (não recomendado em produção).

### Publicação manual (fallback)

```bash
pnpm install
pnpm run typecheck && pnpm test && pnpm run build
npm publish --access public
# requer npm login com permissão no escopo @gaud_erp
```

## Build e verificação

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

CI no GitHub Actions executa os mesmos passos em cada push/PR para `main`.

## Rotas UI

| Rota | Descrição |
|------|-----------|
| `/:prefix/social` | Hub das redes |
| `/:prefix/social-linkedin` | LinkedIn — conexão, agendamento, histórico |

## Capabilities para agentes Paperclip

Após `paperclipai plugin install`, o host registra as **tools** declaradas no manifest (`PluginToolRegistry`). Para cada empresa, reconcilie a skill gerenciada e atribua-a aos agentes de engenharia:

```bash
# Via UI do plugin: action setup-company-capabilities (settings)
# Ou via worker SDK: ctx.skills.managed.reconcile("linkedin-agent", companyId)
```

| Superfície | Uso |
|------------|-----|
| `manifest.tools[]` + `ctx.tools.register` | Descoberta na ativação do plugin; execução via `gauderp.social-networking:<tool>` |
| `manifest.skills[]` + `skills.managed` | Documentação operacional na biblioteca da empresa (`plugin/gauderp-social-networking/linkedin-agent`) |
| `apiRoutes` (`auth: board-or-agent`) | Fallback HTTP quando o adapter ainda não expõe plugin tools |

Detalhes: `src/agent-capabilities.ts` e [PLUGIN_AUTHORING_GUIDE](https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_AUTHORING_GUIDE.md) (Managed skills + agent tools).

## Agentes Paperclip (descoberta na instalação)

Após `paperclipai plugin install`, o host registra as **tools** do manifest no `PluginToolRegistry` e o worker reconcilia a **managed skill** `linkedin-agent` para cada empresa (`companies.read`).

| Superfície | O que o agente recebe |
|------------|------------------------|
| Tools | `gauderp.social-networking:linkedin-network-status`, `:publish-linkedin-now`, `:schedule-linkedin-post`, `:list-linkedin-scheduled-posts`, `:cancel-linkedin-scheduled-post` |
| Skill | `plugin/gauderp-social-networking/linkedin-agent` — ver `src/agent-capabilities.ts` |
| HTTP | Rotas `board-or-agent` em `/api/plugins/gauderp.social-networking/api/...` |

Reconciliar manualmente por empresa (UI/action): `setup-company-capabilities` com `companyId`.

Padrão para novos plugins: manifest `tools[]` + `skills[]`, capabilities `agent.tools.register` + `skills.managed`, handlers em `ctx.tools.register`, reconcile no `setup` — detalhes em `src/agent-capabilities.ts`.

## Manifest

- Plugin id: `gauderp.social-networking`
- Capabilities: UI, database namespace, jobs, outbound HTTP, secret refs, **agent tools**, **managed skills**, **agent.tools.register**, **skills.managed**
- Agent tools: `linkedin-network-status`, `publish-linkedin-now`, `schedule-linkedin-post`, `list-linkedin-scheduled-posts`, `cancel-linkedin-scheduled-post`
