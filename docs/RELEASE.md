# Release e npm

## Automático (GitHub Actions)

Arquivos em `.github/workflows/` (no clone local; podem precisar de push manual se o token OAuth não tiver escopo `workflow`):

| Workflow | Gatilho | Ação |
|----------|---------|------|
| `ci.yml` | push/PR `main`, tags `v*` | typecheck, test, build |
| `publish-npm.yml` | tag `v*`, `workflow_dispatch` | valida versão, CI, `npm publish` |

### Secret obrigatório

- **`NPM_TOKEN`** — token npm com publish no escopo `@gauderp`

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
