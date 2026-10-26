/**
 * Sintetizador de audio procedural WebAudio para feedback táctil del dispositivo
 * y respuesta acústica del entorno cafetero.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastTickTime = 0;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Clic mecánico táctil de los botones de policarbonato (▲ ● ▼ y botón lateral) */
  playButtonClick(type = 'nav') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === 'select' ? 'triangle' : 'sine';
    const baseFreq = type === 'select' ? 880 : type === 'side' ? 660 : 540;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.045);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Pulso progresivo mientras el lente Ø8mm y la rejilla Ø12mm escanean */
  playScanTick(progress = 0, isSick = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastTickTime < 0.09) return;
    this.lastTickTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSick ? 'sawtooth' : 'sine';
    const freq = 420 + progress * 560 + (isSick ? 90 : 0);
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  /** Confirmación de diagnóstico completado en pantalla IPS 50×50 mm */
  playDiagnosisComplete(isHealthy = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = isHealthy ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 440.0, 523.25];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isHealthy ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);

      gain.gain.setValueAtTime(0.11, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.17);
    });
  }

  /** Nebulización / aplicación de tratamiento y respuesta del cafetal */
  playTreatmentSpray(success = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Ruido filtrado suave tipo aspersión / brisa
    const bufferSize = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(success ? 1600 : 480, now);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Acorde armónico si el tratamiento fue exitoso
    if (success) {
      [523.25, 659.25, 783.99, 987.77].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.08 + i * 0.06);
        g.gain.setValueAtTime(0.09, now + 0.08 + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38 + i * 0.06);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + 0.08 + i * 0.06);
        osc.stop(now + 0.4 + i * 0.06);
      });
    } else {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(155, now + 0.25);
      g.gain.setValueAtTime(0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  }

  /** Sonido metálico de corte de las tijeras de podar bypass */
  playShearsSnip(success = true) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Chasquido metálico agudo de hojas de acero cerrándose
    [2400, 3450].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      osc.frequency.exponentialRampToValueAtTime(680, now + idx * 0.03 + 0.065);
      gain.gain.setValueAtTime(0.15, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.075);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.03);
      osc.stop(now + idx * 0.03 + 0.08);
    });

    if (success) {
      [587.33, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.09 + i * 0.055);
        g.gain.setValueAtTime(0.085, now + 0.09 + i * 0.055);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.34 + i * 0.055);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + 0.09 + i * 0.055);
        osc.stop(now + 0.36 + i * 0.055);
      });
    }
  }

  /** Aviso corto cuando se intenta escanear sin estar en el menú [1] ESCÁNER IA */
  playModeWarning() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [340, 270].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      g.gain.setValueAtTime(0.06, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.065);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.07);
    });
  }
}
