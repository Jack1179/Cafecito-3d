import * as THREE from 'three';
import { DISEASES, TREATMENTS } from '../game/diseases.js';

export const SCREEN_MODES = [
  { id: 'optical', short: 'ÓPTICA', title: 'CÁMARA IA Ø8mm' },
  { id: 'climate', short: 'CLIMA', title: 'SENSOR Ø12mm T/HR' },
  { id: 'uv', short: 'UV·IR', title: 'ESPECTRO FOLIAR' },
  { id: 'treat', short: 'CURAR', title: 'PROTOCOLO FITO' }
];

/**
 * Renderizador dinámico de la pantalla IPS 50 mm × 50 mm del dispositivo.
 * Combina la vista en tiempo real del lente trasero Ø8mm, telemetría de la
 * rejilla Ø12mm y menús interactivos controlados por los botones ▲ ● ▼ y Lateral.
 */
export class IPSScreenRenderer {
  constructor() {
    this.size = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d');

    // Buffer offscreen 128×128 para la cámara trasera Ø8mm
    this.camSize = 128;
    this.camCanvas = document.createElement('canvas');
    this.camCanvas.width = this.camSize;
    this.camCanvas.height = this.camSize;
    this.camCtx = this.camCanvas.getContext('2d');
    this.camImageData = this.camCtx.createImageData(this.camSize, this.camSize);
    this.pixelBuffer = new Uint8Array(this.camSize * this.camSize * 4);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.tempHistory = new Array(44).fill(21.0);
    this.humHistory = new Array(44).fill(68.0);
    this.lastHistoryPush = 0;

    this.flashBanner = null;
    this.flashUntil = 0;
  }

  showBanner(text, color = '#10b981', durationMs = 1800) {
    this.flashBanner = { text, color };
    this.flashUntil = performance.now() + durationMs;
  }

  /**
   * Copia los píxeles del WebGLRenderTarget de la cámara Ø8mm al buffer 2D,
   * aplicando inversión vertical WebGL y filtro falso-color UV si aplica.
   */
  ingestLensPixels(renderer, renderTarget, modeId, webcamVideo = null) {
    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      this.camSize,
      this.camSize,
      this.pixelBuffer
    );

    // Si hay webcam activa en Merged Reality, dibujarla primero como fondo real
    let bgData = null;
    if (webcamVideo && webcamVideo.readyState >= 2) {
      this.camCtx.save();
      this.camCtx.translate(this.camSize, 0);
      this.camCtx.scale(-1, 1);
      this.camCtx.drawImage(webcamVideo, 0, 0, this.camSize, this.camSize);
      this.camCtx.restore();
      bgData = this.camCtx.getImageData(0, 0, this.camSize, this.camSize).data;
    }

    const out = this.camImageData.data;
    const sz = this.camSize;
    const isUV = modeId === 'uv';

    for (let y = 0; y < sz; y++) {
      const srcRow = (sz - 1 - y) * sz * 4;
      const dstRow = y * sz * 4;
      for (let x = 0; x < sz; x++) {
        const si = srcRow + x * 4;
        const di = dstRow + x * 4;

        let r = this.pixelBuffer[si];
        let g = this.pixelBuffer[si + 1];
        let b = this.pixelBuffer[si + 2];
        const a = this.pixelBuffer[si + 3];

        if (bgData && a < 250) {
          const alpha = a / 255;
          r = r * alpha + bgData[di] * (1 - alpha);
          g = g * alpha + bgData[di + 1] * (1 - alpha);
          b = b * alpha + bgData[di + 2] * (1 - alpha);
        }

        if (isUV) {
          // Índice espectral clorofila vs lesión necrótica/esporas
          const ndviLike = (g - r) / (g + r + 12);
          if (ndviLike > 0.14) {
            // Clorofila vigorosa -> cian/esmeralda fluorescente
            out[di] = Math.min(255, r * 0.25);
            out[di + 1] = Math.min(255, 110 + g * 0.85);
            out[di + 2] = Math.min(255, 150 + g * 0.65);
          } else if (r > 95 && r > g * 1.05) {
            // Anomalía térmica / lesión fúngica o cereza -> magenta/ámbar intenso
            out[di] = Math.min(255, 140 + r * 0.7);
            out[di + 1] = Math.max(0, g * 0.35);
            out[di + 2] = Math.min(255, 180 + b * 0.5);
          } else {
            // Fondo azul nocturno UV
            const lum = (r + g + b) * 0.18;
            out[di] = lum * 0.45;
            out[di + 1] = lum * 0.65;
            out[di + 2] = Math.min(255, 45 + lum * 1.4);
          }
          out[di + 3] = 255;
        } else {
          out[di] = r;
          out[di + 1] = g;
          out[di + 2] = b;
          out[di + 3] = 255;
        }
      }
    }

