# LobeHub Skills Submission Record

Status: first-listing request form ready; Cloudflare human verification is required before browser submission can complete.

LobeHub Skills entrypoint:

```text
https://lobehub.com/zh/skills
https://lobehub.com/skills
```

LobeHub presents itself as an Agent SKILLs marketplace for `SKILL.md` bundles. The visible first-listing flow on the Skills page is:

```text
请求收录 -> 请求收录 Skill -> GitHub 仓库地址 -> 提交
```

Submit this repository URL:

```text
https://github.com/Yeelight/yeelight-smart-home-skills
```

The form text says the skill will be added to the marketplace after a brief review and automated workflow.

Browser submission attempt:

- real Chrome reached the `请求收录 Skill` modal;
- the modal then showed a Cloudflare Turnstile checkbox;
- the `提交` button stayed disabled until human verification is completed;
- headless browser automation was blocked by Vercel Security Checkpoint Code 21.

I did not bypass the human verification. Complete the checkbox in the real browser session, then submit the GitHub repository URL above.

After first listing, the official Marketplace CLI can be used for ownership and later version publishing. It is available as `@lobehub/market-cli`.

Verified CLI facts:

```sh
npx -y @lobehub/market-cli --help
npx -y @lobehub/market-cli skill --help
npx -y @lobehub/market-cli skill publish --help
npx -y @lobehub/market-cli login --help
npx -y @lobehub/market-cli github --help
```

The `skill publish` command packages the directory passed by `--dir` and requires:

- `SKILL.md` at the package root;
- a skill identifier from `SKILL.md` frontmatter `identifier:` or `--identifier <id>`;
- an authenticated LobeHub user session;
- ownership of the target identifier before publishing a version.

Observed unauthenticated behavior:

```text
lhm skill list
Not logged in. Run `lhm login` first.

lhm skills search --q yeelight --locale zh-CN --output json
No credentials found. Run `lhm register` first or set MARKET_CLIENT_ID and MARKET_CLIENT_SECRET.
```

The release-ready package for LobeHub is the canonical Skill directory:

```text
skills/yeelight-smart-home/
```

After the repository has been collected and listed, bind it to the official Yeelight account if needed:

```sh
npx -y @lobehub/market-cli login
npx -y @lobehub/market-cli github connect
npx -y @lobehub/market-cli skill claim yeelight-smart-home
```

For later releases of this or any other Yeelight skill, reuse the same command after the package directory has been regenerated and verified:

```sh
npx -y @lobehub/market-cli skill publish --identifier <skill-id> --dir skills/<skill-id>
```

Current blockers:

- Cloudflare Turnstile human verification must be completed in the browser form before first-listing submission;
- after listing, an official Yeelight LobeHub account should connect GitHub and claim the identifier;
- no CLI upload was attempted because the first-listing form is the visible submission path for new Skills.

Required post-publish validation:

```sh
npx -y @lobehub/market-cli skills view yeelight-smart-home --locale zh-CN --output json
npx -y @lobehub/market-cli skills install yeelight-smart-home --dir /tmp/lobehub-yeelight-smoke --agent codex
```

After install, run an installed-copy smoke with the local Runtime, using `sh scripts/invoke.sh` if the platform does not preserve executable bits:

```sh
printf '{"contractVersion":"1.0","requestId":"lobehub-install-smoke","locale":"zh-CN","utterance":"列出家庭","intent":"entity.list"}' \
  | sh /tmp/lobehub-yeelight-smoke/yeelight-smart-home/scripts/invoke.sh
```
