import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * Motor de Merged Reality (Cámara en vivo + Seguimiento de Manos MediaPipe +
 * Analizador Óptico de Luz Ambiental y Movimiento Humano sin dependencias).
 */
export class MergedRealityEngine {
  constructor(videoEl, overlayCanvas) {
    this.video = videoEl;
    this.overlay = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext('2d');

    this.active = false;
    this.facingMode = 'user'; // 'user' (frontal/espejo) | 'environment' (trasera móvil)
    this.stream = null;

    // MediaPipe HandLandmarker (carga progresiva con respaldo óptico)
    this.handLandmarker = null;
    this.mpReady = false;
    this.mpLoading = false;
    this.lastVideoTime = -1;

    // Lienzo diminuto 64×48 para fotometría ambiental y flujo de movimiento en vivo
    this.probeW = 64;
    this.probeH = 48;
    this.probeCanvas = document.createElement('canvas');
    this.probeCanvas.width = this.probeW;
    this.probeCanvas.height = this.probeH;
    this.probeCtx = this.probeCanvas.getContext('2d', { willReadFrequently: true });
    this.prevLuma = new Float32Array(this.probeW * this.probeH);

    // Estado exportado hacia el juego y el entorno 3D
    this.state = {
      roomBrightness: 0.72,
      humanMotion: 0.0,
      handDetected: false,
      handX: 0, // [-1, 1] izquierda a derecha en pantalla
      handY: 0, // [-1, 1] abajo a arriba
      handDepth: 0, // [-1, 1] cercanía estimada
      isPinching: false,
      justPinched: false,
      waveImpulseX: 0,
      trackerType: 'none' // 'mediapipe' | 'optical' | 'none'
    };

    this._wasPinching = false;
    this._prevHandX = 0;
  }

  async startCamera(facingMode = this.facingMode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tu navegador no expone acceso a cámara (getUserMedia).');
    }

    this.stopCamera();
    this.facingMode = facingMode;

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    this.video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
    await this.video.play();
    this.active = true;

    // Iniciar carga asíncrona de MediaPipe HandLandmarker sin bloquear el juego
    this.initMediaPipeHands().catch(() => {
      this.state.trackerType = 'optical';
    });

