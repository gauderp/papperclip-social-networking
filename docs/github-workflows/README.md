# GitHub Actions — ativar no repositório (2 minutos)

O token OAuth do agente **não tem escopo `workflow`**. O GitHub **rejeita** `git push` e API em `.github/workflows/*`. Os YAML abaixo já estão validados; é preciso colá-los no repo **uma vez** (UI ou CLI com escopo `workflow`).

## Opção A — GitHub UI (recomendado, ~2 min)

### 1) Workflow CI

1. Abra: [Criar `.github/workflows/ci.yml`](https://github.com/gauderp/papperclip-social-networking/new/main/.github/workflows/ci.yml)
2. Cole o conteúdo de: [ci.yml (raw)](https://raw.githubusercontent.com/gauderp/papperclip-social-networking/main/docs/github-workflows/ci.yml)
3. **Commit to main**

### 2) Workflow Publish npm

1. Abra: [Criar `.github/workflows/publish-npm.yml`](https://github.com/gauderp/papperclip-social-networking/new/main/.github/workflows/publish-npm.yml)
2. Cole o conteúdo de: [publish-npm.yml (raw)](https://raw.githubusercontent.com/gauderp/papperclip-social-networking/main/docs/github-workflows/publish-npm.yml)
3. **Commit to main**

### 3) Secret e release

1. Confirme o secret **`NPM_TOKEN`** em *Settings → Secrets and variables → Actions*.
2. Crie a release/tag **`v0.1.0`** em *Releases → Draft a new release* (target `main`).
3. Verifique em *Actions* os runs **CI** e **Publish npm**; depois `npm view @gauderp/social-networking version` → `0.1.0`.

## Opção B — CLI (escopo `workflow`)

```powershell
gh auth refresh -h github.com -s workflow
git clone https://github.com/gauderp/papperclip-social-networking.git
cd papperclip-social-networking
.\scripts\setup-workflows-and-release.ps1
```

## Arquivos de referência

| Arquivo | Uso |
|---------|-----|
| `ci.yml` | typecheck, test, build em push/PR |
| `publish-npm.yml` | `npm publish` em tag `v*` |
