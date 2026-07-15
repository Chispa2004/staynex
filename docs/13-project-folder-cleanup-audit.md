# Project Folder Cleanup Audit

Audit date: 2026-07-15

Project root:

`C:\Users\chimi\OneDrive\Documentos\New project`

Target archive folder:

`C:\Users\chimi\OneDrive\Documentos\Archived Projects`

Excluded project:

`C:\Users\chimi\OneDrive\Documentos\staynex-website`

## Scope

This audit reviews untracked folders inside the Staynex project root and classifies whether they belong to the core Staynex operating system or should be moved outside the repository root.

No files are deleted. Moves are intended to be reversible and documented.

## Classification Labels

- A: Core Staynex.
- B: Real module integrated in Staynex.
- C: Independent project related to Staynex.
- D: Independent project not related to Staynex.
- E: Doubtful / manual review required.

## Pre-move Findings

| Folder | Classification | Relationship with Staynex | References found | Recommended action |
| --- | --- | --- | --- | --- |
| `football-betting-analyzer/` | D | Independent local football odds/value-bet analysis tool. Separate backend/frontend/workspaces. Not part of hotel OS. | No references from tracked Staynex core. Own `package.json`, `README.md`, backend/frontend, logs, SQLite data and `node_modules`. | Move to `Archived Projects`. |
| `sports-intelligence-platform/` | D | Independent sports intelligence SaaS foundation. Not part of hotel OS. | No references from tracked Staynex core. Own monorepo, packages, apps, Docker, Prisma/Auth stack. | Move to `Archived Projects`. |
| `staynex-lead-intelligence/` | C | Staynex-related lead/prospecting SaaS MVP, but not integrated into the Staynex operating system. | No references from tracked Staynex core. Own workspaces, apps, packages and README. | Move to `Archived Projects`. |
| `staynex-lead-machine/` | C | Staynex-related lead enrichment tool. Separate CLI/data pipeline, not part of product runtime. | No references from tracked Staynex core. Own `package.json`, `README.md`, `input/`, `output/`, `src/`. | Move to `Archived Projects`. |
| `staynex-sales-copilot/` | C | Staynex-related sales/prospecting helper. Separate tool, not part of product runtime. | No references from tracked Staynex core. Own `package.json`, README, data/output/prompts/services/src. Contains a local `.env` file that must not be committed. | Move to `Archived Projects`. |
| `docs/n8n-workflows/` | C | Related to learning/selling automation workflows, but not referenced by the core Staynex docs or runtime. Not part of the technical product documentation set. | Only referenced in `docs/12-github-audit.md` as an untracked folder. Contains importable n8n JSON workflows and README. | Move to `Archived Projects` as a standalone folder, preserving its name/path context. |

## Core Staynex Folders To Keep

The following must remain in `New project`:

- `dashboard/`
- `src/`
- `scripts/`
- `supabase/`
- `docs/` technical documentation, excluding the untracked `docs/n8n-workflows/` experiment folder
- `package.json`
- `package-lock.json`
- `.env.example`
- `.gitignore`
- `README.md`
- tracked SQL/migrations/configuration files

## Reference Checks Performed

Commands/checks included:

```bash
git status --short
git ls-files -- <folder>
git grep -n "<folder names>" -- .
rg "<folder names>" README.md package.json dashboard src scripts supabase docs --glob "!docs/n8n-workflows/**"
rg "New project|staynex-backend|staynex-dashboard|dashboard/lib|src/services|supabase/sql" <candidate folders>
```

Summary:

- Candidate folders are untracked by Git.
- Candidate folders are not imported by Staynex core.
- Candidate folders are not referenced by root package scripts.
- Candidate folders have their own project metadata or standalone workflow documentation.
- No nested `.git` folders were found in the candidates.

## Pre-move Risks

1. `staynex-sales-copilot/` contains a local `.env`; moving is safer than leaving it as an untracked folder in the Staynex root.
2. Some candidate folders contain large `node_modules` or build artifacts. Moving may take time because OneDrive has to process many files.
3. `docs/12-github-audit.md` mentions these folders as untracked at audit time. That is historical context, not a runtime dependency.
4. Do not use `git add .` before or after cleanup. Use selective staging.

## Planned Safe Move Actions

Create archive root if missing:

```powershell
New-Item -ItemType Directory -Path "C:\Users\chimi\OneDrive\Documentos\Archived Projects" -Force
```

