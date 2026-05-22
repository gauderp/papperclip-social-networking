# Release e npm

## Automático (GitHub Actions)

Arquivos canonicos em `.github/workflows/`. Se o push do agente falhar, use as copias em [`docs/github-workflows/`](./github-workflows/README.md) e cole pela UI do GitHub.

| Workflow | Gatilho | Ação |
|----------|---------|------|
| `ci.yml` | push/PR `main`, tags `v*` | typecheck, test, build |
| `publish-npm.yml` | tag `v*`, `workflow_dispatch` | valida versão, CI, `npm publish` |

### Pré-requisitos npmjs (uma vez)

1. Criar a **organização ou usuário** com escopo `@gauderp` em [npmjs.com](https://www.npmjs.com/org/create) (erro `Scope not found` = escopo ainda não existe).
2. O usuário do **`NPM_TOKEN`** deve ser membro da org com permissão de **publish** em `@gauderp`.

### Secret obrigatório (GitHub)

- **`NPM_TOKEN`** — token npm (Classic: `publish`; Granular: read/write em Packages para `@gauderp`)

### Tag de release

A tag deve coincidir com `package.json` (`v0.1.0` ↔ `"version": "0.1.0"`).

```bash
git tag v0.1.0
git push origin v0.1.0

Repositorio: https://github.com/gauderp/papperclip-social-networking
```

## Primeira publicação

1. Configurar `NPM_TOKEN` no repositório GitHub.
2. Garantir que os workflows estão em `main` (push ou colar YAML no GitHub UI).
3. Criar tag `v0.1.0` (versão atual do pacote).
