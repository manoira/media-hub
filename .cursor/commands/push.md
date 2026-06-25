---
name: push
description: Analyze local changes and choose how to push to production (with recommendation).
---

# Push till prod

Follow `.cursor/rules/push-workflow.mdc` and `docs/DEV-WORKFLOW.md`.

1. Run `git status`, `git diff`, `git diff --staged`, `git log -3 --oneline`, and `git status -sb`.
2. Classify changes (frontend / API / OpenAPI / DB schema / deploy config). Note blockers.
3. Summarize in Swedish what changed and which push strategy you recommend.
4. Use **AskQuestion** with push options (mark your recommendation first). Do not commit or push until the user chooses.
5. Execute the chosen path using the Git Safety Protocol.

After a successful push to `main`, mention that Vercel auto-deploys and suggest checking `/api/healthz` and `/api/watchlist` on https://media.emmyzettergren.se.
