# @gauderp/social-networking

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

Código-fonte: [gauderp/social-networking](https://github.com/gauderp/social-networking)

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
git clone https://github.com/gauderp/social-networking.git
cd social-networking
pnpm install && pnpm run build
paperclipai plugin install "$(pwd)"
```

No Windows (PowerShell):

```powershell
git clone https://github.com/gauderp/social-networking.git
cd social-networking
pnpm install; pnpm run build
paperclipai plugin install (Resolve-Path .).Path
```

### npm (opcional, após publicação)

Quando o pacote estiver publicado no npm:

```bash
paperclipai plugin install @gauderp/social-networking@0.1.0
```

`prepublishOnly` executa o build antes de `npm publish`.

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
