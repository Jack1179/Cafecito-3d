import * as THREE from 'three';
import { DISEASES, TREATMENTS, STATIONS_CONFIG } from './game/diseases.js';
import { GameDirector } from './game/gameState.js';
import { SoundEngine } from './audio/soundEngine.js';
import { IPSScreenRenderer, SCREEN_MODES } from './device/ipsScreen.js';
import { HandheldMonitor3D } from './device/monitorModel.js';
import { CoffeeStation3D, TreatmentFXSystem } from './world/coffeePlant.js';
import { CoffeeEnvironment } from './world/environment.js';
import { MergedRealityEngine } from './mr/mergedReality.js';
import { WebXRManager } from './mr/webxrManager.js';

// ============================================================================
// 1. INICIALIZACIÓN DE ESCENA THREE.JS, CÁMARAS Y AUDIO
// ============================================================================
const canvas = document.getElementById('sceneCanvas');
const videoEl = document.getElementById('mrVideo');
const handOverlay = document.getElementById('handOverlayCanvas');
const hudRoot = document.getElementById('hudRoot');

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.04,
  35
);
camera.position.set(0, 0.04, 0.28);
camera.lookAt(0, -0.06, -0.85);

// RenderTarget 128×128 para la cámara trasera Ø8 mm del dispositivo
const lensRenderTarget = new THREE.WebGLRenderTarget(128, 128, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});

const sound = new SoundEngine();
const ipsScreen = new IPSScreenRenderer();
const monitor = new HandheldMonitor3D(ipsScreen.texture);
// Escala ergonómica en vista pantalla (1.75× de 120×65×18 mm para nitidez de lectura IPS)
monitor.root.scale.setScalar(1.75);
scene.add(monitor.root);

const environment = new CoffeeEnvironment(scene);
const fxSystem = new TreatmentFXSystem(scene);

// Construir las 5 estaciones interactivas (3 matas + cerezas + café pergamino)
const stations = STATIONS_CONFIG.map((cfg) => {
  const st = new CoffeeStation3D(cfg);
  environment.portalGroup.add(st.group);
  return st;
});

// ============================================================================
// 2. ESTADO INTERACTIVO DEL APARATO Y JUEGO
// ============================================================================
const appState = {
  mrMode: '3d', // '3d' | 'webcam' | 'webxr'
  mrBlend: 0.42,
  screenModeIndex: 0, // 0: Óptica, 1: Clima, 2: UV, 3: Curar
  selectedTreatmentIndex: 0,
  focusedStationIndex: 1, // Empieza apuntando a Mata #2 Central
  aimOffset: new THREE.Vector2(0, 0), // Desplazamiento libre con arrastre o mano
  zoomDistanceCm: 25,
  isScanning: false,
  scanProgress: 0,
  cadInspection: false
};

