#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const templatesRoot = path.join(root, "templates");
const args = process.argv.slice(2);
const skill = flag("--skill") || "yeelight-smart-home";
const version = flag("--version") || "0.1.0";
const source = flag("--source");
const releaseTag = flag("--tag") || `yeelight-skill-${skill}-v${version}`;
const skillhubSlug = flag("--skillhub-slug") || (skill === "yeelight-smart-home" ? "yeelight-smart-home-official" : skill);
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
clean(path.join(root, "skills-clawhub", skill));
copyDir(stageSource, path.join(root, "skills-clawhub", skill));
prepareClawHubSkillDirectory(path.join(root, "skills-clawhub", skill));
writeMarketplaceFiles({ skill, version });
writeReadme({ skill, version, releaseTag, skillhubSlug });
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

function writeReadme({ skill, version, releaseTag, skillhubSlug }) {
  const repositoryUrl = "https://github.com/Yeelight/yeelight-smart-home-skills";
  const repositoryInstallUrl = "https://github.com/yeelight/yeelight-smart-home-skills";
  const releaseUrl = `${repositoryUrl}/releases/tag/${releaseTag}`;
  const values = {
    repositoryInstallUrl,
    repositoryUrl,
    releasePath: `releases/${skill}/v${version}`,
    releaseTag,
    releaseUrl,
    skill,
    skillTitle: titleFromSlug(skill),
    skillhubSlug,
    version,
  };
  fs.writeFileSync(path.join(root, "README.md"), renderTemplate("README.md.tpl", values), "utf8");
  fs.writeFileSync(path.join(root, "README.zh-CN.md"), renderTemplate("README.zh-CN.md.tpl", values), "utf8");
}

function renderTemplate(name, values) {
  let text = fs.readFileSync(path.join(templatesRoot, name), "utf8");
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{{${key}}}`, String(value));
  }
  const missing = text.match(/\{\{[A-Za-z0-9_-]+\}\}/g);
  if (missing) fail(`unresolved README template variables in ${name}: ${[...new Set(missing)].join(", ")}`);
  return text;
}

function titleFromSlug(value) {
  return String(value)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
function prepareClawHubSkillDirectory(skillRoot) {
  fs.rmSync(path.join(skillRoot, "scripts", "invoke"), { force: true });
  rewriteExtensionlessInvokeReferences(skillRoot);
}
function rewriteExtensionlessInvokeReferences(skillRoot) {
  for (const file of listFiles(skillRoot)) {
    if (!/\.(md|yaml|yml|json)$/i.test(file) && path.basename(file) !== "SKILL.md") continue;
    const text = fs.readFileSync(file, "utf8");
    const updated = text.replace(/scripts\/invoke(?![.A-Za-z0-9_-])/g, "scripts/invoke.sh");
    if (updated !== text) fs.writeFileSync(file, updated, "utf8");
  }
}
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
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
