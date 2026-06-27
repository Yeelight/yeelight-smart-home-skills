#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skill = flag("--skill") || "yeelight-smart-home";
const version = flag("--version") || latestReleaseVersion(skill);
const releaseDir = path.join(root, "releases", skill, `v${version}`);
const bridgeDir = path.join(root, "adapters", "yeelight-skill-bridge");
const checks = [];

main().catch((error) => {
  checks.push(check("unexpected_error", false, { message: error instanceof Error ? error.message : String(error) }));
  printAndExit();
});

async function main() {
  checkJSON("platforms_json", path.join(root, "platforms.json"));
  checkJSON("skill_directory_submission_status", path.join(root, "submissions", "skill-directory-submission-status.json"));
  checkJSON("github_marketplace_json", path.join(root, ".github", "plugin", "marketplace.json"));
  checkJSON("claude_marketplace_json", path.join(root, ".claude-plugin", "marketplace.json"));
  const openApi = checkJSON("bridge_openapi_json", path.join(bridgeDir, "openapi.json"));
  checkBilingualReadme();
  checkJSON("skill_request_schema", path.join(root, "skills", skill, "assets", "schemas", "skill-request.schema.json"));
  checkJSON("skill_response_schema", path.join(root, "skills", skill, "assets", "schemas", "skill-response.schema.json"));
  checkFile("bridge_server", path.join(bridgeDir, "server.mjs"));
  checkFile("bridge_readme", path.join(bridgeDir, "README.md"));
  checkFile("bridge_privacy", path.join(bridgeDir, "privacy.md"));
  checkOpenApi(openApi);
  checkPlatformSubmissionKits();
  checkDifyPackage();
  checkReleaseChecksums();
  checkScriptSyntax();
  await smokeBridge();
  printAndExit();
}

