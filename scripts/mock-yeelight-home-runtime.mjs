#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const request = JSON.parse(input || "{}");
  process.stdout.write(`${JSON.stringify({
    contractVersion: "1.0",
    requestId: request.requestId || "mock",
    status: "success",
    userMessage: "Mock bridge smoke response.",
    result: {
      intent: request.intent,
      mock: true
    }
  })}\n`);
});
