<#  P2-15 helper: labels, milestones M2 to M8, branch protection and the shared project board for BOTH repos.
    SAFE BY DEFAULT: without -Run it only PRINTS the gh commands. Read them, then run with -Run.
    Needs: GitHub CLI (gh), logged in (gh auth login). The board needs the "project" scope: gh auth refresh -s project
    Usage (PowerShell):
      .\setup_github.ps1 -Owner <github-user-or-org> -Backend <backend-repo> -Frontend <frontend-repo>           # preview
      .\setup_github.ps1 -Owner <github-user-or-org> -Backend <backend-repo> -Frontend <frontend-repo> -Run      # do it
    It never pushes code and never deletes anything. Existing labels/milestones are skipped.  #>
param(
  [Parameter(Mandatory)][string]$Owner,
  [Parameter(Mandatory)][string]$Backend,
  [Parameter(Mandatory)][string]$Frontend,
  [string]$Branch = "main",
  [string]$BoardTitle = "Scale Up FYP-1",
  [switch]$Run
)
$ErrorActionPreference = "Continue"

# Same labels in both repos (taken from the Tickets sheet of the ticket plan)
$labels = @(
  @("feature","1d76db","New functionality"), @("backend","0e8a16","FastAPI / worker / database code"),
  @("frontend","5319e7","Next.js app"), @("database","fbca04","Schema, migrations, queries"),
  @("ai-ml","d93f0b","NLP, embeddings, agent"), @("diagram","c5def5","UML / DFD / ERD / architecture diagrams"),
  @("docs","0075ca","Documents and report chapters"), @("devops","bfdadc","Repo, CI, deploy"),
  @("design","f9d0c4","Mockups and UI design"), @("test","e99695","Tests and evaluation"),
  @("demo","ff7619","Part of the live demo"), @("backlog","ededed","FYP-2 / later")
)
# Milestones M2 to M8 (due dates from the ticket plan). Descriptions are short and can be edited later.
$milestones = @(
  @("M2","2026-10-24","Mockups (React on Vercel) and backend architecture diagram"),
  @("M3","2026-11-07","Database, data upload, validation, cleaning and load; login; SRS and diagrams"),
  @("M4","2026-11-21","Sales, inventory and expense analytics and anomaly detection (API + dashboard)"),
  @("M5","2026-12-05","Feedback NLP: sentiment, topics, embeddings, semantic search"),
  @("M6","2026-12-19","AI agent with typed tools and the ask-a-question screen"),
  @("M7","2027-01-02","Tests, deployment, usability check, report chapters"),
  @("M8","2027-01-09","FYP-1 declaration checklist")
)

function Do([string]$what, [scriptblock]$cmd, [string]$shown) {
  if ($Run) { Write-Host "RUN  $what"; & $cmd } else { Write-Host "WOULD  $what`n       $shown" }
}

foreach ($repo in @($Backend, $Frontend)) {
  $full = "$Owner/$repo"
  Write-Host "`n=== $full ==="
  foreach ($l in $labels) {
    Do "label $($l[0])" { gh label create $l[0] --repo $full --color $l[1] --description $l[2] 2>&1 | Write-Host } "gh label create $($l[0]) --repo $full --color $($l[1])"
  }
  foreach ($m in $milestones) {
    Do "milestone $($m[0])" {
      gh api "repos/$full/milestones" -f title=$m[0] -f due_on="$($m[1])T23:59:59Z" -f description=$m[2] 2>&1 | Out-Null
    } "gh api repos/$full/milestones -f title=$($m[0]) -f due_on=$($m[1])T23:59:59Z"
  }
  # main branch: changes only through pull requests, 1 approval (needs the branch to exist; private repos need a paid plan)
  $protect = @{
    required_status_checks = $null; enforce_admins = $false
    required_pull_request_reviews = @{ required_approving_review_count = 1; dismiss_stale_reviews = $false }
    restrictions = $null; allow_force_pushes = $false; allow_deletions = $false
  } | ConvertTo-Json -Depth 5
  Do "protect branch $Branch" { $protect | gh api -X PUT "repos/$full/branches/$Branch/protection" --input - 2>&1 | Out-Null } "gh api -X PUT repos/$full/branches/$Branch/protection  (pull request + 1 approval, no force push)"
}

# ONE board for both repos
Write-Host "`n=== board ==="
Do "create board '$BoardTitle'" { gh project create --owner $Owner --title $BoardTitle --format json | Write-Host } "gh project create --owner $Owner --title '$BoardTitle'"
Write-Host @"

MANUAL STEPS (about 2 minutes, the CLI cannot do them safely):
  1. Open the board > Settings > Status field: make the options exactly  Backlog, To do, In progress, In review, Done.
  2. Link both repos: board > Settings > Manage access / 'Link a repository' (or: gh project link <number> --owner $Owner --repo $Backend).
  3. Turn on the built-in workflow 'Auto-add to project' for both repos so new issues land in Backlog.
  4. Take the screenshots the ticket asks for: branch protection page, Labels page, Milestones page, the board.
"@
