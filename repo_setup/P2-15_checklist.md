# P2-15 Repository setup: what is done and what Alishba must do herself

| Acceptance criterion | Where it comes from | Status |
| --- | --- | --- |
| README: summary, stack, how to run, mockup link (Vercel) in BOTH repos | `README_backend.md`, `README_frontend.md` | Written. Fill the 3 placeholders: `<VERCEL_MOCKUP_URL>`, `<BACKEND_REPO_URL>`, `<FRONTEND_REPO_URL>`. Frontend commands use `.env.example`: the frontend repo must contain one with `NEXT_PUBLIC_API_URL`. |
| main branch protected; work via pull requests | `setup_github.ps1` | Script ready, NOT run (needs your GitHub login). Private repos need a paid plan for branch protection; if the API answers 403, make the repos public or use a ruleset in the web UI. |
| Labels and milestones M2 to M8 in both repos | `setup_github.ps1` | Ready, not run. Labels come from the Tickets sheet; milestone dates from the plan (M2 24-Oct ... M8 09-Jan-27). Milestone descriptions are my short wording: edit if sir's PDF says otherwise. |
| Board columns Backlog, To do, In progress, In review, Done (one board, both repos) | `setup_github.ps1` + 3 manual steps printed by it | The script creates the board; setting the 5 Status options and linking the repos are manual (2 minutes). |
| Evidence: README in both repos; screenshots of branch protection, labels, milestones M2-M8, board | you | Take them after running. |

Run order: 1) `gh auth login` (and `gh auth refresh -s project`), 2) run the script without `-Run` and read the output, 3) run with `-Run`, 4) do the manual board steps, 5) screenshots, 6) PR with the READMEs.
Not verified: I could not run `gh` against your GitHub here, so the script has only been read through, not executed. Run the preview first.
