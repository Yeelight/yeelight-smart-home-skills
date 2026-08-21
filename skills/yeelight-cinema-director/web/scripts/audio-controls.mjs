export function setupAudioControls({ $, audio, state, updateSelection, setMessage }) {
  function clearSharedAudio() {
    if (state.audioSource !== "tab") return;
    audio.stop();
    state.audioReady = false;
    state.audioSource = "none";
    updateSelection();
  }

  $("share-audio").addEventListener("click", async () => {
    let capture = null;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("This browser does not expose tab audio sharing.");
      capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = capture.getAudioTracks?.().filter((track) => track?.readyState !== "ended") || [];
      if (!audioTracks.length) throw new Error("audio_track_unavailable");
      audio.connectStream(capture);
      state.audioReady = true;
      state.audioSource = "tab";
      for (const track of audioTracks) {
        track.addEventListener?.("ended", () => {
          if (audio.stream !== capture) return;
          audio.stop();
          state.audioReady = false;
          state.audioSource = "none";
          updateSelection();
          setMessage("Shared audio ended. Share the soundtrack tab or window again, or choose local audio.");
        }, { once: true });
      }
      updateSelection();
      setMessage("Shared audio connected. Keep the soundtrack tab or window playing while the console runs.");
    } catch (error) {
      if (capture && audio.stream !== capture) capture.getTracks?.().forEach((track) => track.stop());
      setMessage(error?.message === "audio_track_unavailable"
        ? "No audio track was shared. Enable page audio in the browser dialog, or choose local audio."
        : "Choose the tab or window playing the soundtrack and enable audio in the browser dialog, or use local audio.");
    }
  });

  $("local-audio").addEventListener("change", () => {
    const file = $("local-audio").files?.[0];
    if (!file) return;
    try {
      audio.connectFile(file);
      state.audioReady = true;
      state.audioSource = "file";
      updateSelection();
      setMessage(`Local audio ready: ${file.name}`);
    } catch (error) {
      if (error?.message === "audio_context_unavailable") {
        state.audioReady = false;
        state.audioSource = "none";
        updateSelection();
      }
      setMessage(error.message);
    }
  });

  window.addEventListener("beforeunload", () => audio.stop(), { once: true });
  return { clearSharedAudio };
}