let toastTimer = null;
function showToast(msg, borderHex = '#34d399', duration = 3000) {
  const el = document.getElementById('toastBanner');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = borderHex;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

const game = new GameDirector(stations, {
  onLog: (msg, level) => {
    showToast(msg, level === 'warn' ? '#f97316' : '#38bdf8', 3200);
  },
  onDiagnosis: (station, dis) => {
    sound.playDiagnosisComplete(dis.id === 'healthy');
    ipsScreen.showBanner(`DIAGNÓSTICO: ${dis.shortName}`, dis.accentColor, 2000);

    // Preseleccionar automáticamente el protocolo sugerido para agilizar la respuesta
    const recIdx = TREATMENTS.findIndex((t) => t.id === dis.requiredTreatment);
    if (recIdx >= 0) {
      appState.selectedTreatmentIndex = recIdx;
      renderProtocolButtons();
    }
    updateDiagnosisPanel();
    renderStationTabs();
    showToast(
      `${station.name}: ${dis.name} detectada. Pulsa "● Aplicar" para ejecutar ${TREATMENTS[appState.selectedTreatmentIndex].shortLabel}.`,
      dis.accentColor,
      3800
    );
  },
  onWaveComplete: (wave, score, savedKg) => {
    sound.playTreatmentSpray(true);
    const modal = document.getElementById('waveModal');
    document.getElementById('waveModalTitle').textContent = `¡Ronda #${wave} Protegida con Éxito!`;
    document.getElementById('waveModalSummary').textContent =
      `Has diagnosticado y sanado todas las matas y lotes de café. Puntaje acumulado: ${score} pts · Cosecha salvada: ${savedKg.toFixed(1)} kg de Café Especial.`;
    modal.classList.remove('hidden');
  }
});

game.startWave(1);

// ============================================================================
// 3. MOTORES MERGED REALITY (WEBCAM + MANOS) Y WEBXR AR
// ============================================================================
const mrEngine = new MergedRealityEngine(videoEl, handOverlay);
mrEngine.resizeOverlay(window.innerWidth, window.innerHeight);

const xrManager = new WebXRManager(renderer, hudRoot, {
  onSupportChecked: (supported) => {
    const btnXR = document.getElementById('btnModeXR');
    if (!supported && btnXR) {
      btnXR.title = 'WebXR AR requiere visor Quest o móvil Android compatible (usa Merged Reality en PC)';
    }
  },
  onSessionStarted: (controller) => {
    appState.mrMode = 'webxr';
    monitor.root.scale.setScalar(1.0); // Escala métrica real 1:1 (120×65×18 mm) en AR
    if (controller) {
      scene.add(controller);
    }
    environment.setRealityMode('webxr');
    updateModeButtonsUI();
    showToast('Sesión WebXR Mixed Reality activa: apunta con tu control o pantalla.', '#34d399');
  },
  onSessionEnded: () => {
    monitor.root.scale.setScalar(1.75);
    switchToMode('3d');
  },
  onTriggerDown: () => {
    appState.isScanning = true;
    monitor.triggerButtonPress('side');
    sound.playButtonClick('side');
  },
  onTriggerUp: () => {
    appState.isScanning = false;
  }
});

async function switchToMode(targetMode) {
  if (targetMode === 'webcam') {
    try {
      await mrEngine.startCamera('user');
      videoEl.classList.add('active');
      appState.mrMode = 'webcam';
      environment.setRealityMode('webcam', appState.mrBlend);
      document.getElementById('mrSubBar').classList.remove('hidden');
      updateModeButtonsUI();
      showToast(
        'Merged Reality activa: mueve tu mano frente a la cámara (pellizca para escanear, agita para ventilar).',
        '#38bdf8',
        4200
      );
    } catch (err) {
      showToast(
        `No se pudo abrir la cámara (${err.message}). Continuando en Cafetal 3D interactivo.`,
        '#f97316',
        4000
      );
      switchToMode('3d');
    }
  } else if (targetMode === 'webxr') {
    mrEngine.stopCamera();
    videoEl.classList.remove('active');
    document.getElementById('mrSubBar').classList.add('hidden');
    try {
      await xrManager.startARSession();
    } catch {
      showToast(
        'Este dispositivo no tiene visor WebXR AR activo. ¡Activando Merged Reality por cámara o Cafetal 3D!',
        '#f59e0b',
        4200
      );
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        switchToMode('webcam');
      } else {
        switchToMode('3d');
      }
    }
  } else {
    mrEngine.stopCamera();
    videoEl.classList.remove('active');
    document.getElementById('mrSubBar').classList.add('hidden');
    appState.mrMode = '3d';
    environment.setRealityMode('3d');
    updateModeButtonsUI();
  }
}

function updateModeButtonsUI() {
  document.getElementById('btnMode3D').classList.toggle('active', appState.mrMode === '3d');
  document.getElementById('btnModeMR').classList.toggle('active', appState.mrMode === 'webcam');
  document.getElementById('btnModeXR').classList.toggle('active', appState.mrMode === 'webxr');
}

