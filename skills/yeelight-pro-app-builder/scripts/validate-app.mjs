#!/usr/bin/env node
import path from "node:path";

import { validateGeneratedApp } from "./lib/validator.mjs";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/validate-app.mjs <generated-app-dir>");
  process.exit(2);
}

try {
  console.log(JSON.stringify(validateGeneratedApp(path.resolve(root)), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