    this.camCtx.putImageData(this.camImageData, 0, 0);
  }

  /**
   * Actualiza el lienzo 512×512 de la pantalla IPS 50×50 mm
   */
  render(state, now = performance.now()) {
    const ctx = this.ctx;
    const W = this.size;
    const H = this.size;

    const {
      screenModeIndex = 0,
      selectedTreatmentIndex = 0,
      targetStation = null,
      distanceCm = 24,
      isScanning = false,
      scanProgress = 0,
      liveTemp = 21.2,
      liveHumidity = 68.0,
      liveVoc = 32,
      mrMode = '3d',
      ecosystemHealth = 82
    } = state;

    if (now - this.lastHistoryPush > 260) {
      this.lastHistoryPush = now;
      this.tempHistory.push(liveTemp);
      this.tempHistory.shift();
      this.humHistory.push(liveHumidity);
      this.humHistory.shift();
    }

    const mode = SCREEN_MODES[screenModeIndex] || SCREEN_MODES[0];

    // Fondo IPS oscuro de alto contraste
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#09131c');
    bgGrad.addColorStop(1, '#050b11');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Barra superior de estado del dispositivo
    ctx.fillStyle = '#0f1f2e';
    ctx.fillRect(0, 0, W, 46);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 46);
    ctx.lineTo(W, 46);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('CAFECITO·MR', 16, 29);

    const mrBadge = mrMode === 'webcam' ? 'MR·CAM' : mrMode === 'webxr' ? 'WEBXR' : '3D·SIM';
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText(`[${mrBadge}]`, 162, 29);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(`ECO ${Math.round(ecosystemHealth)}%`, 276, 29);

    // Icono de batería 85g LiPo
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(436, 15, 44, 18);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(439, 18, 36, 12);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(480, 19, 4, 10);

    // Pestañas de modos (controlables con ▲/▼ o clic)
    const tabW = (W - 24) / SCREEN_MODES.length;
    SCREEN_MODES.forEach((m, idx) => {
      const tx = 12 + idx * tabW;
      const active = idx === screenModeIndex;
      ctx.fillStyle = active ? '#10b981' : '#112233';
      this.roundRect(ctx, tx + 2, 54, tabW - 4, 32, 7, true, false);
      ctx.fillStyle = active ? '#04130d' : '#94a3b8';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.short, tx + tabW / 2, 75);
    });
    ctx.textAlign = 'left';

    // Contenido principal según modo activo
    if (mode.id === 'optical' || mode.id === 'uv') {
      this.drawCameraViewport(ctx, state, mode.id === 'uv', now);
    } else if (mode.id === 'climate') {
      this.drawClimateMode(ctx, state);
    } else if (mode.id === 'treat') {
      this.drawTreatmentMode(ctx, state);
    }

    // Barra inferior de guía de botones físicos (▲ ● ▼ + Side)
    ctx.fillStyle = '#0b1824';
    ctx.fillRect(0, H - 52, W, 52);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, H - 52);
    ctx.lineTo(W, H - 52);
    ctx.stroke();

    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    if (mode.id === 'treat') {
      ctx.fillText('▲▼ ELEGIR PROTOCOLO   ● APLICAR   [LAT] ESCANEAR', 16, H - 21);
    } else {
      ctx.fillText('▲▼ CAMBIAR MODO   ● ACCIÓN/CURAR   [LAT] ESCÁNER', 16, H - 21);
    }

    // Banner emergente de feedback
    if (this.flashBanner && now < this.flashUntil) {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 12, 20, 0.92)';
      this.roundRect(ctx, 26, 205, W - 52, 68, 12, true, false);
      ctx.strokeStyle = this.flashBanner.color;
      ctx.lineWidth = 3;
      this.roundRect(ctx, 26, 205, W - 52, 68, 12, false, true);
      ctx.fillStyle = this.flashBanner.color;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.flashBanner.text, W / 2, 246);
      ctx.restore();
    }

    // Sutil scanline IPS
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let y = 48; y < H - 52; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    this.texture.needsUpdate = true;
  }

  drawCameraViewport(ctx, state, isUV, now) {
    const W = this.size;
    const {
      targetStation,
      distanceCm,
      isScanning,
      scanProgress,
      liveTemp,
      liveHumidity
    } = state;

    // Marco del feed de la cámara Ø8mm
    const vx = 18;
    const vy = 96;
    const vw = W - 36;
    const vh = 258;

    ctx.save();
    this.roundRect(ctx, vx, vy, vw, vh, 12, false, false);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.camCanvas, vx, vy, vw, vh);

    // Viñeta óptica del lente Ø8mm
    const radGrad = ctx.createRadialGradient(
      vx + vw / 2,
      vy + vh / 2,
      vw * 0.25,
      vx + vw / 2,
      vy + vh / 2,
      vw * 0.65
    );
    radGrad.addColorStop(0, 'rgba(0,0,0,0)');
    radGrad.addColorStop(1, 'rgba(2,8,16,0.55)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(vx, vy, vw, vh);

    // Retícula de visión artificial
    const cx = vx + vw / 2;
    const cy = vy + vh / 2;
    const lockColor = targetStation
      ? targetStation.scanned
        ? DISEASES[targetStation.diseaseId].accentColor
        : '#38bdf8'
      : 'rgba(148,163,184,0.6)';

    ctx.strokeStyle = lockColor;
    ctx.lineWidth = 2;
    const boxS = targetStation ? 76 + Math.sin(now * 0.008) * 4 : 58;
    // Esquinas del cuadro CV
    const corner = 18;
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * boxS, cy + sy * (boxS - corner));
      ctx.lineTo(cx + sx * boxS, cy + sy * boxS);
      ctx.lineTo(cx + sx * (boxS - corner), cy + sy * boxS);
      ctx.stroke();
    });

    // Línea láser horizontal durante escaneo activo
    if (isScanning || scanProgress > 0.02) {
      const scanY = vy + ((now * 0.22) % vh);
      ctx.strokeStyle = isUV ? '#e879f9' : '#34d399';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(vx + 10, scanY);
      ctx.lineTo(vx + vw - 10, scanY);
      ctx.stroke();

      // Anillo de progreso circular
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * scanProgress);
      ctx.stroke();
    }

    // Etiquetas HUD dentro del visor óptico
    const distFmt =
      distanceCm >= 100 ? `${(distanceCm / 100).toFixed(1)}m` : `${Math.round(distanceCm)}cm`;
    ctx.fillStyle = 'rgba(6, 14, 23, 0.72)';
    ctx.fillRect(vx + 10, vy + 10, 192, 26);
    ctx.fillStyle = isUV ? '#f0abfc' : '#7dd3fc';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(
      isUV ? 'LENTE Ø8mm · FLUOR UV' : `LENTE Ø8mm · D:${distFmt}`,
      vx + 16,
      vy + 28
    );

    // Brújula de rastreo de campo hacia la siguiente mata pendiente
    if (typeof state.compassAngle === 'number' && typeof state.compassDistM === 'number') {
      const rx = vx + vw - 34;
      const ry = vy + 34;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.fillStyle = 'rgba(6, 14, 23, 0.78)';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(state.compassAngle);
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(8, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${state.compassDistM.toFixed(1)}m`, rx, ry + 34);
      ctx.textAlign = 'left';
    }

    if (targetStation) {
      const dis = DISEASES[targetStation.diseaseId];
      ctx.fillStyle = 'rgba(6, 14, 23, 0.78)';
      ctx.fillRect(vx + 10, vy + vh - 36, vw - 20, 28);
      ctx.fillStyle = targetStation.scanned ? dis.accentColor : '#f8fafc';
      ctx.font = 'bold 14px ui-monospace, monospace';
      const label = targetStation.scanned
        ? `IA: ${dis.shortName} (${Math.round(targetStation.health)}% vigor)`
        : `EN MIRA: ${targetStation.name.toUpperCase()}`;
      ctx.fillText(label, vx + 18, vy + vh - 17);
    }

    ctx.restore();

    // Borde exterior del visor
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, vx, vy, vw, vh, 12, false, true);

    // Panel inferior de lectura rápida + diagnóstico
    const py = 364;
    ctx.fillStyle = '#0e1d2b';
    this.roundRect(ctx, 18, py, W - 36, 84, 10, true, false);

    // Mini lecturas del sensor Ø12mm
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(
      `SHT Ø12mm: ${liveTemp.toFixed(1)}°C  |  HR: ${Math.round(liveHumidity)}%  |  BROTES: ${state.remainingSick ?? 0}`,
      26,
      py + 24
    );

    if (!targetStation) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('Camina por el cafetal buscando matas o grano', 26, py + 52);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Sigue la brújula verde (arriba der.) y acércate < 3m', 26, py + 73);
    } else if (!targetStation.scanned) {
      const pct = Math.round(scanProgress * 100);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText(
        isScanning ? `Analizando tejido vegetal... ${pct}%` : 'Objetivo a tiro — Pulsa Escáner',
        26,
        py + 52
      );
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Mantén Botón Lateral, Espacio o Gatillo Quest 3', 26, py + 73);
    } else {
      const dis = DISEASES[targetStation.diseaseId];
      ctx.fillStyle = dis.accentColor;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(`${dis.name} [${dis.code}]`, 26, py + 51);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px system-ui, sans-serif';
      const rec = TREATMENTS.find((t) => t.id === dis.requiredTreatment);
      ctx.fillText(`Acción: ${rec ? rec.name : dis.recommendation}`, 26, py + 73);
    }
  }

  drawClimateMode(ctx, state) {
    const W = this.size;
    const { liveTemp, liveHumidity, liveVoc, targetStation } = state;

    // Tarjetas grandes Temp y Humedad de la rejilla Ø12mm
    ctx.fillStyle = '#0e1e2e';
    this.roundRect(ctx, 18, 98, 230, 112, 12, true, false);
    this.roundRect(ctx, 264, 98, 230, 112, 12, true, false);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText('TEMPERATURA (Ø12mm)', 32, 122);
    ctx.fillText('HUMEDAD RELATIVA', 278, 122);

    const tempColor = liveTemp > 26 ? '#f97316' : liveTemp < 17.5 ? '#38bdf8' : '#34d399';
    ctx.fillStyle = tempColor;
    ctx.font = 'bold 42px ui-monospace, monospace';
    ctx.fillText(`${liveTemp.toFixed(1)}°C`, 32, 172);

    const humColor = liveHumidity > 82 ? '#a855f7' : liveHumidity < 50 ? '#eab308' : '#38bdf8';
    ctx.fillStyle = humColor;
    ctx.fillText(`${Math.round(liveHumidity)}%`, 278, 172);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Óptimo café: 19–23 °C', 32, 198);
    ctx.fillText('Óptimo café: 60–75 % HR', 278, 198);

    // Gráfico de serie temporal en vivo
    const gx = 18;
    const gy = 222;
    const gw = W - 36;
    const gh = 136;
    ctx.fillStyle = '#091520';
    this.roundRect(ctx, gx, gy, gw, gh, 10, true, false);
    ctx.strokeStyle = 'rgba(56,189,248,0.22)';
    this.roundRect(ctx, gx, gy, gw, gh, 10, false, true);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('HISTORIAL MICROCLIMA EN TIEMPO REAL (T °C / HR %)', gx + 14, gy + 20);

    // Curva de humedad
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.humHistory.forEach((h, i) => {
      const px = gx + 14 + (i / (this.humHistory.length - 1)) * (gw - 28);
      const py = gy + gh - 16 - ((h - 30) / 70) * (gh - 46);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Curva de temperatura
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.tempHistory.forEach((t, i) => {
      const px = gx + 14 + (i / (this.tempHistory.length - 1)) * (gw - 28);
      const py = gy + gh - 16 - ((t - 12) / 24) * (gh - 46);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Panel VOCs y riesgo fúngico
    ctx.fillStyle = '#0e1e2e';
    this.roundRect(ctx, 18, 370, W - 36, 78, 10, true, false);
    const grainM = targetStation
      ? DISEASES[targetStation.diseaseId].grainMoisture
      : 11.4;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(`VOCs FOLIARES: ${Math.round(liveVoc)} ppb   |   HUM. GRANO: ${grainM.toFixed(1)}%`, 30, 398);

    let riskMsg = 'Microclima equilibrado: baja presión de Roya.';
    let riskCol = '#34d399';
    if (liveHumidity > 83) {
      riskMsg = 'ALERTA: Alta humedad favorece Roya y Antracnosis.';
      riskCol = '#f97316';
    } else if (liveTemp > 26.2) {
      riskMsg = 'ALERTA: Calor seco favorece Broca y Mancha de Hierro.';
      riskCol = '#eab308';
    }
    ctx.fillStyle = riskCol;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(riskMsg, 30, 428);
  }

  drawTreatmentMode(ctx, state) {
    const W = this.size;
    const { selectedTreatmentIndex = 0, targetStation } = state;

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const targetLabel = targetStation
      ? `DESTINO: ${targetStation.name} ${targetStation.scanned ? '(' + DISEASES[targetStation.diseaseId].shortName + ')' : '(Sin escanear)'}`
      : 'DESTINO: Apunta a una mata o lote de café';
    ctx.fillText(targetLabel, 20, 112);

    TREATMENTS.forEach((tr, idx) => {
      const y = 124 + idx * 64;
      const isSelected = idx === selectedTreatmentIndex;
      const isRecommended =
        targetStation &&
        targetStation.scanned &&
        DISEASES[targetStation.diseaseId].requiredTreatment === tr.id;

      ctx.fillStyle = isSelected ? '#153042' : '#0c1926';
      this.roundRect(ctx, 18, y, W - 36, 56, 10, true, false);

      if (isSelected) {
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = 2.5;
        this.roundRect(ctx, 18, y, W - 36, 56, 10, false, true);
      }

      ctx.fillStyle = tr.color;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(tr.icon, 32, y + 35);

      ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(tr.name, 62, y + 25);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(tr.description.slice(0, 56), 62, y + 44);

      if (isRecommended) {
        ctx.fillStyle = '#10b981';
        this.roundRect(ctx, W - 122, y + 8, 92, 20, 5, true, false);
        ctx.fillStyle = '#04130d';
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillText('SUGERIDO IA', W - 114, y + 22);
      }
    });
  }

  roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
