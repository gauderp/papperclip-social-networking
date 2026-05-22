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

## Manifest

- Plugin id: `gauderp.social-networking`
- Capabilities: UI, database namespace, jobs, outbound HTTP, secret refs
