import { CinemaError } from "./contracts.mjs";

export const MAX_YOUTUBE_WEB_BODY_BYTES = 4 * 1024;

export function createYouTubeCatalog({ fetchCatalogJson, validateYouTubeUrl, cleanQuery, boundedString }) {
  return async function searchYouTubeCatalog(title, fetchImpl = fetch) {
    const key = String(process.env.YOUTUBE_API_KEY || "").trim();
    if (!key) return searchYouTubeWebCatalog(title, fetchImpl);
    return searchYouTubeDataApi(title, key, fetchImpl);
  };

  async function searchYouTubeDataApi(title, key, fetchImpl) {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    for (const [name, value] of Object.entries({ key, part: "snippet", type: "video", maxResults: 12, q: `${title} official audio` })) endpoint.searchParams.set(name, value);
    const data = await fetchCatalogJson(endpoint, fetchImpl);
    const ids = Array.isArray(data?.items) ? data.items.map((item) => item?.id?.videoId).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)).slice(0, 12) : [];
    if (!ids.length) return { items: [] };
    const detailEndpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    for (const [name, value] of Object.entries({ key, part: "status", id: ids.join(",") })) detailEndpoint.searchParams.set(name, value);
    const details = await fetchCatalogJson(detailEndpoint, fetchImpl);
    const blocked = new Set((Array.isArray(details?.items) ? details.items : []).filter((item) => item?.status?.embeddable === false).map((item) => item.id));
    return { items: (Array.isArray(data?.items) ? data.items : []).filter((item) => item?.id?.videoId && !blocked.has(item.id.videoId)).slice(0, 8).map((item) => ({ id: item.id.videoId, title: item.snippet?.title || "YouTube candidate", url: `https://www.youtube.com/watch?v=${item.id.videoId}` })) };
  }

  async function searchYouTubeWebCatalog(title, fetchImpl) {
    const endpoint = new URL("https://www.youtube.com/youtubei/v1/search?prettyPrint=false");
    const query = `${cleanQuery(title)} official audio`.trim().slice(0, 160);
    const body = JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20250312.04.00" } }, query });
    if (Buffer.byteLength(body, "utf8") > MAX_YOUTUBE_WEB_BODY_BYTES) throw new CinemaError("catalog_request_too_large", "The cinema catalog request is too large.", 400);
    const data = await fetchCatalogJson(endpoint, fetchImpl, { kind: "youtube-web", body });
    return { items: projectYouTubeWeb(data) };
  }

  function projectYouTubeWeb(value) {
    return findYouTubeVideoRenderers(value).map((item) => {
      const id = typeof item.videoId === "string" ? item.videoId : "";
      const title = Array.isArray(item.title?.runs) ? item.title.runs.map((run) => run?.text || "").join("") : item.title?.simpleText || "";
      return { id, title, url: `https://www.youtube.com/watch?v=${id}` };
    }).map((item) => ({ item, video: validateYouTubeUrl(item.url) }))
      .filter(({ item, video }) => video && item.title)
      .slice(0, 8)
      .map(({ item, video }) => ({ id: video.id, url: video.url, title: boundedString(item.title, 160) }));
  }

  function findYouTubeVideoRenderers(value) {
    const stack = [value];
    const found = [];
    let visited = 0;
    while (stack.length && found.length < 12 && visited < 10_000) {
      const current = stack.pop();
      visited += 1;
      if (!current || typeof current !== "object") continue;
      if (current.videoRenderer && typeof current.videoRenderer === "object") {
        found.push(current.videoRenderer);
        continue;
      }
      if (Array.isArray(current)) {
        for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
      } else {
        for (const child of Object.values(current)) stack.push(child);
      }
    }
    return found;
  }
}
