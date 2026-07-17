import { evaluateRuntimeCompatibility } from "./runtime-compatibility.mjs";

export function classifyRuntimeCandidate({ version, checks }) {
  const compatibility = evaluateRuntimeCompatibility(version);
  const checksPassed = checks.length > 0 && checks.every((item) => item.status === "passed");
  return {
    status: compatibility.supported && checksPassed ? "supported" : "unsupported",
    declaredSupported: compatibility.supported,
    reasonId: compatibility.supported && !checksPassed ? "executable-check-failed" : compatibility.reasonId,
  };
}
