export async function readJSONBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) return { __invalidJSON: true, reason: "body_too_large", rawLength: size };
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return undefined;
  try { return JSON.parse(text); }
  catch { return { __invalidJSON: true, reason: "invalid_json", rawLength: text.length }; }
}

export function sendJSON(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
