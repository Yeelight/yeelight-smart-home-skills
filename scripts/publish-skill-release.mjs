#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const skill = flag("--skill") || "yeelight-smart-home";
const version = flag("--version") || "0.1.0";
const source = flag("--source");
const releaseTag = flag("--tag") || `yeelight-skill-${skill}-v${version}`;
const dryRun = args.includes("--dry-run");

if (!source) fail("missing --source <release-output-root>");
const sourceRoot = path.resolve(source);
const githubReleaseRoot = path.join(sourceRoot, "channels", "github-release");
const pluginSource = path.join(sourceRoot, "channels", "codex-plugin", skill);
const stageSource = path.join(sourceRoot, "stage", skill);
for (const required of [githubReleaseRoot, pluginSource, stageSource]) {
  if (!fs.existsSync(required)) fail(`missing required source path: ${required}`);
}

const versionDir = path.join(root, "releases", skill, `v${version}`);
clean(versionDir);
copyDir(githubReleaseRoot, versionDir);
copyFile(path.join(sourceRoot, "validation-summary.json"), path.join(versionDir, "validation-summary.json"));
copyFile(path.join(sourceRoot, "package-manifest.json"), path.join(versionDir, "package-manifest.json"));
copyFile(path.join(sourceRoot, "channel-matrix.json"), path.join(versionDir, "channel-matrix.root.json"));
clean(path.join(root, "plugins", skill));
copyDir(pluginSource, path.join(root, "plugins", skill));
clean(path.join(root, "skills", skill));
copyDir(stageSource, path.join(root, "skills", skill));
writeMarketplaceFiles({ skill, version });
writeReadme({ skill, version, releaseTag });
writeStatusFiles({ skill, version, releaseTag });
run("python3", ["-m", "json.tool", ".github/plugin/marketplace.json"], { stdout: "ignore" });
run("python3", ["-m", "json.tool", ".claude-plugin/marketplace.json"], { stdout: "ignore" });
run("python3", ["-m", "json.tool", "platforms.json"], { stdout: "ignore" });
run("python3", ["-m", "json.tool", "submissions/skill-directory-submission-status.json"], { stdout: "ignore" });
run("shasum", ["-a", "256", "-c", "checksums.txt"], { cwd: versionDir });
if (!dryRun) {
  run("git", ["add", "."]);
  run("git", ["commit", "-m", `Release ${skill} skill v${version}`]);
  run("git", ["tag", "-a", releaseTag, "-m", `Release ${skill} skill v${version}`]);
}
console.log(JSON.stringify({ ok: true, skill, version, releaseTag, versionDir, dryRun }, null, 2));

function writeMarketplaceFiles({ skill, version }) {
  const description = "Control, organize, diagnose, design and answer product questions for a Yeelight smart home through the local yeelight-home Runtime.";
  writeJSON(path.join(root, ".github", "plugin", "marketplace.json"), {
    name: "yeelight-smart-home-skills",
    metadata: {
      description: "Yeelight Smart Home agent skills and plugins for Codex, GitHub Copilot, Claude, and Open Agent Skills consumers.",
      version,
      pluginRoot: "./plugins",
    },
    owner: { name: "Yeelight", email: "support@yeelight.com" },
    plugins: [{
      name: skill,
      source: skill,
      description,
      version,
      author: { name: "Yeelight" },
      repository: "https://github.com/Yeelight/yeelight-smart-home-skills",
      license: "Proprietary",
      keywords: ["yeelight", "smart-home", "lighting", "agent-skill", "codex", "copilot", "claude"],
    }],
  });
  writeJSON(path.join(root, ".claude-plugin", "marketplace.json"), {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "yeelight-smart-home-skills",
    description: "Yeelight Smart Home plugins and skills for Claude Code and compatible agent runtimes.",
    owner: { name: "Yeelight", email: "support@yeelight.com" },
    plugins: [{
      name: skill,
      description,
      version,
      author: { name: "Yeelight" },
      source: `./plugins/${skill}`,
      category: "productivity",
      homepage: `https://github.com/Yeelight/yeelight-smart-home-skills/tree/main/plugins/${skill}`,
    }],
  });
}