// ============================================================================
// 4. LÓGICA DE BOTONES DEL DISPOSITIVO (▲ ● ▼, LATERAL Y PANTALLA IPS)
// ============================================================================
function handleDeviceButton(buttonId, uvHit = null) {
  if (buttonId === 'screen' && uvHit) {
    // Si hace clic en la franja superior de pestañas de la pantalla IPS 50×50 mm
    if (uvHit.y > 0.80 && uvHit.y < 0.91) {
      const tabIdx = Math.min(3, Math.max(0, Math.floor(uvHit.x * 4)));
      appState.screenModeIndex = tabIdx;
      sound.playButtonClick('nav');
      return;
    }
    // Clic en el centro de la pantalla equivale a Seleccionar / Escanear
    buttonId = 'select';
  }

  monitor.triggerButtonPress(buttonId);

  if (buttonId === 'up') {
    sound.playButtonClick('nav');
    if (SCREEN_MODES[appState.screenModeIndex].id === 'treat') {
      appState.selectedTreatmentIndex =
        (appState.selectedTreatmentIndex - 1 + TREATMENTS.length) % TREATMENTS.length;
      renderProtocolButtons();
    } else {
      appState.screenModeIndex =
        (appState.screenModeIndex - 1 + SCREEN_MODES.length) % SCREEN_MODES.length;
    }
  } else if (buttonId === 'down') {
    sound.playButtonClick('nav');
    if (SCREEN_MODES[appState.screenModeIndex].id === 'treat') {
      appState.selectedTreatmentIndex = (appState.selectedTreatmentIndex + 1) % TREATMENTS.length;
      renderProtocolButtons();
    } else {
      appState.screenModeIndex = (appState.screenModeIndex + 1) % SCREEN_MODES.length;
    }
  } else if (buttonId === 'side') {
    sound.playButtonClick('side');
    triggerInstantOrHoldScan();
  } else if (buttonId === 'select') {
    sound.playButtonClick('select');
    const st = stations[appState.focusedStationIndex];
    if (st && !st.scanned) {
      triggerInstantOrHoldScan();
    } else {
      executeSelectedTreatment();
    }
  }
}

function triggerInstantOrHoldScan() {
  const st = stations[appState.focusedStationIndex];
  if (!st) return;
  if (st.scanned) {
    const dis = DISEASES[st.diseaseId];
    ipsScreen.showBanner(`YA ESCANEADO: ${dis.shortName}`, dis.accentColor, 1400);
    return;
  }
  // Impulso de progreso por pulsación + barrido activo
  appState.isScanning = true;
  appState.scanProgress = Math.min(1, appState.scanProgress + 0.42);
  st.applyImpulse((Math.random() - 0.5) * 0.4, 0.25);

  if (appState.scanProgress >= 1) {
    appState.scanProgress = 1;
    appState.isScanning = false;
    game.completeStationScan(st);
  } else {
    setTimeout(() => {
      if (!pointerHoldingScan) appState.isScanning = false;
    }, 380);
  }
}

function executeSelectedTreatment() {
  const st = stations[appState.focusedStationIndex];
  const res = game.applyTreatment(st, appState.selectedTreatmentIndex);

  if (!res.ok) {
    sound.playTreatmentSpray(false);
    ipsScreen.showBanner(
      res.wrongProtocol ? 'PROTOCOLO INCORRECTO' : 'ESCANEA PRIMERO (LATERAL)',
      '#f97316',
      1900
    );
    showToast(res.reason, '#f97316', 3500);
    updateDiagnosisPanel();
    return;
  }

  // Emitir partículas 3D desde el dispositivo hacia la mata o bandeja de café
  const origin = monitor.root.position.clone();
  const dest = st.getFocusWorldPosition();
  fxSystem.emitSpray(origin, dest, res.treatment.particleColor);
  st.applyImpulse((Math.random() - 0.5) * 1.4, -0.9);

  sound.playTreatmentSpray(true);
  ipsScreen.showBanner(
    res.cured ? `¡CURADO! ${res.treatment.shortLabel}` : '¡LOTE SANO CERTIFICADO!',
    '#34d399',
    2100
  );
  showToast(res.message, '#34d399', 3600);
  updateDiagnosisPanel();
  renderStationTabs();
  renderProtocolButtons();
}

function triggerHumanVentilationGust(strength = 1.0) {
  stations.forEach((st) => {
    st.applyImpulse((Math.random() - 0.5 + 0.4) * 1.6 * strength, (Math.random() - 0.5) * 0.9);
  });
  sound.playButtonClick('nav');
  ipsScreen.showBanner('💨 BRISA HUMANA · AIREANDO FOLLAJE', '#38bdf8', 1300);
}

// ============================================================================
// 5. RAYCASTING 3D, MOUSE / TOUCH Y TECLADO
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let isDraggingScene = false;
let dragLastX = 0;
let dragLastY = 0;
let pointerMovedDist = 0;
let pointerHoldingScan = false;

function updatePointerNDC(clientX, clientY) {
  pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
}

