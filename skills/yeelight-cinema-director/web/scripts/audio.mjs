export class AudioEngine {
  constructor() { this.context = null; this.analyser = null; this.source = null; this.data = null; }

  connectStream(stream) {
    this.stop();
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("audio_context_unavailable");
    this.context = new Context();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    return this;
  }

  connectFile(file) {
    this.stop();
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("audio_context_unavailable");
    this.context = new Context();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    const element = new Audio();
    element.src = URL.createObjectURL(file);
    element.loop = true;
    element.play().catch(() => undefined);
    this.source = this.context.createMediaElementSource(element);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
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
    try { this.context?.close(); } catch {}
    this.source = null; this.analyser = null; this.context = null; this.data = null;
  }
}
