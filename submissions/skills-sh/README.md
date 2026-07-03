# skills.sh Publication Record

Status: indexed and installable from the public GitHub repository.

Current GitHub release version: `0.1.9`.

Public page:

```text
https://www.skills.sh/yeelight/yeelight-smart-home-skills/yeelight-smart-home
```

Install:

```sh
npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
```

Verification performed:

- Public page renders the `yeelight-smart-home` Skill from `yeelight/yeelight-smart-home-skills`.
- The page exposes the install command above.
- The page shows security audit badges for Gen Agent Trust Hub, Socket and Snyk as `Pass`.
- Real install smoke passed in a clean temporary directory:

  ```sh
  HOME=/tmp/skills-sh-yeelight-smoke npx --yes skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
  ```

  The installed `SKILL.md` was present under `.agents/skills/yeelight-smart-home`.
- After the `0.1.1` GitHub release, `npx --yes skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home --copy --agent codex -y` installed the current GitHub `main` copy and reported security assessments as `Safe`, `0 alerts`, and `Low Risk`.
- Installed-copy hashes for the two updated reference files matched the GitHub release package:
  - `references/memory-and-personalization.md`: `5f0d744dec3e45961d7da1d15b1cb324698e7b0c20d990e8209a6ea1e13bd06c`
  - `references/recommendations.md`: `2869582b421bce1493d3c14cf7b84e312970c986b67b29ca1ac990e7f0808243`
- After the `0.1.9` GitHub release, `npx --yes skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home` installed from GitHub `main` and reported security assessments as `Safe`, `0 alerts`, and `Low Risk`.
- The installed copy included `scripts/invoke`, `scripts/invoke.sh`, `scripts/invoke.ps1`, `scripts/product-select.mjs`, and `scripts/runtime-manifest.json`; `scripts/invoke` matched the repository copy.

Publishing model:

- skills.sh indexes GitHub repositories. There is no separate upload API needed for this release.
- Keep `skills/yeelight-smart-home/SKILL.md` and repository metadata current; skills.sh refreshes from the GitHub source.
