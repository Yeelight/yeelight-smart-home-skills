export class AudioEngine {
  constructor() { this.context = null; this.analyser = null; this.source = null; this.data = null; this.stream = null; this.element = null; this.objectUrl = null; }

  connectStream(stream) {
    const audioTracks = typeof stream?.getAudioTracks === "function" ? stream.getAudioTracks().filter((track) => track?.readyState !== "ended") : [];
    if (!audioTracks.length) {
      stopTracks(stream);
      throw new Error("audio_track_unavailable");
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      stopTracks(stream);
      throw new Error("audio_context_unavailable");
    }
    let context;
    try {
      context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.stop();
      this.context = context;
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.source = source;
    } catch (error) {
      try { context?.close(); } catch {}
      stopTracks(stream);
      throw error;
    }
    this.stream = stream;
    return this;
  }

  connectFile(file) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      this.stop();
      throw new Error("audio_context_unavailable");
    }
    let context;
    let element;
    let objectUrl;
    try {
      context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      element = new Audio();
      objectUrl = URL.createObjectURL(file);
      element.src = objectUrl;
      element.loop = true;
      const source = context.createMediaElementSource(element);
      source.connect(analyser);
      analyser.connect(context.destination);
      this.stop();
      this.context = context;
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.source = source;
      this.element = element;
      this.objectUrl = objectUrl;
    } catch (error) {
      try { element?.pause(); } catch {}
      try { if (element) element.removeAttribute("src"); } catch {}
      try { if (objectUrl) URL.revokeObjectURL(objectUrl); } catch {}
      try { context?.close(); } catch {}
      throw error;
    }
    element.play().catch(() => undefined);
    return this;
  }

  energy() {
    if (!this.analyser || !this.data) return null;
    this.analyser.getByteFrequencyData(this.data);
    const total = this.data.reduce((sum, value) => sum + value, 0);
    return Math.min(1, total / Math.max(1, this.data.length * 255));
  }

  stop() {
    try { this.source?.disconnect(); } catch {}
    try { this.element?.pause(); } catch {}
    try { if (this.element) this.element.removeAttribute("src"); } catch {}
    try { if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); } catch {}
    try { this.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    try { this.context?.close(); } catch {}
    this.source = null; this.analyser = null; this.context = null; this.data = null; this.stream = null; this.element = null; this.objectUrl = null;
  }
}

function stopTracks(stream) {
  try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
}