Move high-confidence independent folders only:

```powershell
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\football-betting-analyzer" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\football-betting-analyzer"
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\sports-intelligence-platform" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\sports-intelligence-platform"
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\staynex-lead-intelligence" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-lead-intelligence"
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\staynex-lead-machine" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-lead-machine"
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\staynex-sales-copilot" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-sales-copilot"
Move-Item -LiteralPath "C:\Users\chimi\OneDrive\Documentos\New project\docs\n8n-workflows" -Destination "C:\Users\chimi\OneDrive\Documentos\Archived Projects\n8n-workflows"
```

If a destination exists, use a timestamp suffix instead of overwriting.

## Post-move Results

Completed on 2026-07-15.

### Folders Moved

The following folders were moved out of the Staynex project root and into the archive folder without overwriting existing destinations:

| Source | Destination | Result |
| --- | --- | --- |
| `football-betting-analyzer/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\football-betting-analyzer` | Moved. |
| `sports-intelligence-platform/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\sports-intelligence-platform` | Moved. |
| `staynex-lead-intelligence/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-lead-intelligence` | Moved. |
| `staynex-lead-machine/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-lead-machine` | Moved. |
| `staynex-sales-copilot/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\staynex-sales-copilot` | Moved. |
| `docs/n8n-workflows/` | `C:\Users\chimi\OneDrive\Documentos\Archived Projects\n8n-workflows` | Moved as a standalone archived workflow folder. |

No destination conflicts were detected, so no timestamp suffix was required.

### Folders Kept

The Staynex core folders and technical assets remain in the project root:

- `dashboard/`
- `src/`
- `scripts/`
- `supabase/`
- `docs/` technical documentation
- root configuration files
- package manifests
- README and project documentation

### Manual Review Items

No candidate folder remained classified as doubtful after reference analysis.

The cleanup did not move ignored local/dependency artifacts such as `.env`, `node_modules/`, `.npm-cache/`, `.next` caches, or other ignored files. These are controlled by `.gitignore` and were outside the requested independent-project cleanup scope.

### References Corrected

No runtime imports, package scripts, or build references needed correction.

`docs/12-github-audit.md` still mentions the moved folders as historical untracked findings from the GitHub audit. That is acceptable audit context and not a live dependency.

### Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| Candidate folders absent from root | Passed | All six moved folders are no longer present in `New project`. |
| Archive destinations present | Passed | All six folders are present under `Archived Projects`. |
| `git status --short` | Passed | The independent project folders no longer appear as untracked. |
| `npm run check:syntax` | Passed | Syntax validation completed successfully. |
| `npm run test:permissions` | Passed | Permission tests completed successfully. |
| `npm run test:automations` | Passed | Automation tests completed successfully with `SEND_AUTOMATIONS=false`. |
| `npm run test:pms:ubikos` | Passed | Ubikos remains sandbox/read-only and not configured for live API use. |
| `npm run dashboard:build` | Passed | First run hit a OneDrive/Next cache readlink issue; after running the existing dashboard cache cleanup, the build passed. |

### Final Git Status Summary

After cleanup, only Staynex documentation and README changes remain pending:

```text
 M README.md
?? docs/00-project-overview.md
?? docs/01-current-status.md
?? docs/02-technical-architecture.md
?? docs/03-tech-stack.md
?? docs/04-features.md
?? docs/05-pms-integration.md
?? docs/06-automations.md
?? docs/07-security-and-permissions.md
?? docs/08-deployment.md
?? docs/09-testing.md
?? docs/10-roadmap.md
?? docs/11-known-limitations.md
?? docs/12-github-audit.md
?? docs/13-project-folder-cleanup-audit.md
```

### Recommended Commit Scope

Stage only the Staynex documentation and README updates:

```powershell
git add README.md docs/00-project-overview.md docs/01-current-status.md docs/02-technical-architecture.md docs/03-tech-stack.md docs/04-features.md docs/05-pms-integration.md docs/06-automations.md docs/07-security-and-permissions.md docs/08-deployment.md docs/09-testing.md docs/10-roadmap.md docs/11-known-limitations.md docs/12-github-audit.md docs/13-project-folder-cleanup-audit.md
git commit -m "docs: audit staynex repository and cleanup project root"
git push origin main
```

Do not use `git add .` for this cleanup because the workspace still contains ignored local artifacts and environment-specific files.