function writeReadme({ skill, version, releaseTag }) {
  fs.writeFileSync(path.join(root, "README.md"), `# Yeelight Smart Home Skills

Public release repository for Yeelight Smart Home agent skills.

## Published Skills

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| \`${skill}\` | \`${version}\` | \`yeelight-home >= 0.1.7\` | Agent Skill ZIP, Codex Plugin ZIP, Claude Skill ZIP, Copilot Skill ZIP |

## Release

- Repository: https://github.com/Yeelight/yeelight-smart-home-skills
- Latest release: https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/${releaseTag}
- Release evidence: \`releases/${skill}/v${version}/\`

## Install

### ClawHub / OpenClaw

The skill is published under the Yeelight publisher namespace:

\`\`\`sh
openclaw skills install @yeelight/${skill}
\`\`\`

- ClawHub page: https://clawhub.ai/yeelight/skills/${skill}
- Status: published and installable. The ClawHub publisher namespace is \`@yeelight\`; platform trust/official review is still pending.

### skills.sh

The repository is indexed by skills.sh:

\`\`\`sh
npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill ${skill}
\`\`\`

- skills.sh page: https://www.skills.sh/yeelight/yeelight-smart-home-skills/${skill}
- Status: indexed and installable, with visible security audit pass badges.

### Codex / Agent Plugin

Install from this repository marketplace metadata or download \`releases/${skill}/v${version}/${skill}-codex-plugin-v${version}.zip\`.

### Claude Skill ZIP

Download and upload \`releases/${skill}/v${version}/${skill}-claude-skill-v${version}.zip\`.

### GitHub Copilot Agent Skill

Use \`releases/${skill}/v${version}/${skill}-copilot-skill-v${version}.zip\`.

### Open Agent Skills

Use \`releases/${skill}/v${version}/${skill}-agent-skill-v${version}.zip\`.

### LobeHub Skills

First listing uses the web request form:

\`\`\`text
https://lobehub.com/zh/skills
\`\`\`

Click \`请求收录\` and submit:

\`\`\`text
https://github.com/Yeelight/yeelight-smart-home-skills
\`\`\`

After LobeHub collects the repository, use \`@lobehub/market-cli\` to claim ownership and publish later versions.

## Runtime Dependency

This skill depends on the separately installed \`yeelight-home\` runtime and invokes it through:

\`\`\`sh
yeelight-home invoke --stdin
\`\`\`

The runtime is not bundled in this repository.

## Bridge Adapter

Platforms that cannot install Skill ZIPs directly should use:

\`\`\`text
adapters/yeelight-skill-bridge/
\`\`\`

The bridge exposes \`GET /health\`, \`GET /openapi.json\`, \`POST /invoke\` and \`POST /mcp\`.
It calls only \`yeelight-home invoke --stdin\`; the runtime remains responsible for auth, policy and confirmation gates.

## Platform Status

See \`platforms.json\` and \`submissions/\` for platform-specific distribution status and submission kits.

## Verify

\`\`\`sh
cd releases/${skill}/v${version}
shasum -a 256 -c checksums.txt
\`\`\`

Full publication asset check:

\`\`\`sh
node scripts/verify-publication-assets.mjs --skill ${skill} --version ${version}
\`\`\`

Third-party directory submission status and evidence are tracked in \`platforms.json\` and \`submissions/skill-directory-submission-status.json\`.

## Reusable Release Flow

For later Yeelight skills or new versions:

1. Build and verify from the source repository's generic Skill release pipeline.
2. Refresh this public distribution repository with \`scripts/publish-skill-release.mjs\`.
3. Run \`node scripts/verify-publication-assets.mjs --skill <skill-id> --version <x.y.z>\`.
4. Publish native Skill directories through platform CLI/form flows.
5. Publish API/MCP-only platforms through the bridge adapter and verify installed-copy or deployed-endpoint smoke.
`, "utf8");
}

function writeStatusFiles({ skill, version, releaseTag }) {
  const releaseUrl = `https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/${releaseTag}`;
  updateJSON(path.join(root, "platforms.json"), (value) => {
    for (const platform of value.platforms || []) {
      if (platform.id === "github-release") {
        platform.version = version;
        platform.releaseTag = releaseTag;
        platform.releaseUrl = releaseUrl;
        platform.status = "published";
      }
      if (platform.id === "claude-skill-zip") {
        platform.version = version;
        platform.assetPath = `releases/${skill}/v${version}/${skill}-claude-skill-v${version}.zip`;
      }
      if (platform.id === "github-copilot-cli-plugin-marketplace") {
        platform.version = version;
      }
      if (platform.id === "claude-code-plugin-marketplace") {
        platform.version = version;
      }
    }
    return value;
  });
  updateJSON(path.join(root, "submissions", "skill-directory-submission-status.json"), (value) => {
    value.skill = {
      ...(value.skill || {}),
      id: skill,
      version,
      repository: "https://github.com/Yeelight/yeelight-smart-home-skills",
      release: releaseUrl,
    };
    return value;
  });
}

function flag(name) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const equal = args.find((item) => item.startsWith(`${name}=`));
  return equal ? equal.slice(name.length + 1) : "";
}
function clean(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
}
function copyDir(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}
function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function updateJSON(file, updater) {
  if (!fs.existsSync(file)) return;
  writeJSON(file, updater(JSON.parse(fs.readFileSync(file, "utf8"))));
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", options.stdout || "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0) fail(`${command} ${commandArgs.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
