const POSITION_STORAGE_KEY = "yeelight-cinema-apple-music-companion-position";
const VIEWPORT_MARGIN = 12;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampCompanionPosition({ left, top, width, height, viewportWidth, viewportHeight, margin = VIEWPORT_MARGIN }) {
  const maxLeft = Math.max(margin, finite(viewportWidth) - finite(width) - margin);
  const maxTop = Math.max(margin, finite(viewportHeight) - finite(height) - margin);
  return {
    left: Math.min(maxLeft, Math.max(margin, finite(left, margin))),
    top: Math.min(maxTop, Math.max(margin, finite(top, margin))),
  };
}

function getStorage(windowRef) {
  try { return windowRef?.localStorage || null; } catch { return null; }
}

function readStoredPosition(storage) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(POSITION_STORAGE_KEY) || "null");
    return Number.isFinite(value?.left) && Number.isFinite(value?.top) ? value : null;
  } catch { return null; }
}

function writeStoredPosition(storage, position) {
  try { storage?.setItem(POSITION_STORAGE_KEY, JSON.stringify(position)); } catch {}
}

export function setupAppleMusicCompanion({ root, button, action, track, onActivate, onPositionChange, windowRef = globalThis.window }) {
  const storage = getStorage(windowRef);
  let state = { available: false, windowOpen: false, needsNavigation: false, trackTitle: "" };
  let drag = null;
  let suppressClick = false;
  let positionRestored = false;

  function readPosition() {
    if (!root?.getBoundingClientRect) return null;
    const rect = root.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: finite(rect.width),
      height: finite(rect.height),
    };
  }

  function notifyPosition(reason = "change") {
    const position = readPosition();
    if (position) onPositionChange?.(position, { reason });
    return position;
  }

  function applyPosition(left, top, persist = false) {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const position = clampCompanionPosition({
      left,
      top,
      width: rect.width,
      height: rect.height,
      viewportWidth: windowRef?.innerWidth,
      viewportHeight: windowRef?.innerHeight,
    });
    root.style.left = `${Math.round(position.left)}px`;
    root.style.top = `${Math.round(position.top)}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    if (persist) writeStoredPosition(storage, position);
  }

  function restorePosition() {
    if (positionRestored) return;
    const stored = readStoredPosition(storage);
    if (root && !root.hidden) {
      if (stored) applyPosition(stored.left, stored.top);
      positionRestored = true;
    }
  }

  function updateLabels() {
    if (!button || !action || !track) return;
    const label = !state.windowOpen
      ? "Open player"
      : state.needsNavigation
        ? "Load selected track"
        : "Bring player forward";
    action.textContent = label;
    track.textContent = state.trackTitle || "Apple Music window";
    button.classList.toggle("is-open", state.windowOpen);
    button.setAttribute("aria-label", `${label}: Apple Music`);
    button.title = "Drag to move; click to open or bring Apple Music forward.";
  }

  function setState(next = {}) {
    state = { ...state, ...next };
    if (!root) return;
    root.hidden = !state.available;
    updateLabels();
    if (state.available) restorePosition();
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !root || root.hidden) return;
    const rect = root.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
    button?.classList.add("is-dragging");
    button?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const movedX = event.clientX - drag.startX;
    const movedY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(movedX, movedY) < 5) return;
    drag.moved = true;
    event.preventDefault?.();
    applyPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  }

  function finishPointer(event, force = false) {
    if (!drag || (!force && event.pointerId !== drag.pointerId)) return;
    const moved = drag.moved;
    if (moved) {
      const rect = root.getBoundingClientRect();
      writeStoredPosition(storage, { left: rect.left, top: rect.top });
      suppressClick = true;
    } else {
      suppressClick = false;
    }
    button?.classList.remove("is-dragging");
    drag = null;
    if (!force) button?.releasePointerCapture?.(event.pointerId);
    if (moved) notifyPosition("drag");
  }

  function onLostPointerCapture(event) {
    finishPointer(event, true);
  }

  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (state.available) onActivate?.();
  }

  function onResize() {
    if (!root || root.hidden) return;
    const rect = root.getBoundingClientRect();
    if (root.style.left && root.style.top) applyPosition(rect.left, rect.top);
    notifyPosition("resize");
  }

  button?.addEventListener("pointerdown", onPointerDown);
  button?.addEventListener("pointermove", onPointerMove);
  button?.addEventListener("pointerup", finishPointer);
  button?.addEventListener("pointercancel", finishPointer);
  button?.addEventListener("lostpointercapture", onLostPointerCapture);
  button?.addEventListener("click", onClick);
  windowRef?.addEventListener?.("resize", onResize);
  updateLabels();

  return {
    setState,
    destroy() {
      button?.removeEventListener("pointerdown", onPointerDown);
      button?.removeEventListener("pointermove", onPointerMove);
      button?.removeEventListener("pointerup", finishPointer);
      button?.removeEventListener("pointercancel", finishPointer);
      button?.removeEventListener("lostpointercapture", onLostPointerCapture);
      button?.removeEventListener("click", onClick);
      windowRef?.removeEventListener?.("resize", onResize);
    },
    getPosition: readPosition,
  };
}

export const __testing = { POSITION_STORAGE_KEY, VIEWPORT_MARGIN };
