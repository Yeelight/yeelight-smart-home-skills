#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCinemaPackage } from "./lib/validator.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = validateCinemaPackage(root);
console.log(JSON.stringify({ skillId: "yeelight-cinema-director", ...result }, null, 2));
if (!result.ok) process.exitCode = 1;