function checkJSON(name, file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    checks.push(check(name, true, { file: rel(file) }));
    return value;
  } catch (error) {
    checks.push(check(name, false, { file: rel(file), error: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

function checkFile(name, file) {
  checks.push(check(name, fs.existsSync(file), { file: rel(file) }));
}

function checkBilingualReadme() {
  const readme = path.join(root, "README.md");
  const readmeZh = path.join(root, "README.zh-CN.md");
  const releaseUrl = `https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-${skill}-v${version}`;
  const releasePath = `releases/${skill}/v${version}`;
  checkFile("readme_en", readme);
  checkFile("readme_zh_cn", readmeZh);
  const en = readIfExists(readme);
  const zh = readIfExists(readmeZh);
  checks.push(check("readme_en_links_zh_cn", en.includes("[简体中文](README.zh-CN.md)"), { file: rel(readme) }));
  checks.push(check("readme_zh_cn_links_en", zh.includes("[English](README.md)"), { file: rel(readmeZh) }));
  checks.push(check("readme_en_mentions_version", en.includes(`\`${version}\``) && en.includes(releaseUrl) && en.includes(releasePath), {
    file: rel(readme),
    releaseUrl,
    releasePath,
  }));
  checks.push(check("readme_zh_cn_mentions_version", zh.includes(`\`${version}\``) && zh.includes(releaseUrl) && zh.includes(releasePath), {
    file: rel(readmeZh),
    releaseUrl,
    releasePath,
  }));
  checks.push(check("readme_en_default_language", en.startsWith("# Yeelight Smart Home Skills\n\nEnglish | [简体中文]"), {
    file: rel(readme),
  }));
}

function checkOpenApi(openApi) {
  if (!openApi) return;
  const requiredPaths = ["/health", "/invoke", "/mcp"];
  const missingPaths = requiredPaths.filter((item) => !openApi.paths?.[item]);
  checks.push(check("openapi_required_paths", missingPaths.length === 0, { missingPaths }));
  checks.push(check("openapi_has_auth", Boolean(openApi.components?.securitySchemes?.bearerAuth), {
    securitySchemes: Object.keys(openApi.components?.securitySchemes || {}),
  }));
}

function checkPlatformSubmissionKits() {
  const platformIds = [
    "clawhub",
    "skills-sh",
    "nanoskill",
    "marketing-skills",
    "lobehub",
    "tencent-skillhub",
    "cocoloop-molili",
    "dify",
    "openai",
    "coze",
    "bailian",
    "yuanqi",
    "qianfan",
    "volcano-ark",
  ];
  for (const platform of platformIds) {
    const readme = path.join(root, "submissions", platform, "README.md");
    const exists = fs.existsSync(readme);
    const text = exists ? fs.readFileSync(readme, "utf8") : "";
    checks.push(check(`submission_${platform}`, exists && text.toLowerCase().includes("yeelight"), {
      file: rel(readme),
      hasBridge: text.includes("bridge") || text.includes("Bridge") || text.includes("桥接"),
    }));
  }
}

function checkDifyPackage() {
  const pluginRoot = path.join(root, "submissions", "dify", "plugin");
  const packageFile = latestDifyPackage(skill);
  for (const file of [
    "manifest.yaml",
    "README.md",
    "PRIVACY.md",
    "main.py",
    "provider/yeelight_smart_home.yaml",
    "provider/yeelight_smart_home.py",
    "tools/yeelight_smart_home.yaml",
    "tools/yeelight_smart_home.py",
    "_assets/icon.svg",
  ]) {
    checkFile(`dify_plugin_${file.replaceAll("/", "_")}`, path.join(pluginRoot, file));
  }
  for (const icon of ["icon.svg", "icon-dark.svg"]) {
    const iconPath = path.join(pluginRoot, "_assets", icon);
    const text = fs.existsSync(iconPath) ? fs.readFileSync(iconPath, "utf8") : "";
    checks.push(check(`dify_plugin_${icon}_custom`, Boolean(text) && !text.includes("DIFY_MARKETPLACE_TEMPLATE_ICON_DO_NOT_USE"), {
      file: rel(iconPath),
    }));
  }
  checkFile("dify_package_file", packageFile);
  if (fs.existsSync(packageFile)) {
    const result = spawnSync("unzip", ["-l", packageFile], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const listing = result.stdout || "";
    const required = ["manifest.yaml", "README.md", "PRIVACY.md", "main.py", "provider/yeelight_smart_home.yaml", "tools/yeelight_smart_home.yaml"];
    const missing = required.filter((item) => !listing.includes(item));
    checks.push(check("dify_package_readable", (result.status ?? 1) === 0, {
      file: rel(packageFile),
      stderr: tail(result.stderr),
    }));
    checks.push(check("dify_package_contains_required_files", missing.length === 0, {
      missing,
    }));
  }
}

function checkReleaseChecksums() {
  const result = spawnSync("shasum", ["-a", "256", "-c", "checksums.txt"], {
    cwd: releaseDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  checks.push(check("release_checksums", (result.status ?? 1) === 0, {
    command: "shasum -a 256 -c checksums.txt",
    cwd: rel(releaseDir),
    stdout: tail(result.stdout),
    stderr: tail(result.stderr),
  }));
}

function checkScriptSyntax() {
  for (const script of [
    path.join(root, "scripts", "publish-skill-release.mjs"),
    path.join(root, "scripts", "verify-publication-assets.mjs"),
    path.join(bridgeDir, "server.mjs"),
  ]) {
    const result = spawnSync("node", ["--check", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    checks.push(check(`node_check_${path.basename(script)}`, (result.status ?? 1) === 0, {
      file: rel(script),
      stderr: tail(result.stderr),
    }));
  }
}

async function smokeBridge() {
  const mockRuntime = path.join(root, "scripts", "mock-yeelight-home-runtime.mjs");
  fs.chmodSync(mockRuntime, 0o755);
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(bridgeDir, "server.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      YEELIGHT_HOME_BIN: mockRuntime,
      YEELIGHT_BRIDGE_HOST: "127.0.0.1",
      YEELIGHT_BRIDGE_PORT: String(port),
      YEELIGHT_BRIDGE_API_KEY: "test-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForReady(child);
    const base = `http://127.0.0.1:${port}`;
    const health = await requestJSON(`${base}/health`, { headers: authHeaders() });
    checks.push(check("bridge_health_smoke", health.ok === true && health.skill === skill, health));
    const openApi = await requestJSON(`${base}/openapi.json`, { headers: authHeaders() });
    checks.push(check("bridge_openapi_smoke", openApi.openapi === "3.1.0", { title: openApi.info?.title }));
    const unauthorized = await requestStatus(`${base}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    checks.push(check("bridge_invoke_auth_required", unauthorized.statusCode === 401, unauthorized));
    const invoke = await requestJSON(`${base}/invoke`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        contractVersion: "1.0",
        requestId: "bridge-smoke",
        locale: "zh-CN",
        utterance: "列出家庭",
        intent: "home.list",
      }),
    });
    checks.push(check("bridge_invoke_smoke", invoke.status === "success" && invoke.requestId === "bridge-smoke", invoke));
    const mcp = await requestJSON(`${base}/mcp`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    checks.push(check("bridge_mcp_smoke", Array.isArray(mcp.result?.tools), { toolCount: mcp.result?.tools?.length || 0 }));
  } finally {
    child.kill("SIGTERM");
  }
}

function requestJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || "";
    const req = httpRequest(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString("utf8");
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function requestStatus(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || "";
    const req = httpRequest(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString("utf8");
      });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpRequest(url, options, cb) {
  const parsed = new URL(url);
  return http.request({
    hostname: parsed.hostname,
    port: parsed.port,
    path: `${parsed.pathname}${parsed.search}`,
    method: options.method || "GET",
    headers: options.headers || {},
  }, cb);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) resolve(address.port);
        else reject(new Error("failed to resolve free port"));
      });
    });
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bridge did not start in time")), 5000);
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (text.includes("\"event\":\"ready\"")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`bridge exited with code ${code}: ${stderr}`));
    });
  });
}

function authHeaders() {
  return { authorization: "Bearer test-token" };
}

function check(name, ok, detail = {}) {
  return { name, ok: Boolean(ok), detail };
}

function printAndExit() {
  const failed = checks.filter((item) => !item.ok);
  const result = { ok: failed.length === 0, checks };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function tail(text) {
  return String(text || "").split(/\r?\n/).slice(-20).join("\n");
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function flag(name) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  const equal = args.find((item) => item.startsWith(`${name}=`));
  return equal ? equal.slice(name.length + 1) : "";
}

function latestReleaseVersion(skillId) {
  const releasesRoot = path.join(root, "releases", skillId);
  const versions = fs.existsSync(releasesRoot)
    ? fs.readdirSync(releasesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.name))
      .map((entry) => entry.name.slice(1))
      .sort(compareSemver)
    : [];
  if (versions.length === 0) {
    throw new Error(`no release versions found under ${rel(releasesRoot)}`);
  }
  return versions[versions.length - 1];
}

function latestDifyPackage(skillId) {
  const dir = path.join(root, "submissions", "dify");
  const pattern = new RegExp(`^${escapeRegExp(skillId)}-(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\.difypkg$`);
  const packages = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .map((name) => ({ name, match: name.match(pattern) }))
      .filter((item) => item.match)
      .sort((left, right) => compareSemver(left.match[1], right.match[1]))
    : [];
  if (packages.length === 0) {
    return path.join(dir, `${skillId}-${version}.difypkg`);
  }
  return path.join(dir, packages[packages.length - 1].name);
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (const index of [0, 1, 2]) {
    const diff = leftParts.numbers[index] - rightParts.numbers[index];
    if (diff !== 0) return diff;
  }
  if (leftParts.prerelease === rightParts.prerelease) return 0;
  if (!leftParts.prerelease) return 1;
  if (!rightParts.prerelease) return -1;
  return leftParts.prerelease.localeCompare(rightParts.prerelease);
}

function parseSemver(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) throw new Error(`invalid semver: ${value}`);
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || "",
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
