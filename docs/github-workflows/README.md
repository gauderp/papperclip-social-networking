# GitHub Actions (copiar para `.github/workflows/`)

O agente nao consegue dar `git push` em arquivos sob `.github/workflows/` com o token OAuth atual (falta escopo `workflow`).

Copie estes arquivos para o caminho canonico no repositorio:

| Origem (este diretorio) | Destino no repo |
|-------------------------|-----------------|
| `ci.yml` | `.github/workflows/ci.yml` |
| `publish-npm.yml` | `.github/workflows/publish-npm.yml` |

No GitHub: **Actions → New workflow → set up a workflow yourself →** cole o conteudo de cada arquivo.

Depois configure o secret **`NPM_TOKEN`** e crie a tag `v0.1.0` para a primeira publicacao no npmjs.