canvas.addEventListener('pointerdown', (e) => {
  updatePointerNDC(e.clientX, e.clientY);
  raycaster.setFromCamera(pointerNDC, camera);

  // 1. ¿Hizo clic directamente sobre un botón físico o pantalla del monitor 3D?
  const devHits = raycaster.intersectObjects(monitor.interactiveMeshes, false);
  if (devHits.length > 0) {
    const hit = devHits[0];
    const btnId = hit.object.userData.buttonId;
    if (btnId === 'side') {
      pointerHoldingScan = true;
      appState.isScanning = true;
    }
    handleDeviceButton(btnId, hit.uv);
    return;
  }

  // 2. Iniciar arrastre espacial del dispositivo o selección de estación
  isDraggingScene = true;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  pointerMovedDist = 0;
});

window.addEventListener('pointermove', (e) => {
  updatePointerNDC(e.clientX, e.clientY);

  if (isDraggingScene) {
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    pointerMovedDist += Math.hypot(dx, dy);

    appState.aimOffset.x = THREE.MathUtils.clamp(appState.aimOffset.x + dx * 0.0022, -0.78, 0.78);
    appState.aimOffset.y = THREE.MathUtils.clamp(appState.aimOffset.y - dy * 0.0018, -0.28, 0.32);

    // Actualizar estación enfocada según cercanía horizontal al arrastrar
    selectNearestStationFromMonitorX(appState.aimOffset.x);
    return;
  }

  // Hover visual sobre botones 3D del monitor
  raycaster.setFromCamera(pointerNDC, camera);
  const devHits = raycaster.intersectObjects(monitor.interactiveMeshes, false);
  if (devHits.length > 0) {
    monitor.setHoveredButton(devHits[0].object.userData.buttonId);
    canvas.style.cursor = 'pointer';
  } else {
    monitor.setHoveredButton(null);
    canvas.style.cursor = 'grab';
  }
});

window.addEventListener('pointerup', (e) => {
  if (pointerHoldingScan) {
    pointerHoldingScan = false;
    appState.isScanning = false;
  }

  if (isDraggingScene) {
    isDraggingScene = false;
    // Si fue un toque/clic corto sobre una mata o muestra 3D, enfocar esa estación
    if (pointerMovedDist < 8) {
      updatePointerNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNDC, camera);
      const colliders = stations.map((s) => s.hitCollider);
      const stHits = raycaster.intersectObjects(colliders, false);
      if (stHits.length > 0) {
        focusStation(stHits[0].object.userData.stationIndex);
      }
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    appState.zoomDistanceCm = THREE.MathUtils.clamp(
      appState.zoomDistanceCm + e.deltaY * 0.03,
      12,
      42
    );
    document.getElementById('sliderDepth').value = String(Math.round(appState.zoomDistanceCm));
  },
  { passive: false }
);

function selectNearestStationFromMonitorX(worldX) {
  let bestIdx = appState.focusedStationIndex;
  let bestDist = Infinity;
  stations.forEach((st) => {
    const dx = Math.abs(st.group.position.x - worldX);
    if (dx < bestDist) {
      bestDist = dx;
      bestIdx = st.index;
    }
  });
  if (bestIdx !== appState.focusedStationIndex) {
    appState.focusedStationIndex = bestIdx;
    appState.scanProgress = stations[bestIdx].scanned ? 1 : 0;
    renderStationTabs();
    renderProtocolButtons();
    updateDiagnosisPanel();
  }
}

function focusStation(idx) {
  appState.focusedStationIndex = idx;
  const st = stations[idx];
  appState.aimOffset.set(st.group.position.x, st.kind === 'plant' ? 0.02 : -0.14);
  appState.scanProgress = st.scanned ? 1 : 0;
  sound.playButtonClick('nav');
  renderStationTabs();
  renderProtocolButtons();
  updateDiagnosisPanel();
}

// Atajos de teclado
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    pointerHoldingScan = true;
    appState.isScanning = true;
    monitor.triggerButtonPress('side');
  } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    handleDeviceButton('up');
  } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    handleDeviceButton('down');
  } else if (e.code === 'Enter' || e.code === 'KeyE') {
    handleDeviceButton('select');
  } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    focusStation((appState.focusedStationIndex - 1 + stations.length) % stations.length);
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    focusStation((appState.focusedStationIndex + 1) % stations.length);
  } else if (e.code === 'KeyF') {
    const isBack = monitor.flipBackView();
    showToast(
      isBack
        ? 'Reverso del aparato: Cámara óptica Ø8 mm (arriba) y Rejilla T/HR Ø12 mm (abajo).'
        : 'Vista frontal: Pantalla IPS 50×50 mm y controles ▲ ● ▼.',
      '#38bdf8'
    );
  } else if (e.code === 'KeyV') {
    triggerHumanVentilationGust(1.0);
  } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    appState.screenModeIndex = Number(e.code.replace('Digit', '')) - 1;
    sound.playButtonClick('nav');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    pointerHoldingScan = false;
    appState.isScanning = false;
  }
});

