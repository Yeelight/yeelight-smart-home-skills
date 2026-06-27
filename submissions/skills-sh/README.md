# skills.sh Publication Record

Status: indexed and installable from the public GitHub repository.

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

Publishing model:

- skills.sh indexes GitHub repositories. There is no separate upload API needed for this release.
- Keep `skills/yeelight-smart-home/SKILL.md` and repository metadata current; skills.sh refreshes from the GitHub source.
