import fs from "node:fs";

const assetRoot = new URL("../../assets/toolchain/", import.meta.url);
const metadata = read("node-web.json");
const rootTemplate = read("package.json");
const webTemplate = read("apps/web/package.json");
const bridgeTemplate = read("apps/bridge/package.json");

export function packageJson(spec) {
  return { ...structuredClone(rootTemplate), name: spec.product.name };
}

export function webPackageJson() {
  return structuredClone(webTemplate);
}

export function bridgePackageJson() {
  return structuredClone(bridgeTemplate);
}

export function packageLockJson(spec) {
  const lock = read("package-lock.json");
  lock.name = spec.product.name;
  lock.packages[""].name = spec.product.name;
  return lock;
}

export function generationToolchain() {
  return {
    schemaVersion: metadata.schemaVersion,
    id: metadata.id,
    node: metadata.node,
    npm: metadata.npm,
    lockfileVersion: metadata.lockfileVersion,
  };
}

function read(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, assetRoot), "utf8"));
}
