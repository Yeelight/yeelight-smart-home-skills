#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const skill = flag("--skill") || "yeelight-smart-home";
const version = requiredFlag("--version");
const owner = flag("--owner") || "yeelight";
const slug = flag("--slug") || skill;
const name = flag("--name") || titleFromSlug(skill);
const sourceRepo = flag("--source-repo") || "Yeelight/yeelight-smart-home-skills";
const sourceCommit = flag("--source-commit") || git(["rev-parse", "HEAD"]);
const sourceRef = flag("--source-ref") || `yeelight-skill-${skill}-v${version}`;
const sourcePath = flag("--source-path") || `skills/${skill}`;
const dryRun = hasFlag("--dry-run");
const force = hasFlag("--force");
const skillPath = path.join(root, sourcePath);

if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) {
  fail(`missing skill folder: ${path.relative(root, skillPath)}`);
}

if (!dryRun) {
  const token = process.env.CLAWHUB_TOKEN?.trim();
  if (!token) {
    fail("CLAWHUB_TOKEN GitHub secret is required for ClawHub publish");
  }
  run("clawhub", ["login", "--token", token, "--no-input"], { redact: token });
}

const current = inspectCurrent({ owner, slug });
if (!dryRun && !force && current.latestVersion === version) {
  console.log(JSON.stringify({
    ok: true,
    status: "already-current",
    owner,
    slug,
    version,
    latestVersion: current.latestVersion,
    url: `https://clawhub.ai/${owner}/skills/${slug}`,
  }, null, 2));
  process.exit(0);
}

const changelog = readChangelog(skill, version);
const publishArgs = [
  "skill",
  "publish",
  skillPath,
  "--owner",
  owner,
  "--slug",
  slug,
  "--name",
  name,
  "--version",
  version,
  "--changelog",
  changelog,
  "--tags",
  "latest,yeelight,smart-home,lighting,agent-skill,codex,claude,copilot",
  "--topics",
  "yeelight,smart-home,lighting,home-automation,agent-skill",
  "--source-repo",
  sourceRepo,
  "--source-commit",
  sourceCommit,
  "--source-ref",
  sourceRef,
  "--source-path",
  sourcePath,
  "--json",
];
if (dryRun) publishArgs.push("--dry-run");

const published = runJSON("clawhub", publishArgs);
const after = inspectCurrent({ owner, slug });
if (!dryRun && after.latestVersion !== version) {
  fail(`ClawHub publish completed but latest version is ${after.latestVersion || "(unknown)"}, expected ${version}`);
}

console.log(JSON.stringify({
  ok: true,
  status: dryRun ? "dry-run" : "published",
  owner,
  slug,
  version,
  latestVersion: after.latestVersion || published.latestVersion || null,
  url: `https://clawhub.ai/${owner}/skills/${slug}`,
  publish: published,
}, null, 2));

function flag(name) {
  const equal = args.find((item) => item.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function requiredFlag(name) {
  const value = flag(name);
  if (!value) fail(`missing ${name}`);
  return value;
}

function hasFlag(name) {
  return args.includes(name);
}

function titleFromSlug(value) {
  return String(value)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readChangelog(skillId, skillVersion) {
  const releaseNotes = path.join(root, "releases", skillId, `v${skillVersion}`, "release-notes.md");
  if (fs.existsSync(releaseNotes)) {
    return fs.readFileSync(releaseNotes, "utf8").trim().slice(0, 4000);
  }
  return `${name} v${skillVersion}`;
}

function inspectCurrent({ owner: ownerHandle, slug: skillSlug }) {
  const result = spawnSync("clawhub", ["inspect", `@${ownerHandle}/${skillSlug}`, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    return { latestVersion: "" };
  }
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      latestVersion: parsed.latestVersion?.version || "",
      raw: parsed,
    };
  } catch {
    return { latestVersion: "" };
  }
}

function git(commandArgs) {
  return run("git", commandArgs).trim();
}

function runJSON(command, commandArgs) {
  const output = run(command, commandArgs);
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(`${command} ${redactedArgs(commandArgs).join(" ")} returned non-JSON: ${error.message}\n${output}`);
  }
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    fail(`${command} ${redactedArgs(commandArgs, options.redact).join(" ")} failed: ${redact(detail, options.redact)}`);
  }
  return result.stdout || "";
}

function redactedArgs(commandArgs, secret = "") {
  return commandArgs.map((item) => redact(item, secret));
}

function redact(value, secret = "") {
  let text = String(value || "");
  if (secret) text = text.replaceAll(secret, "[redacted]");
  return text.replace(/clh_[A-Za-z0-9_-]+/g, "clh_[redacted]");
}

function fail(message) {
  console.error(redact(message, process.env.CLAWHUB_TOKEN || ""));
  process.exit(1);
}
