# Executar no clone com gh autenticado (escopo workflow) e NPM_TOKEN no repo.
# Uso: .\scripts\setup-workflows-and-release.ps1 [-Version 0.1.0] [-SkipCopy]
param(
  [string]$Version = "0.1.0",
  [switch]$SkipCopy
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipCopy) {
  New-Item -ItemType Directory -Force -Path ".github/workflows" | Out-Null
  Copy-Item -Force "docs/github-workflows/ci.yml" ".github/workflows/ci.yml"
  Copy-Item -Force "docs/github-workflows/publish-npm.yml" ".github/workflows/publish-npm.yml"
  git add .github/workflows/ci.yml .github/workflows/publish-npm.yml
  git commit -m "chore: add CI and npm publish workflows"
}

git push origin main
git tag "v$Version"
git push origin "v$Version"
Write-Host "Done. Verifique Actions e npm view @gaud_erp/social-networking@$Version"