// ============================================================================
// 6. VINCULACIÓN DE LA INTERFAZ HUD Y PANELES
// ============================================================================
function renderStationTabs() {
  const container = document.getElementById('stationTabs');
  container.innerHTML = '';
  stations.forEach((st) => {
    const btn = document.createElement('button');
    btn.className = `st-tab ${st.index === appState.focusedStationIndex ? 'active' : ''}`;
    const dotColor = st.scanned ? DISEASES[st.diseaseId].accentColor : '#64748b';
    const shortTitle = st.name.split('·')[1]?.trim() || st.name;
    btn.innerHTML = `<span class="st-dot" style="background:${dotColor}"></span>${st.index + 1}. ${shortTitle}`;
    btn.addEventListener('click', () => focusStation(st.index));
    container.appendChild(btn);
  });
}

function renderProtocolButtons() {
  const list = document.getElementById('protocolList');
  list.innerHTML = '';
  const st = stations[appState.focusedStationIndex];

  TREATMENTS.forEach((tr, idx) => {
    const btn = document.createElement('button');
    const isSel = idx === appState.selectedTreatmentIndex;
    const isRec = st && st.scanned && DISEASES[st.diseaseId].requiredTreatment === tr.id;
    btn.className = `proto-btn ${isSel ? 'selected' : ''}`;
    btn.innerHTML = `
      <span>${tr.icon} ${tr.shortLabel}</span>
      ${isRec ? '<span class="rec-pill">IA</span>' : ''}
    `;
    btn.addEventListener('click', () => {
      appState.selectedTreatmentIndex = idx;
      appState.screenModeIndex = 3; // Mostrar protocolo en la pantalla IPS también
      sound.playButtonClick('nav');
      renderProtocolButtons();
    });
    list.appendChild(btn);
  });
}

function updateDiagnosisPanel() {
  const st = stations[appState.focusedStationIndex];
  const titleEl = document.getElementById('uiDiagTitle');
  const descEl = document.getElementById('uiDiagDesc');
  const cardEl = document.getElementById('uiDiagnosisCard');

  if (!st) return;
  if (!st.scanned) {
    titleEl.textContent = `${st.name} · Sin diagnosticar`;
    titleEl.style.color = '#f8fafc';
    cardEl.style.borderLeftColor = '#38bdf8';
    descEl.textContent =
      'Mantén presionado "🔍 Escáner Ø8mm" o el botón lateral del aparato para analizar hojas, cerezas y microclima.';
  } else {
    const dis = DISEASES[st.diseaseId];
    titleEl.textContent = `${dis.name} (${Math.round(st.health)}% vigor)`;
    titleEl.style.color = dis.accentColor;
    cardEl.style.borderLeftColor = dis.accentColor;
    descEl.textContent = `${dis.symptoms} → ${dis.recommendation}`;
  }
}

// Botones superiores de Modo Realidad
document.getElementById('btnMode3D').addEventListener('click', () => switchToMode('3d'));
document.getElementById('btnModeMR').addEventListener('click', () => switchToMode('webcam'));
document.getElementById('btnModeXR').addEventListener('click', () => switchToMode('webxr'));

document.getElementById('sliderMrBlend').addEventListener('input', (e) => {
  appState.mrBlend = Number(e.target.value) / 100;
  document.getElementById('lblMrBlend').textContent = `${e.target.value}%`;
  if (appState.mrMode === 'webcam') {
    environment.setRealityMode('webcam', appState.mrBlend);
  }
});

document.getElementById('btnSwitchCam').addEventListener('click', async () => {
  try {
    await mrEngine.switchCamera();
  } catch (err) {
    showToast(`No se pudo alternar cámara: ${err.message}`, '#f97316');
  }
});

document.getElementById('btnMute').addEventListener('click', (e) => {
  const muted = sound.toggleMute();
  e.currentTarget.textContent = muted ? '🔇' : '🔊';
});