    return true;
  }

  async switchCamera() {
    const next = this.facingMode === 'user' ? 'environment' : 'user';
    return this.startCamera(next);
  }

  stopCamera() {
    this.active = false;
    this.state.handDetected = false;
    this.state.isPinching = false;
    this.state.justPinched = false;
    this.state.humanMotion = 0;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.clearOverlay();
  }

  async initMediaPipeHands() {
    if (this.mpReady || this.mpLoading) return;
    this.mpLoading = true;
    try {
      let vision;
      try {
        // Primero intentar runtime WASM local copiado en ./wasm
        vision = await FilesetResolver.forVisionTasks('./wasm');
      } catch {
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );
      }

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      this.mpReady = true;
      this.state.trackerType = 'mediapipe';
    } catch (err) {
      console.warn('[MergedReality] Usando seguimiento óptico ligero de respaldo:', err);
      this.state.trackerType = 'optical';
    } finally {
      this.mpLoading = false;
    }
  }

  clearOverlay() {
    if (!this.overlayCtx) return;
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  resizeOverlay(w, h) {
    this.overlay.width = w;
    this.overlay.height = h;
  }

  update(now = performance.now()) {
    this.state.justPinched = false;
    this.state.waveImpulseX = 0;

    if (!this.active || !this.video || this.video.readyState < 2) {
      return this.state;
    }

    // 1. Fotometría ambiental y flujo de movimiento en vivo (64×48)
    this.probeCtx.drawImage(this.video, 0, 0, this.probeW, this.probeH);
    const data = this.probeCtx.getImageData(0, 0, this.probeW, this.probeH).data;
    const totalPx = this.probeW * this.probeH;

    let sumLuma = 0;
    let sumMotion = 0;
    let motionWeightedX = 0;
    let motionWeightedY = 0;

    for (let i = 0; i < totalPx; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      sumLuma += luma;

      const diff = Math.abs(luma - this.prevLuma[i]);
      this.prevLuma[i] = luma;

      if (diff > 0.065) {
        sumMotion += diff;
        const px = (i % this.probeW) / this.probeW;
        const py = Math.floor(i / this.probeW) / this.probeH;
        motionWeightedX += px * diff;
        motionWeightedY += py * diff;
      }
    }

    const avgLuma = sumLuma / totalPx;
    this.state.roomBrightness += (Math.min(1, Math.max(0.12, avgLuma * 1.35)) - this.state.roomBrightness) * 0.08;

    const normMotion = Math.min(1, (sumMotion / totalPx) * 8.5);
    this.state.humanMotion += (normMotion - this.state.humanMotion) * 0.22;

    // 2. Seguimiento de manos MediaPipe (21 puntos 3D + gesto de pellizco)
    this.clearOverlay();
    const mirror = this.facingMode === 'user';

    if (this.mpReady && this.handLandmarker && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.handLandmarker.detectForVideo(this.video, now);

      if (result.landmarks && result.landmarks.length > 0) {
        const lm = result.landmarks[0];
        this.state.handDetected = true;
        this.state.trackerType = 'mediapipe';

        // Punto medio entre base del índice (5) y centro de palma (9)
        const rawX = (lm[5].x + lm[9].x) * 0.5;
        const rawY = (lm[5].y + lm[9].y) * 0.5;
        const screenX = mirror ? 1 - rawX : rawX;
        const nx = screenX * 2 - 1;
        const ny = -(rawY * 2 - 1);

        // Tamaño aparente de la mano (muñeca 0 a nudillo medio 9) estima profundidad
        const handSpan = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
        const depthEst = Math.min(1, Math.max(-1, (handSpan - 0.16) * 5.0));

        const vx = nx - this._prevHandX;
        this._prevHandX = nx;
        if (Math.abs(vx) > 0.045) {
          this.state.waveImpulseX = vx * 3.2;
        }

        this.state.handX += (nx - this.state.handX) * 0.38;
        this.state.handY += (ny - this.state.handY) * 0.38;
        this.state.handDepth += (depthEst - this.state.handDepth) * 0.25;

        // Gesto de pellizco (pulgar 4 e índice 8) = disparador del escáner / clic
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const pinching = pinchDist < 0.058;
        if (pinching && !this._wasPinching) {
          this.state.justPinched = true;
        }
        this._wasPinching = pinching;
        this.state.isPinching = pinching;

        this.drawHandSkeleton(lm, mirror, pinching);
        return this.state;
      } else {
        this.state.handDetected = false;
        this.state.isPinching = false;
        this._wasPinching = false;
      }
    }

    // 3. Respaldo óptico por centroide de movimiento si MediaPipe no ve mano
    if (!this.mpReady && sumMotion > 3.2) {
      const cx = motionWeightedX / sumMotion;
      const cy = motionWeightedY / sumMotion;
      const screenX = mirror ? 1 - cx : cx;
      this.state.handDetected = true;
      this.state.trackerType = 'optical';
      this.state.handX += ((screenX * 2 - 1) - this.state.handX) * 0.22;
      this.state.handY += (-(cy * 2 - 1) - this.state.handY) * 0.22;
      this.drawOpticalReticle(screenX, cy);
    } else if (!this.mpReady) {
      this.state.handDetected = false;
    }

    return this.state;
  }

  drawHandSkeleton(lm, mirror, pinching) {
    const ctx = this.overlayCtx;
    const W = this.overlay.width;
    const H = this.overlay.height;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
    ];

    ctx.save();
    ctx.strokeStyle = pinching ? '#34d399' : 'rgba(56, 189, 248, 0.78)';
    ctx.lineWidth = pinching ? 3.5 : 2.2;

    connections.forEach(([a, b]) => {
      const ax = (mirror ? 1 - lm[a].x : lm[a].x) * W;
      const ay = lm[a].y * H;
      const bx = (mirror ? 1 - lm[b].x : lm[b].x) * W;
      const by = lm[b].y * H;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });

    lm.forEach((pt, idx) => {
      const px = (mirror ? 1 - pt.x : pt.x) * W;
      const py = pt.y * H;
      ctx.fillStyle = idx === 4 || idx === 8 ? '#34d399' : '#f8fafc';
      ctx.beginPath();
      ctx.arc(px, py, idx === 4 || idx === 8 ? 6 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (pinching) {
      const mx = ((mirror ? 1 - lm[4].x : lm[4].x) + (mirror ? 1 - lm[8].x : lm[8].x)) * 0.5 * W;
      const my = (lm[4].y + lm[8].y) * 0.5 * H;
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOpticalReticle(nx, ny) {
    const ctx = this.overlayCtx;
    const x = nx * this.overlay.width;
    const y = ny * this.overlay.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
