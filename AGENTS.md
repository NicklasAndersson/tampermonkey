## Git & deploy workflow
- Integration: commit and push directly to `main` (history is direct commits; no PRs, no CI).
- Commits: short messages, bump `@version` in the userscript header when behaviour changes.
- Before committing: `node --check <script>.js`.
- Deploy: pushing to `main` is the deploy (per README); Tampermonkey autoupdates from `@updateURL` on raw.githubusercontent.com, so the file must be on `main` and `@version` must be higher.
