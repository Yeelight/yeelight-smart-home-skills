import crypto from "node:crypto";

export const SERVICE_ID = "yeelight-interactive-light-experiences";
export const PROTOCOL_VERSION = 1;

export function validInstanceId(value) {
  return typeof value === "string" && /^[0-9a-f-]{16,80}$/i.test(value);
}

export function validOwnerToken(value) {
  return typeof value === "string" && /^[0-9a-f-]{24,80}$/i.test(value);
}

export function serviceOwnerProof(ownerToken, challenge, instanceId, protocolVersion) {
  return crypto.createHmac("sha256", ownerToken).update(`${challenge}:${instanceId}:${protocolVersion}`).digest("hex");
}
