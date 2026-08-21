import { clearYouTubeEmbed, mountYouTubeEmbed } from "./embed-player.mjs";
import { hasAppleMusicLink, setupAppleMusicController } from "./apple-music-controller.mjs";

export { hasAppleMusicLink };

export function createSearchButtonOwner() {
  const owners = new WeakMap();
  return {
    claim(button) {
      const token = {};
      owners.set(button, token);
      return token;
    },
    owns(button, token) {
      return owners.get(button) === token;
    },
  };
}

export function restoreSearchButton(button, owner, token, originalLabel) {
  if (!owner.owns(button, token)) return false;
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.textContent = originalLabel;
  return true;
}

export function setupCatalog({ state, $, api, setMessage, updateSelection, clearPreparedSession, clearSharedAudio }) {
  const searchVersions = new Map();
  const buttonOwner = createSearchButtonOwner();
  let selectionEpoch = 0;
  const appleMusic = setupAppleMusicController({ $, state, setMessage });

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

  function clearEmbeddedPlayer() {
    clearYouTubeEmbed($("youtube-player"));
    $("embedded-player").hidden = true;
    $("embedded-player-status").textContent = "Ready";
    $("embedded-player-note").textContent = "Play the selected source here. To let the lights follow it, share the tab or window playing the source below.";
    clearSharedAudio?.();
  }

  function setEmbeddedPlaybackState(status) {
    if (status === "checking") {
      $("embedded-player-status").textContent = "Checking playback";
      $("embedded-player-note").textContent = "Checking whether this source can play in the embedded player...";
    } else if (status === "ready") {
      $("embedded-player-status").textContent = "Ready to play";
      $("embedded-player-note").textContent = "Play this source here. To analyze it, share the tab or window playing the source below.";
    }
  }

  function markEmbeddedUnavailable(video, song, selectedEpoch, event) {
    if (selectionEpoch !== selectedEpoch || state.song !== song || state.youtubeCandidate !== video) return;
    state.youtubeCandidate = null;
    resetResultSelection("youtube-results", "youtube-selection");
    clearYouTubeEmbed($("youtube-player"));
    $("embedded-player").hidden = false;
    $("embedded-player-status").textContent = "Unavailable";
    $("embedded-player-note").textContent = "This source cannot play in the embedded player. Choose another result or use local audio.";
    $("youtube-note").textContent = "The selected source is unavailable here. Choose another result or use local audio; the soundtrack remains selected.";
    clearSharedAudio?.();
    setMessage(event.reason === "playback_check_timeout" ? "The embedded source could not be verified. Choose another result or use local audio." : "This embedded source is unavailable. Choose another result or use local audio.");
  }

  function mountEmbeddedPlayer(video, song, selectedEpoch) {
    state.youtubeCandidate = video;
    $("embedded-player").hidden = false;
    setEmbeddedPlaybackState("checking");
    const mounted = mountYouTubeEmbed($("youtube-player"), video, document, {
      onState: (event) => {
        if (selectionEpoch !== selectedEpoch || state.song !== song || state.youtubeCandidate !== video) return;
        if (event.status === "checking" || event.status === "ready") setEmbeddedPlaybackState(event.status);
        else if (event.status === "unavailable") markEmbeddedUnavailable(video, song, selectedEpoch, event);
      },
    });
    if (!mounted) {
      state.youtubeCandidate = null;
      clearYouTubeEmbed($("youtube-player"));
      $("embedded-player").hidden = false;
      $("embedded-player-status").textContent = "Unavailable";
      $("embedded-player-note").textContent = "This source cannot be embedded safely. Use local audio or choose another result.";
      return false;
    }
    return true;
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
    const requestToken = buttonOwner.claim(button);
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
      restoreSearchButton(button, buttonOwner, requestToken, originalLabel);
    }
  }

  function clearSongSelection() {
    selectionEpoch += 1;
    state.song = null;
    state.youtubeCandidate = null;
    invalidateSearch("song-results");
    invalidateSearch("youtube-results");
    resetResultSelection("song-results", "song-selection");
    resetResultSelection("youtube-results", "youtube-selection");
    $("youtube-results").replaceChildren();
    appleMusic.clear();
    clearEmbeddedPlayer();
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
    const searchEpoch = selectionEpoch;
    await runCatalogSearch($("movie-search"), "Searching films...", `/api/catalog/movies?q=${encodeURIComponent(query)}`, "movie-results", "films", async (movie) => {
      if (selectionEpoch !== searchEpoch) return;
      if (!await prepareForContentChange()) return;
      state.movie = movie;
      clearSongSelection();
      $("song-query").value = movie.title;
      const selectedEpoch = selectionEpoch;
      showResultSelection("movie-results", "movie-selection", movie, movie.year || "Film result", async () => {
        if (selectionEpoch !== selectedEpoch || state.movie !== movie) return;
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
    const searchEpoch = selectionEpoch;
    await runCatalogSearch($("song-search"), "Searching soundtracks...", `/api/catalog/songs?movie=${encodeURIComponent(title)}`, "song-results", "soundtracks", async (song) => {
      if (selectionEpoch !== searchEpoch) return;
      if (!await prepareForContentChange()) return;
      state.song = song;
      state.youtubeCandidate = null;
      $("optional-audio").hidden = false;
      const appleMusicAvailable = appleMusic.show(song);
      const selectedEpoch = selectionEpoch;
      showResultSelection("song-results", "song-selection", song, song.artist || "Soundtrack result", async () => {
        if (selectionEpoch !== selectedEpoch || state.song !== song) return;
        if (!await prepareForContentChange()) return;
        clearSongSelection();
        updateSelection();
        $("song-search").click();
      });
      setMessage(`Soundtrack selected: ${song.title}`);
      updateSelection();
      if (appleMusicAvailable) {
        setMessage(`Soundtrack selected: ${song.title}. Open Apple Music in the separate window when ready.`);
        return;
      }
      $("youtube-fallback").hidden = false;
      $("youtube-note").textContent = "Apple Music is unavailable for this track. Use this optional in-page source or local audio.";
      const videos = await runCatalogSearch($("song-search"), "Searching optional audio sources...", `/api/catalog/youtube?song=${encodeURIComponent(song.title)}`, "youtube-results", "optional audio sources", (video) => {
        if (selectionEpoch !== selectedEpoch || state.song !== song) return;
        if (!mountEmbeddedPlayer(video, song, selectedEpoch)) return;
        showResultSelection("youtube-results", "youtube-selection", video, "Optional external source", () => {
          if (selectionEpoch !== selectedEpoch || state.song !== song) return;
          state.youtubeCandidate = null;
          resetResultSelection("youtube-results", "youtube-selection");
          clearEmbeddedPlayer();
          setMessage(`Soundtrack remains selected: ${song.title}. The embedded source is optional.`);
        });
        setMessage(`Embedded audio source ready: ${video.title}. Play it here or use local audio.`);
      }, "youtube-selection");
      if (selectionEpoch !== selectedEpoch || state.song !== song) return;
      $("youtube-note").textContent = videos.length ? "Optional in-page player. Play a result here, then share the tab or window playing it if the lights should follow it." : "No optional in-page source is available. The selected soundtrack is still enough to prepare.";
      if (videos.length) setMessage(`Soundtrack selected: ${song.title}. An optional player is ready below.`);
    }, "song-selection");
  });

  $("movie-query").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("movie-search").click(); } });
  $("song-query").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("song-search").click(); } });

}
