export function setupCatalog({ state, $, api, setMessage, updateSelection, clearPreparedSession }) {
  const searchVersions = new Map();

  function invalidateSearch(resultId) {
    searchVersions.set(resultId, (searchVersions.get(resultId) || 0) + 1);
  }

  function resetResultSelection(resultId, summaryId) {
    const list = $(resultId);
    const summary = $(summaryId);
    list.hidden = false;
    list.classList.remove("is-selected");
    summary.hidden = true;
    summary.replaceChildren();
  }

  function showResultSelection(resultId, summaryId, item, detail, onChange) {
    const list = $(resultId);
    list.hidden = true;
    list.classList.add("is-selected");
    const summary = $(summaryId);
    summary.replaceChildren();
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const meta = document.createElement("small");
    meta.textContent = detail;
    copy.append(title, meta);
    const change = document.createElement("button");
    change.type = "button";
    change.className = "text-button";
    change.textContent = "Change";
    change.addEventListener("click", () => { void Promise.resolve(onChange()).catch((error) => setMessage(error.message || "Change failed.")); });
    summary.append(copy, change);
    summary.hidden = false;
  }

  function showResults(id, items, label, select) {
    const host = $(id);
    host.replaceChildren();
    host.hidden = false;
    host.classList.remove("is-selected");
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "panel-note";
      empty.textContent = `No ${label} found yet.`;
      host.append(empty);
      return;
    }
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      const title = document.createElement("span");
      title.textContent = item.title;
      const detail = document.createElement("small");
      detail.textContent = item.artist || item.year || "Select";
      button.append(title, detail);
      button.addEventListener("click", () => {
        void Promise.resolve(select(item, button)).catch((error) => setMessage(error.message || "Selection failed."));
      });
      host.append(button);
    }
  }

  async function runCatalogSearch(button, message, path, resultId, label, select, summaryId) {
    const originalLabel = button.textContent;
    const version = (searchVersions.get(resultId) || 0) + 1;
    searchVersions.set(resultId, version);
    const current = () => searchVersions.get(resultId) === version;
    resetResultSelection(resultId, summaryId);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    setMessage(message);
    try {
      const data = await api(path);
      if (!current()) return [];
      const items = data.movies || data.songs || data.videos || [];
      showResults(resultId, items, label, select);
      if (!items.length) setMessage(`No ${label} found yet.`);
      return items;
    } catch (error) {
      if (current()) {
        showResults(resultId, [], label, () => {});
        setMessage(error.message || "Catalog search failed.");
      }
      return [];
    } finally {
      if (current()) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = originalLabel;
      }
    }
  }

  function clearSongSelection() {
    state.song = null;
    state.youtubeCandidate = null;
    invalidateSearch("song-results");
    invalidateSearch("youtube-results");
    resetResultSelection("song-results", "song-selection");
    resetResultSelection("youtube-results", "youtube-selection");
    $("youtube-results").replaceChildren();
    $("optional-audio").hidden = true;
    $("youtube-note").textContent = "";
  }

  async function prepareForContentChange() {
    if (state.commandPending) {
      setMessage("Finish the current screening command before changing content.");
      return false;
    }
    if (!state.session) return true;
    if (typeof clearPreparedSession !== "function") {
      setMessage("Stop the current screening before changing content.");
      return false;
    }
    return clearPreparedSession();
  }

  $("movie-search").addEventListener("click", async () => {
    if (!await prepareForContentChange()) return;
    const query = $("movie-query").value.trim();
    if (query.length < 2) {
      showResults("movie-results", [], "films", () => {});
      setMessage("Enter at least two characters to search films.");
      return;
    }
    state.movie = null;
    clearSongSelection();
    $("song-query").value = "";
    updateSelection();
    await runCatalogSearch($("movie-search"), "Searching films...", `/api/catalog/movies?q=${encodeURIComponent(query)}`, "movie-results", "films", async (movie) => {
      if (!await prepareForContentChange()) return;
      state.movie = movie;
      clearSongSelection();
      $("song-query").value = movie.title;
      showResultSelection("movie-results", "movie-selection", movie, movie.year || "Film result", async () => {
        if (!await prepareForContentChange()) return;
        state.movie = null;
        clearSongSelection();
        $("song-query").value = "";
        resetResultSelection("movie-results", "movie-selection");
        setMessage("Choose a film to continue.");
        updateSelection();
      });
      setMessage(`Film selected: ${movie.title}`);
      updateSelection();
    }, "movie-selection");
  });

  $("song-search").addEventListener("click", async () => {
    if (!await prepareForContentChange()) return;
    const title = state.movie?.title || $("song-query").value.trim();
    if (title.length < 2) {
      showResults("song-results", [], "soundtracks", () => {});
      setMessage("Choose a film or enter at least two characters first.");
      return;
    }
    clearSongSelection();
    updateSelection();
    await runCatalogSearch($("song-search"), "Searching soundtracks...", `/api/catalog/songs?movie=${encodeURIComponent(title)}`, "song-results", "soundtracks", async (song) => {
      if (!await prepareForContentChange()) return;
      state.song = song;
      state.youtubeCandidate = null;
      $("optional-audio").hidden = false;
      $("youtube-note").textContent = "Optional YouTube source. Choose at most one to open; this soundtrack alone is enough to prepare.";
      showResultSelection("song-results", "song-selection", song, song.artist || "Soundtrack result", async () => {
        if (!await prepareForContentChange()) return;
        clearSongSelection();
        updateSelection();
      });
      setMessage(`Soundtrack selected: ${song.title}`);
      updateSelection();
      const videos = await runCatalogSearch($("song-search"), "Searching optional audio sources...", `/api/catalog/youtube?song=${encodeURIComponent(song.title)}`, "youtube-results", "optional audio sources", (video) => {
        if (state.song !== song) return;
        state.youtubeCandidate = video;
        showResultSelection("youtube-results", "youtube-selection", video, "Optional external source", () => {
          if (state.song !== song) return;
          state.youtubeCandidate = null;
          resetResultSelection("youtube-results", "youtube-selection");
          setMessage(`Soundtrack remains selected: ${song.title}. YouTube is optional.`);
        });
        const opened = window.open(video.url, "_blank", "noopener,noreferrer");
        setMessage(opened ? `Optional YouTube source opened: ${video.title}` : "The optional YouTube source was blocked. Use the browser address bar or local audio.");
      }, "youtube-selection");
      if (state.song !== song) return;
      $("youtube-note").textContent = videos.length ? "Optional YouTube source. Choose at most one to open; this soundtrack alone is enough to prepare." : "No optional YouTube source is available. The selected soundtrack is still enough to prepare.";
      if (videos.length) setMessage(`Soundtrack selected: ${song.title}. YouTube suggestions are optional.`);
    }, "song-selection");
  });

  $("movie-query").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("movie-search").click(); } });
  $("song-query").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("song-search").click(); } });
}
