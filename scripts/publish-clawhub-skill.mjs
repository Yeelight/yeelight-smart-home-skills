#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const noSource = hasFlag("--no-source");
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
const publishPath = prepareClawHubSkillPath(skillPath);
const attempts = buildPublishAttempts();
const attemptResults = [];
let lastFailure = null;

for (const attempt of attempts) {
  const publishArgs = buildPublishArgs(attempt);
  const published = runPublishCli(publishArgs);
  const after = inspectCurrent({ owner, slug });
  const attemptResult = summarizeAttempt({ attempt, published, after });
  attemptResults.push(attemptResult);

  if (published.ok) {
    if (!dryRun && after.latestVersion !== version) {
      lastFailure = `ClawHub publish completed in ${attempt.label} mode but latest version is ${after.latestVersion || "(unknown)"}, expected ${version}`;
      if (!shouldTryNextAttempt(attempt, published.detail)) break;
      continue;
    }
    printSuccess({
      status: dryRun ? "dry-run" : "published",
      latestVersion: after.latestVersion || published.json?.latestVersion || null,
      publish: published.json,
      attemptResults,
    });
    process.exit(0);
  }

  lastFailure = `${attempt.label} mode failed: ${published.detail}`;
  if (!dryRun && after.latestVersion === version) {
    printSuccess({
      status: "published-cli-response-schema-drift",
      latestVersion: after.latestVersion,
      publish: published.json,
      attemptResults,
    });
    process.exit(0);
  }

  if (!shouldTryNextAttempt(attempt, published.detail)) break;
}

fail(lastFailure || "ClawHub publish failed");

function buildPublishAttempts() {
  const full = {
    label: "full",
    includeSource: !noSource,
    includeTopics: true,
    tags: "latest,yeelight,smart-home,lighting,agent-skill,codex,claude,copilot",
  };
  if (dryRun || noSource) return [full];
  return [
    full,
    {
      label: "without-source",
      includeSource: false,
      includeTopics: true,
      tags: full.tags,
    },
    {
      label: "minimal",
      includeSource: false,
      includeTopics: false,
      tags: "latest",
    },
  ];
}

function buildPublishArgs({ includeSource, includeTopics, tags }) {
  const commandArgs = [
    "skill",
    "publish",
    publishPath,
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
    tags,
  ];
  if (includeTopics) {
    commandArgs.push("--topics", "yeelight,smart-home,lighting,home-automation,agent-skill");
  }
  if (includeSource) {
    commandArgs.push(
      "--source-repo",
      sourceRepo,
      "--source-commit",
      sourceCommit,
      "--source-ref",
      sourceRef,
      "--source-path",
      sourcePath,
    );
  }
  commandArgs.push("--json");
  if (dryRun) commandArgs.push("--dry-run");
  return commandArgs;
}

function runPublishCli(commandArgs) {
  const result = spawnSync("clawhub", commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      detail: `${redactedArgs(["clawhub", ...commandArgs]).join(" ")} failed: ${redact(detail, process.env.CLAWHUB_TOKEN || "")}`,
      json: parseOptionalJSON(result.stdout),
    };
  }
  const json = parseOptionalJSON(result.stdout);
  if (!json) {
    return {
      ok: false,
      detail: `${redactedArgs(["clawhub", ...commandArgs]).join(" ")} returned non-JSON: ${detail}`,
      json: null,
    };
  }
  return { ok: true, detail: "", json };
}

function parseOptionalJSON(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return null;
  }
}

function summarizeAttempt({ attempt, published, after }) {
  return {
    label: attempt.label,
    ok: published.ok,
    latestVersion: after.latestVersion || "",
    detail: published.ok ? "" : published.detail.slice(0, 600),
  };
}

function shouldTryNextAttempt(attempt, detail) {
  if (dryRun || attempt.label === "minimal") return false;
  return /API response|invalid value|source|topic|tag|skillId|versionId/i.test(detail);
}

function printSuccess({ status, latestVersion, publish, attemptResults }) {
  console.log(JSON.stringify({
    ok: true,
    status,
    owner,
    slug,
    version,
    latestVersion,
    url: `https://clawhub.ai/${owner}/skills/${slug}`,
    publish,
    attempts: attemptResults,
    packagePath: path.relative(root, publishPath),
  }, null, 2));
}

function prepareClawHubSkillPath(sourceSkillPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-clawhub-skill-"));
  const target = path.join(tempRoot, skill);
  fs.cpSync(sourceSkillPath, target, { recursive: true });
  fs.rmSync(path.join(target, "scripts", "invoke"), { force: true });
  rewriteExtensionlessInvokeReferences(target);
  assertClawHubSafePackage(target);
  return target;
}

function rewriteExtensionlessInvokeReferences(packageRoot) {
  for (const file of listFiles(packageRoot)) {
    if (!/\.(md|yaml|yml|json)$/i.test(file) && path.basename(file) !== "SKILL.md") continue;
    const text = fs.readFileSync(file, "utf8");
    const updated = text.replace(/scripts\/invoke(?![.A-Za-z0-9_-])/g, "scripts/invoke.sh");
    if (updated !== text) fs.writeFileSync(file, updated, "utf8");
  }
}

function assertClawHubSafePackage(packageRoot) {
  const forbidden = path.join(packageRoot, "scripts", "invoke");
  if (fs.existsSync(forbidden)) {
    fail("ClawHub package still contains forbidden scripts/invoke");
  }
  const skillText = fs.readFileSync(path.join(packageRoot, "SKILL.md"), "utf8");
  if (/scripts\/invoke(?![.A-Za-z0-9_-])/.test(skillText)) {
    fail("ClawHub package SKILL.md still references extensionless scripts/invoke");
  }
  if (!fs.existsSync(path.join(packageRoot, "scripts", "invoke.sh"))) {
    fail("ClawHub package is missing scripts/invoke.sh fallback wrapper");
  }
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

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
