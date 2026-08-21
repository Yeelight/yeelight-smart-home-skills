import { setupAppleMusicCompanion } from "./apple-music-companion.mjs";
import { openAppleMusicWindow } from "./apple-music-window.mjs";

export function hasAppleMusicLink(song) {
  return typeof song?.appleMusicUrl === "string" && song.appleMusicUrl.trim().length > 0;
}

export function setupAppleMusicController({ $, state, setMessage, windowRef = globalThis.window, documentRef = globalThis.document }) {
  let selectedUrl = "";
  let player = null;
  let playerUrl = "";
  let companion = null;
  let companionPosition = null;

  function isOpen() {
    try { return Boolean(player && !player.closed); } catch { return false; }
  }

  function sync() {
    const windowOpen = isOpen();
    if (!windowOpen) {
      player = null;
      playerUrl = "";
    }
    const needsNavigation = windowOpen && Boolean(selectedUrl) && playerUrl !== selectedUrl;
    const launcher = $("apple-music-launcher");
    const windowState = $("apple-music-window-state");
    const openButton = $("open-apple-music");
    launcher.classList.toggle("is-window-open", windowOpen);
    if (windowState) windowState.textContent = !windowOpen ? "Separate window" : needsNavigation ? "Track queued" : "Window open";
    if (selectedUrl) {
      openButton.textContent = !windowOpen ? "Open Apple Music window" : needsNavigation ? "Load selected track" : "Bring Apple Music forward";
      $("apple-music-note").textContent = !windowOpen
        ? "Full playback opens in one reusable Apple Music window. Start it there, then share that window's audio below."
        : needsNavigation
          ? "A new track is selected. Load it into the same Apple Music window, then share that window's audio below."
          : "Apple Music is open in the reusable window. Bring it forward when needed, then share that window's audio below.";
    }
    companion?.setState({ available: Boolean(selectedUrl), windowOpen, needsNavigation, trackTitle: state.song?.title || "" });
    companionPosition = companion?.getPosition?.() || companionPosition;
  }

  function refresh() { sync(); }

  function close() {
    try { if (isOpen()) player.close?.(); } catch {}
    player = null;
    playerUrl = "";
    sync();
  }

  function clear() {
    try {
      if (player?.closed) {
        player = null;
        playerUrl = "";
      }
    } catch {
      player = null;
      playerUrl = "";
    }
    selectedUrl = "";
    $("apple-music-launcher").hidden = true;
    $("open-apple-music").disabled = true;
    $("open-apple-music").textContent = "Open Apple Music window";
    $("apple-music-window-state").textContent = "Separate window";
    $("apple-music-note").textContent = "Open the selected soundtrack in a separate resizable window.";
    $("youtube-fallback").hidden = true;
    sync();
  }

  function show(song) {
    selectedUrl = typeof song?.appleMusicUrl === "string" ? song.appleMusicUrl : "";
    const available = hasAppleMusicLink(song);
    if (!available) close();
    $("apple-music-launcher").hidden = false;
    $("open-apple-music").disabled = !available;
    $("open-apple-music").textContent = "Open Apple Music window";
    $("apple-music-note").textContent = available
      ? "Full playback opens in one reusable Apple Music window. Start it there, then share that window's audio below."
      : "No official Apple Music link was returned for this result. Use another source or local audio.";
    $("youtube-fallback").hidden = available;
    sync();
    return available;
  }

  function activate() {
    refresh();
    companionPosition = companion?.getPosition?.() || companionPosition;
    const result = openAppleMusicWindow(selectedUrl, windowRef, player, playerUrl, { anchor: companionPosition });
    if (result.opened) {
      player = result.player;
      playerUrl = result.url;
      setMessage(result.reused && result.navigated
        ? "Apple Music reused the existing window and loaded the new soundtrack. Start playback there, then share that window's audio."
        : result.reused
          ? "Apple Music is already open in the reusable window. Start playback there, then share that window's audio."
          : "Apple Music opened in a separate window. Start playback there, then share that window's audio.");
    } else if (result.reason === "popup_blocked") {
      setMessage("The browser blocked the Apple Music window. Allow pop-ups for this local page and try again.");
    } else {
      setMessage("This soundtrack has no safe Apple Music link. Use the embedded source or local audio.");
    }
    refresh();
  }

  const onVisibilityChange = () => refresh();
  companion = setupAppleMusicCompanion({
    root: $("apple-music-companion"),
    button: $("apple-music-companion-button"),
    action: $("apple-music-companion-action"),
    track: $("apple-music-companion-track"),
    onActivate: activate,
    onPositionChange: (position) => {
      companionPosition = position;
    },
    windowRef,
  });
  $("open-apple-music").addEventListener("click", activate);
  windowRef.addEventListener("beforeunload", close, { once: true });
  windowRef.addEventListener("focus", refresh);
  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  sync();

  return {
    clear,
    show,
    refresh,
    destroy() {
      companion?.destroy();
      $("open-apple-music").removeEventListener("click", activate);
      windowRef.removeEventListener("focus", refresh);
      documentRef.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