// Modal y cotas CAD
const cadModal = document.getElementById('cadModal');
document.getElementById('btnCadSheet').addEventListener('click', () => {
  cadModal.classList.remove('hidden');
});
document.getElementById('btnCloseCadModal').addEventListener('click', () => {
  cadModal.classList.add('hidden');
});
document.getElementById('btnToggle3DCadLabels').addEventListener('click', () => {
  appState.cadInspection = monitor.toggleCadInspection();
  cadModal.classList.add('hidden');
  showToast(
    appState.cadInspection
      ? 'Cotas técnicas 3D activadas sobre el dispositivo (rotación 360° activa).'
      : 'Cotas técnicas 3D ocultas · Modo operativo normal.',
    '#38bdf8'
  );
});

// Alternar Modo Cosecha vs Modo Laboratorio Libre
document.getElementById('btnTogglePlayMode').addEventListener('click', (e) => {
  const next = game.playMode === 'campaign' ? 'sandbox' : 'campaign';
  game.setPlayMode(next);
  e.currentTarget.textContent = next === 'campaign' ? 'Modo: Cosecha' : 'Modo: Laboratorio';
  document.getElementById('sandboxControls').classList.toggle('hidden', next !== 'sandbox');
  renderStationTabs();
  updateDiagnosisPanel();
});

// Botones de Clima y Laboratorio
document.querySelectorAll('[data-climate]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-climate]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    environment.setClimatePreset(btn.dataset.climate);
    sound.playButtonClick('nav');
  });
});

document.querySelectorAll('[data-infect]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const st = stations[appState.focusedStationIndex];
    const dId = btn.dataset.infect;
    st.setDisease(dId, dId !== 'healthy');
    appState.scanProgress = st.scanned ? 1 : 0;
    game.recomputeEcosystemHealth();
    renderStationTabs();
    updateDiagnosisPanel();
    showToast(`${st.name} configurada con: ${DISEASES[dId].name}`, DISEASES[dId].accentColor);
  });
});

// Modal siguiente ronda
document.getElementById('btnNextWave').addEventListener('click', () => {
  document.getElementById('waveModal').classList.add('hidden');
  game.startWave(game.wave + 1);
  appState.scanProgress = 0;
  renderStationTabs();
  renderProtocolButtons();
  updateDiagnosisPanel();
});

// Controles inferiores espejo del hardware
const btnScanHold = document.getElementById('btnScanHold');
const startHoldScan = (e) => {
  e.preventDefault();
  pointerHoldingScan = true;
  appState.isScanning = true;
  monitor.triggerButtonPress('side');
  sound.playButtonClick('side');
};
const stopHoldScan = () => {
  pointerHoldingScan = false;
  appState.isScanning = false;
};
btnScanHold.addEventListener('pointerdown', startHoldScan);
window.addEventListener('pointerup', stopHoldScan);

document.getElementById('btnDevUp').addEventListener('click', () => handleDeviceButton('up'));
document.getElementById('btnDevDown').addEventListener('click', () => handleDeviceButton('down'));
document.getElementById('btnDevSelect').addEventListener('click', () => handleDeviceButton('select'));

document.getElementById('sliderDepth').addEventListener('input', (e) => {
  appState.zoomDistanceCm = Number(e.target.value);
});

document.getElementById('btnFlipDevice').addEventListener('click', () => {
  appState.cadInspection = false;
  monitor.toggleCadInspection(false);
  const back = monitor.flipBackView();
  sound.playButtonClick('nav');
  showToast(
    back
      ? 'Mostrando reverso: Lente de Cámara Ø8 mm y Rejilla de Sensor Ø12 mm.'
      : 'Mostrando frente: Pantalla IPS 50×50 mm y botones ▲ ● ▼.',
    '#38bdf8'
  );
});

document.getElementById('btnFanWind').addEventListener('click', () => {
  triggerHumanVentilationGust(1.1);
});

// Inicializar pestañas y paneles
focusStation(1);

// ============================================================================
// 7. BUCLE PRINCIPAL DE SIMULACIÓN, MERGED REALITY Y RENDERIZADO DUAL
// ============================================================================
const clock = new THREE.Clock();
let frameCounter = 0;
const tmpFocusPos = new THREE.Vector3();
const desiredMonitorPos = new THREE.Vector3();

renderer.setAnimationLoop((timeMs) => {
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  frameCounter++;

  // 1. Actualizar motor Merged Reality (cámara, manos, luz real y brisa)
  const mrState = mrEngine.update(timeMs);

  if (appState.mrMode === 'webcam') {
    const badge = document.getElementById('mrTrackerBadge');
    if (mrState.handDetected) {
      badge.textContent =
        mrState.trackerType === 'mediapipe'
          ? `✋ Mano 3D activa ${mrState.isPinching ? '· ¡ESCANEO PELLIZCO!' : '(pellizca para escanear / curar)'}`
          : '👋 Movimiento óptico detectado';

      // Mapear la mano humana al desplazamiento espacial del monitor
      const targetX = THREE.MathUtils.clamp(mrState.handX * 0.72, -0.75, 0.75);
      const targetY = THREE.MathUtils.clamp(mrState.handY * 0.26 - 0.04, -0.26, 0.28);
      appState.aimOffset.x = THREE.MathUtils.lerp(appState.aimOffset.x, targetX, dt * 8);
      appState.aimOffset.y = THREE.MathUtils.lerp(appState.aimOffset.y, targetY, dt * 8);
      selectNearestStationFromMonitorX(appState.aimOffset.x);

      // Gesto de pellizco: si aún no está escaneada la estación, mantiene escaneo; si ya está escaneada, aplica protocolo
      const focusedSt = stations[appState.focusedStationIndex];
      if (mrState.justPinched && focusedSt && focusedSt.scanned) {
        executeSelectedTreatment();
      } else if (mrState.isPinching && focusedSt && !focusedSt.scanned) {
        appState.isScanning = true;
      } else if (!pointerHoldingScan && !mrState.isPinching) {
        appState.isScanning = false;
      }

      // Gesto de abanicar con la mano genera brisa sobre las matas de café
      if (Math.abs(mrState.waveImpulseX) > 0.08) {
        stations.forEach((st) => st.applyImpulse(mrState.waveImpulseX * 0.35, 0));
      }
    } else {
      badge.textContent = mrEngine.mpReady
        ? '📹 Cámara activa · Muestra tu mano o arrastra en pantalla'
        : '📹 Cámara activa · Luz y movimiento acoplados al cafetal';
    }
  }

  // 2. Posicionar el Monitor Ambiental Portátil (120×65×18 mm)
  const activeStation = stations[appState.focusedStationIndex];
  activeStation.getFocusWorldPosition(tmpFocusPos);

  if (appState.mrMode === 'webxr' && xrManager.controller) {
    // En WebXR AR sigue la pose espacial del controlador / mano XR
    monitor.root.position.copy(xrManager.controller.position);
    monitor.root.quaternion.copy(xrManager.controller.quaternion);
    monitor.root.translateZ(-0.08);
  } else {
    const zOffset = -0.54 + ((appState.zoomDistanceCm - 12) / 30) * 0.32; // entre -0.54 y -0.22
    const breathY = Math.sin(elapsed * 2.2) * 0.0035;

    desiredMonitorPos.set(
      appState.aimOffset.x * 0.68 + 0.11,
      -0.05 + appState.aimOffset.y * 0.52 + breathY,
      zOffset
    );
    monitor.root.position.lerp(desiredMonitorPos, Math.min(1, dt * 9));

    // Inclinación ergonómica cómoda manteniendo la pantalla IPS legible al jugador
    const yaw = THREE.MathUtils.clamp((activeStation.group.position.x - monitor.root.position.x) * -0.18 - 0.1, -0.32, 0.28);
    const pitch = appState.aimOffset.y * 0.14 + 0.03;
    monitor.root.rotation.set(pitch, yaw, Math.sin(elapsed * 1.5) * 0.01);
  }

  // Asegurar que la óptica trasera Ø8mm enfoque nítidamente la mata o muestra activa
  monitor.root.updateMatrixWorld(true);
  monitor.lensCamera.lookAt(tmpFocusPos);

  // Distancia real en cm entre el lente Ø8 mm y la estación enfocada
  const realDistCm = THREE.MathUtils.clamp(
    monitor.root.position.distanceTo(tmpFocusPos) * 42,
    10,
    55
  );

  // 3. Progreso de escaneo óptico si está activo
  btnScanHold.classList.toggle('scanning', appState.isScanning);
  if (appState.isScanning && activeStation && !activeStation.scanned) {
    const speedFactor = realDistCm < 34 ? 0.88 : 0.52;
    appState.scanProgress = Math.min(1, appState.scanProgress + dt * speedFactor);
    sound.playScanTick(appState.scanProgress, activeStation.diseaseId !== 'healthy');

    if (appState.scanProgress >= 1) {
      appState.scanProgress = 1;
      appState.isScanning = false;
      game.completeStationScan(activeStation);
    }
  }

  // 4. Actualizar juego, estaciones 3D, partículas y ecosistema
  game.update(dt);

  const effectiveWind = environment.windStrength + mrState.humanMotion * 0.65;
  stations.forEach((st) => {
    st.update(dt, elapsed, effectiveWind, st.index === appState.focusedStationIndex);
  });

  fxSystem.update(dt);
  environment.update(dt, elapsed, {
    ecosystemHealth: game.ecosystemHealth,
    roomBrightness: appState.mrMode === 'webcam' ? mrState.roomBrightness : 0.76,
    humanMotion: mrState.humanMotion
  });

  const activeDis = DISEASES[activeStation.diseaseId];
  const ledColor = activeStation.scanned ? activeDis.accentColor : '#38bdf8';
  monitor.update(dt, elapsed, {
    isScanning: appState.isScanning,
    accentHex: ledColor,
    autoRotateCad: appState.cadInspection
  });

  // 5. Lecturas en vivo del sensor de humedad/temperatura Ø12 mm
  const readings = game.computeLiveSensorReadings({
    envBaseTemp: environment.baseTemp,
    envBaseHumidity: environment.baseHumidity,
    roomBrightness: appState.mrMode === 'webcam' ? mrState.roomBrightness : 0.74,
    humanMotion: mrState.humanMotion,
    targetStation: activeStation,
    distanceCm: realDistCm,
    elapsed
  });

  // 6. Renderizar vista óptica de la cámara trasera Ø8 mm (30 Hz) hacia la pantalla IPS 50×50 mm
  if (frameCounter % 2 === 0 && !renderer.xr.isPresenting) {
    monitor.root.visible = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(lensRenderTarget);
    renderer.clear();
    renderer.render(scene, monitor.lensCamera);
    renderer.setRenderTarget(prevTarget);
    monitor.root.visible = true;

    ipsScreen.ingestLensPixels(
      renderer,
      lensRenderTarget,
      SCREEN_MODES[appState.screenModeIndex].id,
      appState.mrMode === 'webcam' ? videoEl : null
    );
  }

  ipsScreen.render(
    {
      screenModeIndex: appState.screenModeIndex,
      selectedTreatmentIndex: appState.selectedTreatmentIndex,
      targetStation: activeStation,
      distanceCm: realDistCm,
      isScanning: appState.isScanning,
      scanProgress: appState.scanProgress,
      liveTemp: readings.liveTemp,
      liveHumidity: readings.liveHumidity,
      liveVoc: readings.liveVoc,
      mrMode: appState.mrMode,
      ecosystemHealth: game.ecosystemHealth
    },
    timeMs
  );

  // 7. Actualizar indicadores DOM cada 8 frames para máxima fluidez
  if (frameCounter % 8 === 0) {
    document.getElementById('kpiHealth').textContent = `${Math.round(game.ecosystemHealth)}%`;
    document.getElementById('kpiHarvest').textContent = `${game.harvestSavedKg.toFixed(1)} kg`;
    document.getElementById('kpiScore').textContent = String(game.score);
    document.getElementById('kpiWave').textContent = `#${game.wave}`;

    document.getElementById('uiTemp').textContent = `${readings.liveTemp.toFixed(1)} °C`;
    document.getElementById('uiHumidity').textContent = `${Math.round(readings.liveHumidity)} %`;
    document.getElementById('uiDistance').textContent = `${Math.round(realDistCm)} cm`;

    const breezeLabel =
      mrState.humanMotion > 0.25 ? 'Brisa Activa' : effectiveWind > 0.28 ? 'Viento' : 'Calma';
    const luxPct = Math.round(
      (appState.mrMode === 'webcam' ? mrState.roomBrightness : 0.76) * 100
    );
    document.getElementById('uiEnvCoupling').textContent = `${luxPct}% · ${breezeLabel}`;
  }

  // 8. Renderizado principal de la escena
  renderer.render(scene, camera);
});

// Ajuste responsivo al cambiar tamaño de ventana
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  mrEngine.resizeOverlay(window.innerWidth, window.innerHeight);
});
