import * as THREE from 'three';
import { DISEASES, TREATMENTS, STATIONS_CONFIG } from './game/diseases.js';
import { GameDirector } from './game/gameState.js';
import { SoundEngine } from './audio/soundEngine.js';
import { IPSScreenRenderer, SCREEN_MODES } from './device/ipsScreen.js';
import { HandheldMonitor3D } from './device/monitorModel.js';
import { AgroTools3D } from './device/agroTools.js';
import { CoffeeStation3D, TreatmentFXSystem } from './world/coffeePlant.js';
import { CoffeeEnvironment, getTerrainHeight } from './world/environment.js';
import { MergedRealityEngine } from './mr/mergedReality.js';
import { WebXRManager } from './mr/webxrManager.js';

// ============================================================================
// 1. ESCENA THREE.JS, PLAYER RIG CAMINABLE, MONITOR 3D Y HERRAMIENTAS DE CURA
// ============================================================================
const canvas = document.getElementById('sceneCanvas');
const videoEl = document.getElementById('mrVideo');
const handOverlay = document.getElementById('handOverlayCanvas');
const hudRoot = document.getElementById('hudRoot');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

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

// Rig del jugador para locomoción libre tanto en PC/Móvil como en Meta Quest 3
const playerRig = new THREE.Group();
const startX = 0;
const startZ = 1.8;
playerRig.position.set(startX, getTerrainHeight(startX, startZ), startZ);
scene.add(playerRig);

const EYE_HEIGHT = 1.56;
const camera = new THREE.PerspectiveCamera(
  58,
  window.innerWidth / window.innerHeight,
  0.04,
  90
);
camera.position.set(0, EYE_HEIGHT, 0);
camera.rotation.order = 'YXZ';
playerRig.add(camera);

// RenderTarget 128×128 para la cámara trasera Ø8 mm del dispositivo
const lensRenderTarget = new THREE.WebGLRenderTarget(128, 128, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});

const sound = new SoundEngine();
const ipsScreen = new IPSScreenRenderer();
const monitor = new HandheldMonitor3D(ipsScreen.texture);
const agroTools = new AgroTools3D();

const environment = new CoffeeEnvironment(scene);
const fxSystem = new TreatmentFXSystem(scene);

// Construir las 10 estaciones repartidas por toda la finca cafetera
const stations = STATIONS_CONFIG.map((cfg) => {
  const [mx, mz] = cfg.mapPos;
  const gy = getTerrainHeight(mx, mz);
  const st = new CoffeeStation3D(cfg, gy);
  environment.portalGroup.add(st.group);
  return st;
});

// ============================================================================
// 2. ESTADO DE EXPLORACIÓN, CONGRUENCIA DE MENÚ ESCÁNER Y HERRAMIENTAS FÍSICAS
// ============================================================================
const MAX_SCAN_RANGE_M = 3.35;

const appState = {
  mrMode: '3d', // '3d' | 'webcam' | 'webxr-ar' | 'webxr-vr'
  mrBlend: 0.42,
  equippedSlot: 'monitor', // 'monitor' | 'tool' (en Quest 3 tienes AMBOS simultáneamente: mano izq = monitor, mano der = herramienta)
  screenModeIndex: 0, // 0 = 1.ESCÁNER (único menú donde el monitor puede escanear), 1 = 2.CLIMA, 2 = 3.UV·IR, 3 = 4.FICHA
  selectedTreatmentIndex: 0, // 0..2 = Sprays de medicina, 3 = Tijeras de Podar, 4 = Sello Café Sano
  lastSprayIndex: 0, // Recuerda la última medicina cargada en el Spray (0, 1 o 2)
  activeStation: null,
  playerYaw: 0.12,
  playerPitch: -0.06,
  walkBobPhase: 0,
  autoWalkTarget: null,
  handAimOffset: new THREE.Vector2(0, 0),
  isScanning: false,
  scanProgress: 0,
  cadInspection: false
};

camera.rotation.y = appState.playerYaw;
camera.rotation.x = appState.playerPitch;

function attachHandsToDesktopCamera() {
  if (monitor.root.parent) monitor.root.parent.remove(monitor.root);
  if (agroTools.root.parent) agroTools.root.parent.remove(agroTools.root);

  camera.add(monitor.root);
  camera.add(agroTools.root);

  agroTools.setTreatmentIndex(appState.selectedTreatmentIndex, false);
  updateDesktopHandLayout();
}

function updateDesktopHandLayout() {
  if (xrManager && xrManager.session) return;
  if (appState.equippedSlot === 'monitor') {
    monitor.root.scale.setScalar(1.68);
    agroTools.root.visible = false;
  } else {
    // Monitor pasa a la mano izquierda como referencia y la Herramienta Física sube en la mano derecha
    monitor.root.scale.setScalar(1.18);
    agroTools.root.visible = true;
    agroTools.root.scale.setScalar(1.38);
  }
}

function attachHandsToQuestControllers(leftCtrl, rightCtrl) {
  if (monitor.root.parent) monitor.root.parent.remove(monitor.root);
  if (agroTools.root.parent) agroTools.root.parent.remove(agroTools.root);

  // Mano Izquierda: Monitor Ambiental 120×65×18 mm a escala física real 1:1
  leftCtrl.add(monitor.root);
  monitor.root.scale.setScalar(1.0);
  monitor.root.position.set(0, 0.015, -0.065);
  monitor.root.rotation.set(-0.32, 0.08, 0);

  // Mano Derecha: Herramienta Física (Spray / Tijeras de Podar / Sello) a escala 1:1
  rightCtrl.add(agroTools.root);
  agroTools.root.visible = true;
  agroTools.root.scale.setScalar(1.0);
  agroTools.root.position.set(0, 0.01, -0.055);
  agroTools.root.rotation.set(-0.22, 0, 0);
  agroTools.setTreatmentIndex(appState.selectedTreatmentIndex, true);
}

let toastTimer = null;
function showToast(msg, borderHex = '#34d399', duration = 3200) {
  const el = document.getElementById('toastBanner');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = borderHex;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

function isMonitorInScanMenu() {
  return SCREEN_MODES[appState.screenModeIndex].id === 'optical';
}

function warnMustBeInScanMenu() {
  appState.isScanning = false;
  sound.playModeWarning();
  const curName = SCREEN_MODES[appState.screenModeIndex].short;
  ipsScreen.showBanner('VE AL MENÚ [1.ESCÁNER]', '#f59e0b', 1900);
  showToast(
    `Estás en [${curName}]. Para escanear debes cambiar al menú [1.ESCÁNER] usando ▲/▼ (o botones X/Y en Quest 3).`,
    '#f59e0b',
    3600
  );
  if (xrManager?.session) {
    xrManager.pulseHaptic('left', 0.65, 90);
  }
}

const game = new GameDirector(stations, {
  onLog: (msg, level) => {
    showToast(msg, level === 'warn' ? '#f97316' : '#38bdf8', 3600);
  },
  onDiagnosis: (station, dis) => {
    sound.playDiagnosisComplete(dis.id === 'healthy');
    ipsScreen.showBanner(`DIAGNÓSTICO: ${dis.shortName}`, dis.accentColor, 2100);

    const recTool = TREATMENTS.find((t) => t.id === dis.requiredTreatment);
    updateDiagnosisPanel();
    renderToolbeltUI();

    showToast(
      `${station.name}: ${dis.name}. Equipa y usa ${recTool ? recTool.name : 'tu herramienta'} (Mano Derecha en Quest 3 o teclas 2/3/4).`,
      dis.accentColor,
      4400
    );
  },
  onWaveComplete: (wave, score, savedKg) => {
    sound.playTreatmentSpray(true);
    const modal = document.getElementById('waveModal');
    document.getElementById('waveModalTitle').textContent = `¡Ronda #${wave} Completada!`;
    document.getElementById('waveModalSummary').textContent =
      `Diagnosticaste con el Monitor y sanaste todo el cafetal usando Spray y Tijeras de Podar. Puntaje: ${score} pts · Cosecha salvada: ${savedKg.toFixed(1)} kg.`;
    modal.classList.remove('hidden');
  }
});

game.startWave(1);

// ============================================================================
// 3. MOTORES MERGED REALITY (WEBCAM + MANOS) Y META QUEST 3 (2 MANOS: MONITOR + HERRAMIENTA)
// ============================================================================
const mrEngine = new MergedRealityEngine(videoEl, handOverlay);
mrEngine.resizeOverlay(window.innerWidth, window.innerHeight);

const raycaster = new THREE.Raycaster();

const xrManager = new WebXRManager(renderer, playerRig, hudRoot, {
  onSupportChecked: ({ ar, vr }) => {
    const btnXR = document.getElementById('btnModeXR');
    const btnVR = document.getElementById('btnModeVR');
    if (!ar && btnXR) {
      btnXR.title = 'Ábrelo en Meta Quest 3 Browser para Passthrough Mixed Reality a color';
    }
    if (!vr && btnVR) {
      btnVR.title = 'Ábrelo en Meta Quest 3 Browser para VR Inmersiva';
    }
  },
  onHandsUpdated: (leftCtrl, rightCtrl) => {
    if (xrManager.session) {
      attachHandsToQuestControllers(leftCtrl, rightCtrl);
    }
  },
  onSessionStarted: (sessionMode, leftCtrl, rightCtrl) => {
    appState.mrMode = sessionMode === 'immersive-vr' ? 'webxr-vr' : 'webxr-ar';
    camera.position.set(0, 0, 0);

    attachHandsToQuestControllers(leftCtrl, rightCtrl);
    environment.setRealityMode(appState.mrMode);
    updateModeButtonsUI();

    showToast(
      'Quest 3 listo · Mano Izq = Monitor (X/Y: Menús · Gatillo Izq: Escanear en Menú 1) | Mano Der = Spray/Tijeras (A/B: Cambiar · Gatillo Der: Usar).',
      '#34d399',
      5200
    );
  },
  onSessionEnded: () => {
    camera.position.set(0, EYE_HEIGHT, 0);
    camera.rotation.set(appState.playerPitch, appState.playerYaw, 0, 'YXZ');
    attachHandsToDesktopCamera();
    switchToMode('3d');
  },
  onMonitorMenuNext: () => cycleMonitorMenu(1),
  onMonitorMenuPrev: () => cycleMonitorMenu(-1),
  onFlipMonitor: () => {
    monitor.flipBackView();
    sound.playButtonClick('nav');
  },
  onNextTool: () => selectToolByIndex((appState.selectedTreatmentIndex + 1) % TREATMENTS.length, false),
  onPrevTool: () =>
    selectToolByIndex(
      (appState.selectedTreatmentIndex - 1 + TREATMENTS.length) % TREATMENTS.length,
      false
    ),
  onUseActiveTool: () => usePhysicalTool(),
  onVentilate: () => triggerHumanVentilationGust(1.1),
  onScreenArTap: () => {
    // Respaldo táctil para Android AR sin mandos
    if (appState.equippedSlot === 'monitor') {
      triggerInstantOrHoldScan();
    } else {
      usePhysicalTool();
    }
  }
});

attachHandsToDesktopCamera();

async function switchToMode(targetMode) {
  if (targetMode === 'webcam') {
    if (xrManager.session) await xrManager.stopSession();
    try {
      await mrEngine.startCamera('user');
      videoEl.classList.add('active');
      appState.mrMode = 'webcam';
      environment.setRealityMode('webcam', appState.mrBlend);
      document.getElementById('mrSubBar').classList.remove('hidden');
      updateModeButtonsUI();
      showToast(
        'Merged Reality activa: usa el Monitor en [1.ESCÁNER] para diagnosticar y cambia a Spray o Tijeras para curar.',
        '#38bdf8',
        4200
      );
    } catch (err) {
      showToast(
        `No se pudo abrir la cámara (${err.message}). Continuando en Cafetal 3D.`,
        '#f97316',
        3800
      );
      switchToMode('3d');
    }
  } else if (targetMode === 'webxr-ar' || targetMode === 'webxr-vr') {
    mrEngine.stopCamera();
    videoEl.classList.remove('active');
    document.getElementById('mrSubBar').classList.add('hidden');
    const xrType = targetMode === 'webxr-vr' ? 'immersive-vr' : 'immersive-ar';
    try {
      await xrManager.startSession(xrType);
    } catch {
      showToast(
        'Abre este enlace en el navegador de Meta Quest 3 (o Android AR) para entrar en WebXR. En PC puedes usar Cámara MR o Cafetal 3D.',
        '#f59e0b',
        4600
      );
      switchToMode('3d');
    }
  } else {
    if (xrManager.session) await xrManager.stopSession();
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
  document.getElementById('btnModeXR').classList.toggle('active', appState.mrMode === 'webxr-ar');
  document.getElementById('btnModeVR').classList.toggle('active', appState.mrMode === 'webxr-vr');
}

// ============================================================================
// 4. LÓGICA CONGRUENTE DEL MONITOR (SOLO DETECTA EN MENÚ 1) Y HERRAMIENTAS FÍSICAS (SOLO CURAN)
// ============================================================================
function cycleMonitorMenu(delta) {
  appState.isScanning = false;
  appState.screenModeIndex =
    (appState.screenModeIndex + delta + SCREEN_MODES.length) % SCREEN_MODES.length;
  monitor.triggerButtonPress(delta < 0 ? 'up' : 'down');
  sound.playButtonClick('nav');
  renderToolbeltUI();
}

function equipMonitorSlot() {
  appState.equippedSlot = 'monitor';
  sound.playButtonClick('nav');
  updateDesktopHandLayout();
  renderToolbeltUI();
}

function selectToolByIndex(idx, switchDesktopSlot = true) {
  appState.selectedTreatmentIndex = ((idx % TREATMENTS.length) + TREATMENTS.length) % TREATMENTS.length;
  if (TREATMENTS[appState.selectedTreatmentIndex].toolKind === 'sprayer') {
    appState.lastSprayIndex = appState.selectedTreatmentIndex;
  }
  if (switchDesktopSlot && !xrManager.session) {
    appState.equippedSlot = 'tool';
    appState.isScanning = false;
  }
  agroTools.setTreatmentIndex(appState.selectedTreatmentIndex, Boolean(xrManager.session));
  sound.playButtonClick('nav');
  updateDesktopHandLayout();
  renderToolbeltUI();
}

function handleMonitorHardwareButton(buttonId, uvHit = null) {
  if (buttonId === 'screen' && uvHit) {
    if (uvHit.y > 0.80 && uvHit.y < 0.91) {
      const tabIdx = Math.min(3, Math.max(0, Math.floor(uvHit.x * 4)));
      appState.screenModeIndex = tabIdx;
      appState.isScanning = false;
      sound.playButtonClick('nav');
      renderToolbeltUI();
      return;
    }
    buttonId = 'select';
  }

  if (buttonId === 'up') {
    cycleMonitorMenu(-1);
  } else if (buttonId === 'down') {
    cycleMonitorMenu(1);
  } else if (buttonId === 'side' || buttonId === 'select') {
    monitor.triggerButtonPress(buttonId);
    sound.playButtonClick(buttonId === 'side' ? 'side' : 'select');
    triggerInstantOrHoldScan();
  }
}

function triggerInstantOrHoldScan() {
  // REGLA ESTRICTA DE CONGRUENCIA: El Monitor SOLO escanea si está en [1.ESCÁNER]
  if (!isMonitorInScanMenu()) {
    warnMustBeInScanMenu();
    return;
  }

  const st = appState.activeStation;
  if (!st) {
    ipsScreen.showBanner('ACÉRCATE A UNA MATA (< 3m)', '#f59e0b', 1500);
    showToast('Acércate caminando a una mata o lote de café (< 3m) para escanearlo.', '#f59e0b');
    return;
  }

  if (st.scanned) {
    const dis = DISEASES[st.diseaseId];
    const reqTool = TREATMENTS.find((t) => t.id === dis.requiredTreatment);
    ipsScreen.showBanner('USA HERRAMIENTA FÍSICA', '#34d399', 1800);
    showToast(
      `El Monitor ya detectó ${dis.shortName}. El aparato no cura: equipa ${reqTool ? reqTool.name : 'tu herramienta'} para tratar la planta.`,
      '#34d399',
      3800
    );
    return;
  }

  appState.isScanning = true;
  appState.scanProgress = Math.min(1, appState.scanProgress + 0.42);
  st.applyImpulse((Math.random() - 0.5) * 0.4, 0.25);

  if (appState.scanProgress >= 1) {
    appState.scanProgress = 1;
    appState.isScanning = false;
    game.completeStationScan(st);
  } else {
    setTimeout(() => {
      if (!pointerHoldingPrimary) appState.isScanning = false;
    }, 380);
  }
}

/**
 * Ejecuta la herramienta física equipada (Spray de Medicina, Tijeras de Podar o Sello)
 */
function usePhysicalTool() {
  agroTools.triggerUseAnimation();
  const activeTool = TREATMENTS[appState.selectedTreatmentIndex];
  const st = appState.activeStation;

  // Efecto visual desde la herramienta incluso si falla para dar feedback táctil real
  const toolOrigin = agroTools.getNozzleWorldPosition(new THREE.Vector3());

  if (!st) {
    if (activeTool.toolKind === 'shears') {
      sound.playShearsSnip(false);
    } else {
      sound.playTreatmentSpray(false);
    }
    showToast(
      `Acércate a menos de 3 m de una mata o mesa para usar ${activeTool.name}.`,
      '#f59e0b',
      2800
    );
    return;
  }

  const dest = st.getFocusWorldPosition();
  const res = game.applyTreatment(st, appState.selectedTreatmentIndex);

  if (!res.ok) {
    if (activeTool.toolKind === 'shears') {
      sound.playShearsSnip(false);
    } else {
      sound.playTreatmentSpray(false);
    }
    ipsScreen.showBanner(
      res.wrongProtocol ? 'HERRAMIENTA INCORRECTA' : 'ESCANEA PRIMERO EN MENÚ 1',
      '#f97316',
      1900
    );
    showToast(res.reason, '#f97316', 3600);
    updateDiagnosisPanel();
    return;
  }

  // ¡Éxito! Partículas y sonido físico acorde a Spray vs Tijeras de Podar vs Sello
  if (activeTool.toolKind === 'shears') {
    fxSystem.emitPruningClippings(dest);
    fxSystem.emitSpray(toolOrigin, dest, activeTool.particleColor);
    sound.playShearsSnip(true);
  } else {
    fxSystem.emitSpray(toolOrigin, dest, activeTool.particleColor);
    sound.playTreatmentSpray(true);
  }

  st.applyImpulse((Math.random() - 0.5) * 1.4, -0.9);
  ipsScreen.showBanner(
    res.cured ? `¡SANADO! ${activeTool.shortLabel}` : '¡LOTE SANO CERTIFICADO!',
    '#34d399',
    2100
  );
  showToast(res.message, '#34d399', 3600);
  updateDiagnosisPanel();
  renderToolbeltUI();
}

function triggerHumanVentilationGust(strength = 1.0) {
  const pPos = playerRig.position;
  stations.forEach((st) => {
    if (st.group.position.distanceTo(pPos) < 5.5) {
      st.applyImpulse((Math.random() - 0.5 + 0.4) * 1.6 * strength, (Math.random() - 0.5) * 0.9);
    }
  });
  sound.playButtonClick('nav');
  ipsScreen.showBanner('💨 BRISA HUMANA · AIREANDO FOLLAJE', '#38bdf8', 1300);
}

// ============================================================================
// 5. LOCOMOCIÓN: TECLADO WASD, JOYSTICK TÁCTIL, MIRAR 360° Y ATAJOS RÁPIDOS
// ============================================================================
const keysHeld = new Set();
const joyVector = new THREE.Vector2(0, 0);
const pointerNDC = new THREE.Vector2();
let isLookingDrag = false;
let lookLastX = 0;
let lookLastY = 0;
let dragAccumDist = 0;
let pointerHoldingPrimary = false;

function startPrimaryActionHold() {
  pointerHoldingPrimary = true;
  if (appState.equippedSlot === 'monitor') {
    monitor.triggerButtonPress('side');
    sound.playButtonClick('side');
    if (!isMonitorInScanMenu()) {
      warnMustBeInScanMenu();
      return;
    }
    appState.isScanning = true;
  } else {
    usePhysicalTool();
  }
}

function stopPrimaryActionHold() {
  pointerHoldingPrimary = false;
  appState.isScanning = false;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
  keysHeld.add(e.code);

  if (e.code === 'Space') {
    e.preventDefault();
    startPrimaryActionHold();
  } else if (e.code === 'Enter') {
    e.preventDefault();
    if (appState.equippedSlot === 'monitor') {
      triggerInstantOrHoldScan();
    } else {
      usePhysicalTool();
    }
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    cycleMonitorMenu(-1);
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    cycleMonitorMenu(1);
  } else if (e.code === 'Digit1') {
    equipMonitorSlot();
  } else if (e.code === 'Digit2') {
    // Tecla 2: equipa el Spray; si ya está equipado el Spray, alterna entre las 3 medicinas (Roya/Broca/NPK)
    if (
      appState.equippedSlot === 'tool' &&
      TREATMENTS[appState.selectedTreatmentIndex].toolKind === 'sprayer'
    ) {
      selectToolByIndex((appState.selectedTreatmentIndex + 1) % 3, true);
    } else {
      selectToolByIndex(appState.lastSprayIndex, true);
    }
  } else if (e.code === 'Digit3') {
    selectToolByIndex(3, true); // ✂️ Tijeras de Podar
  } else if (e.code === 'Digit4') {
    selectToolByIndex(4, true); // 🏷️ Sello Certificador Sano
  } else if (e.code === 'KeyF') {
    const isBack = monitor.flipBackView();
    showToast(
      isBack
        ? 'Reverso: Cámara óptica Ø8 mm (arriba) y Rejilla T/HR Ø12 mm (abajo).'
        : 'Frente: Pantalla IPS 50×50 mm y controles ▲ ● ▼.',
      '#38bdf8'
    );
  } else if (e.code === 'KeyV') {
    triggerHumanVentilationGust(1.0);
  } else if (e.code === 'KeyR') {
    orientTowardsNearestPendingStation(true);
  }
});

window.addEventListener('keyup', (e) => {
  keysHeld.delete(e.code);
  if (e.code === 'Space') {
    stopPrimaryActionHold();
  }
});

// Joystick virtual en pantalla (táctil y mouse)
const joystickZone = document.getElementById('joystickZone');
const joystickKnob = document.getElementById('joystickKnob');
let joyPointerId = null;

function updateJoystickFromEvent(e) {
  const rect = joystickZone.querySelector('.joy-ring').getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = rect.width * 0.44;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > maxR) {
    dx = (dx / len) * maxR;
    dy = (dy / len) * maxR;
  }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVector.set(dx / maxR, -dy / maxR);
  appState.autoWalkTarget = null;
}

joystickZone.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  joyPointerId = e.pointerId;
  joystickZone.setPointerCapture(e.pointerId);
  updateJoystickFromEvent(e);
});
joystickZone.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyPointerId) updateJoystickFromEvent(e);
});
const releaseJoystick = (e) => {
  if (e.pointerId === joyPointerId) {
    joyPointerId = null;
    joyVector.set(0, 0);
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }
};
joystickZone.addEventListener('pointerup', releaseJoystick);
joystickZone.addEventListener('pointercancel', releaseJoystick);

function updatePointerNDC(clientX, clientY) {
  pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;
}

canvas.addEventListener('pointerdown', (e) => {
  updatePointerNDC(e.clientX, e.clientY);
  raycaster.setFromCamera(pointerNDC, camera);

  // 1. ¿Clic directo sobre un botón físico 3D del monitor?
  const devHits = raycaster.intersectObjects(monitor.interactiveMeshes, false);
  if (devHits.length > 0) {
    const hit = devHits[0];
    const btnId = hit.object.userData.buttonId;
    if (btnId === 'side') {
      pointerHoldingPrimary = true;
      if (isMonitorInScanMenu()) {
        appState.isScanning = true;
      }
    }
    handleMonitorHardwareButton(btnId, hit.uv);
    return;
  }

  // 2. Arrastre de cámara 360°
  isLookingDrag = true;
  lookLastX = e.clientX;
  lookLastY = e.clientY;
  dragAccumDist = 0;
});

window.addEventListener('pointermove', (e) => {
  if (isLookingDrag) {
    const dx = e.clientX - lookLastX;
    const dy = e.clientY - lookLastY;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    dragAccumDist += Math.hypot(dx, dy);

    appState.playerYaw -= dx * 0.0042;
    appState.playerPitch = THREE.MathUtils.clamp(appState.playerPitch - dy * 0.0032, -0.78, 0.72);
    return;
  }

  updatePointerNDC(e.clientX, e.clientY);
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
  if (pointerHoldingPrimary) {
    stopPrimaryActionHold();
  }

  if (isLookingDrag) {
    isLookingDrag = false;
    if (dragAccumDist < 8) {
      updatePointerNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNDC, camera);
      const colliders = stations.map((s) => s.hitCollider);
      const stHits = raycaster.intersectObjects(colliders, false);
      if (stHits.length > 0) {
        const st = stations[stHits[0].object.userData.stationIndex];
        walkToStation(st);
      }
    }
  }
});

function walkToStation(st) {
  if (!st) return;
  const [tx, tz] = st.config.mapPos;
  const dirFromStation = new THREE.Vector2(
    playerRig.position.x - tx,
    playerRig.position.z - tz
  );
  if (dirFromStation.lengthSq() < 0.01) dirFromStation.set(0, 1);
  dirFromStation.normalize().multiplyScalar(1.38);

  appState.autoWalkTarget = {
    x: tx + dirFromStation.x,
    z: tz + dirFromStation.y,
    lookAtX: tx,
    lookAtZ: tz,
    stationName: st.name
  };
  sound.playButtonClick('nav');
  showToast(`Caminando hacia ${st.name}...`, '#38bdf8', 2000);
}

function orientTowardsNearestPendingStation(alsoWalk = false) {
  const pPos = playerRig.position;
  let best = null;
  let bestD = Infinity;

  const candidates = stations.filter((s) => s.diseaseId !== 'healthy' || !s.scanned);
  const pool = candidates.length > 0 ? candidates : stations;

  pool.forEach((st) => {
    const d = Math.hypot(st.group.position.x - pPos.x, st.group.position.z - pPos.z);
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  });

  if (best) {
    const dx = best.group.position.x - pPos.x;
    const dz = best.group.position.z - pPos.z;
    appState.playerYaw = Math.atan2(-dx, -dz);
    appState.playerPitch = -0.05;
    if (alsoWalk && bestD > 2.1) {
      walkToStation(best);
    } else {
      showToast(`Orientado hacia ${best.name} (${bestD.toFixed(1)} m)`, '#34d399', 2200);
    }
  }
}

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const nz = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  const mapScale = environment.mapHalfExtent;
  const clickWorldX = nx * mapScale;
  const clickWorldZ = nz * mapScale;

  let nearestSt = null;
  let minD = 2.4;
  stations.forEach((st) => {
    const d = Math.hypot(st.group.position.x - clickWorldX, st.group.position.z - clickWorldZ);
    if (d < minD) {
      minD = d;
      nearestSt = st;
    }
  });

  if (nearestSt) {
    walkToStation(nearestSt);
  } else {
    const cx = THREE.MathUtils.clamp(clickWorldX, -12.8, 12.8);
    const cz = THREE.MathUtils.clamp(clickWorldZ, -12.8, 12.8);
    appState.autoWalkTarget = { x: cx, z: cz, lookAtX: cx, lookAtZ: cz - 1 };
    sound.playButtonClick('nav');
  }
});

// ============================================================================
// 6. VINCULACIÓN DE LA INTERFAZ HUD, CINTURÓN DE HERRAMIENTAS Y MINIMAPA RADAR
// ============================================================================
function renderToolbeltUI() {
  // 1. Lista lateral de las 5 configuraciones de herramientas físicas
  const list = document.getElementById('toolbeltList');
  list.innerHTML = '';
  const st = appState.activeStation;

  TREATMENTS.forEach((tr, idx) => {
    const btn = document.createElement('button');
    const isEquipped =
      (xrManager.session || appState.equippedSlot === 'tool') &&
      idx === appState.selectedTreatmentIndex;
    const isRec = st && st.scanned && DISEASES[st.diseaseId].requiredTreatment === tr.id;
    btn.className = `proto-btn ${isEquipped ? 'selected' : ''}`;
    btn.innerHTML = `
      <span>${tr.name}</span>
      ${isRec ? '<span class="rec-pill">USAR ESTA</span>' : ''}
    `;
    btn.addEventListener('click', () => selectToolByIndex(idx, true));
    list.appendChild(btn);
  });

  // 2. Indicador del menú actual del Monitor IPS
  const ipsBadge = document.getElementById('uiIpsMode');
  const modeObj = SCREEN_MODES[appState.screenModeIndex];
  ipsBadge.textContent = modeObj.short;
  ipsBadge.className = modeObj.id === 'optical' ? 'emerald-txt' : 'amber-txt';

  // 3. Cinturón rápido inferior (1. Monitor | 2. Spray | 3. Tijeras | 4. Sello)
  const activeTool = TREATMENTS[appState.selectedTreatmentIndex];
  const isMon = appState.equippedSlot === 'monitor';

  document.getElementById('slotMonitor').classList.toggle('active', isMon);
  document
    .getElementById('slotSprayer')
    .classList.toggle('active', !isMon && activeTool.toolKind === 'sprayer');
  document
    .getElementById('slotShears')
    .classList.toggle('active', !isMon && activeTool.toolKind === 'shears');
  document
    .getElementById('slotStamp')
    .classList.toggle('active', !isMon && activeTool.toolKind === 'certifier');

  // Etiqueta dinámica del Spray para saber cuál de las 3 medicinas lleva el tanque
  const sprayFormulaTr = TREATMENTS[appState.lastSprayIndex];
  document.getElementById('slotSprayer').textContent = `2. ${sprayFormulaTr.shortLabel}`;

  // 4. Botón de acción principal contextual y botón de cambiar medicina del Spray
  const btnPrimary = document.getElementById('btnPrimaryAction');
  const btnFormula = document.getElementById('btnCycleFormula');
  btnFormula.classList.toggle('hidden', isMon || activeTool.toolKind !== 'sprayer');

  if (isMon) {
    if (isMonitorInScanMenu()) {
      btnPrimary.textContent = '🔍 Escanear (Menú 1)';
      btnPrimary.className = 'action-btn scan-cta';
    } else {
      btnPrimary.textContent = `⚠ Ve a [1.ESCÁNER] (estás en ${modeObj.short})`;
      btnPrimary.className = 'action-btn warn-cta';
    }
  } else if (activeTool.toolKind === 'shears') {
    btnPrimary.textContent = '✂️ Cortar con Tijeras de Podar';
    btnPrimary.className = 'action-btn apply-cta';
  } else if (activeTool.toolKind === 'sprayer') {
    btnPrimary.textContent = `🧴 Rociar ${activeTool.shortLabel}`;
    btnPrimary.className = 'action-btn apply-cta';
  } else {
    btnPrimary.textContent = '🏷️ Sellar Café Sano';
    btnPrimary.className = 'action-btn apply-cta';
  }
}

function updateDiagnosisPanel() {
  const st = appState.activeStation;
  const titleEl = document.getElementById('uiDiagTitle');
  const descEl = document.getElementById('uiDiagDesc');
  const cardEl = document.getElementById('uiDiagnosisCard');

  if (!st) {
    titleEl.textContent = 'Explorando el cafetal...';
    titleEl.style.color = '#f8fafc';
    cardEl.style.borderLeftColor = '#38bdf8';
    descEl.textContent =
      'Camina por los senderos hasta acercarte (< 3m) a una mata o mesa. Escanea en [1.ESCÁNER] y cura con Spray o Tijeras.';
    return;
  }

  if (!st.scanned) {
    titleEl.textContent = `${st.name} · Sin escanear`;
    titleEl.style.color = '#38bdf8';
    cardEl.style.borderLeftColor = '#38bdf8';
    descEl.textContent = isMonitorInScanMenu()
      ? 'Monitor en [1.ESCÁNER]: mantén "🔍 Escanear" (Espacio o Gatillo Izq. en Quest 3) para diagnosticar.'
      : 'Pon el Monitor en el menú [1.ESCÁNER] con ▲/▼ (o X/Y en Quest 3) para poder escanear.';
  } else {
    const dis = DISEASES[st.diseaseId];
    const reqTool = TREATMENTS.find((t) => t.id === dis.requiredTreatment);
    titleEl.textContent = `${dis.name} (${Math.round(st.health)}% vigor)`;
    titleEl.style.color = dis.accentColor;
    cardEl.style.borderLeftColor = dis.accentColor;
    descEl.textContent = `${dis.symptoms} → Equipa y usa: ${reqTool ? reqTool.name : dis.recommendation}`;
  }
}

function drawMinimap() {
  const ctx = minimapCtx;
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const half = W / 2;
  const scale = half / (environment.mapHalfExtent + 1.0);

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1;
  [0.35, 0.68, 0.95].forEach((r) => {
    ctx.beginPath();
    ctx.arc(half, half, half * r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(180, 130, 80, 0.35)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(half, half + 4 * scale);
  ctx.lineTo(half, half - 10.5 * scale);
  ctx.moveTo(half - 9 * scale, half - 0.5 * scale);
  ctx.lineTo(half + 10 * scale, half - 1.2 * scale);
  ctx.stroke();

  stations.forEach((st) => {
    const sx = half + st.group.position.x * scale;
    const sz = half + st.group.position.z * scale;
    const isFocused = appState.activeStation === st;

    let col = '#38bdf8';
    if (st.scanned) {
      col = st.diseaseId === 'healthy' ? '#10b981' : DISEASES[st.diseaseId].accentColor;
    }

    if (isFocused) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sz, 7.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sz, st.kind === 'plant' ? 4.8 : 4.0, 0, Math.PI * 2);
    ctx.fill();
  });

  const px = half + playerRig.position.x * scale;
  const pz = half + playerRig.position.z * scale;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const heading = Math.atan2(forward.x, forward.z);

  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-heading + Math.PI);

  ctx.fillStyle = 'rgba(52, 211, 153, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -24);
  ctx.lineTo(14, -24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Botones de Modo Realidad
document.getElementById('btnMode3D').addEventListener('click', () => switchToMode('3d'));
document.getElementById('btnModeMR').addEventListener('click', () => switchToMode('webcam'));
document.getElementById('btnModeXR').addEventListener('click', () => switchToMode('webxr-ar'));
document.getElementById('btnModeVR').addEventListener('click', () => switchToMode('webxr-vr'));

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
      ? 'Cotas técnicas 3D activadas sobre el Monitor.'
      : 'Cotas técnicas 3D ocultas · Modo exploración normal.',
    '#38bdf8'
  );
});

document.getElementById('btnTogglePlayMode').addEventListener('click', (e) => {
  const next = game.playMode === 'campaign' ? 'sandbox' : 'campaign';
  game.setPlayMode(next);
  e.currentTarget.textContent = next === 'campaign' ? 'Modo: Cosecha' : 'Modo: Laboratorio';
  document.getElementById('sandboxControls').classList.toggle('hidden', next !== 'sandbox');
  updateDiagnosisPanel();
});

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
    const st = appState.activeStation || stations[0];
    const dId = btn.dataset.infect;
    st.setDisease(dId, dId !== 'healthy');
    appState.scanProgress = st.scanned ? 1 : 0;
    game.recomputeEcosystemHealth();
    updateDiagnosisPanel();
    renderToolbeltUI();
    showToast(`${st.name} configurada con: ${DISEASES[dId].name}`, DISEASES[dId].accentColor);
  });
});

document.getElementById('btnNextWave').addEventListener('click', () => {
  document.getElementById('waveModal').classList.add('hidden');
  game.startWave(game.wave + 1);
  appState.scanProgress = 0;
  appState.equippedSlot = 'monitor';
  appState.screenModeIndex = 0;
  updateDesktopHandLayout();
  renderToolbeltUI();
  updateDiagnosisPanel();
});

// Cinturón rápido inferior (1. Monitor | 2. Spray | 3. Tijeras | 4. Sello)
document.getElementById('slotMonitor').addEventListener('click', () => equipMonitorSlot());
document.getElementById('slotSprayer').addEventListener('click', () => {
  if (
    appState.equippedSlot === 'tool' &&
    TREATMENTS[appState.selectedTreatmentIndex].toolKind === 'sprayer'
  ) {
    selectToolByIndex((appState.selectedTreatmentIndex + 1) % 3, true);
  } else {
    selectToolByIndex(appState.lastSprayIndex, true);
  }
});
document.getElementById('slotShears').addEventListener('click', () => selectToolByIndex(3, true));
document.getElementById('slotStamp').addEventListener('click', () => selectToolByIndex(4, true));

document.getElementById('btnCycleFormula').addEventListener('click', () => {
  selectToolByIndex((appState.lastSprayIndex + 1) % 3, true);
});

const btnPrimaryAction = document.getElementById('btnPrimaryAction');
btnPrimaryAction.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  startPrimaryActionHold();
});
window.addEventListener('pointerup', () => {
  stopPrimaryActionHold();
});

document.getElementById('btnDevUp').addEventListener('click', () => cycleMonitorMenu(-1));
document.getElementById('btnDevDown').addEventListener('click', () => cycleMonitorMenu(1));
document.getElementById('btnNextNearest').addEventListener('click', () =>
  orientTowardsNearestPendingStation(true)
);
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

renderToolbeltUI();
updateDiagnosisPanel();

// ============================================================================
// 7. BUCLE PRINCIPAL: CAMINATA, QUEST 3 (2 MANOS), CONGRUENCIA ESCÁNER Y HERRAMIENTAS
// ============================================================================
const clock = new THREE.Clock();
let frameCounter = 0;
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMonitorWorld = new THREE.Vector3();
const tmpStationWorld = new THREE.Vector3();
const tmpToStation = new THREE.Vector3();

function computeCurrentZoneName(x, z) {
  if (Math.hypot(x - 2.3, z + 2.1) < 3.2) return 'Beneficiadero';
  if (z < -4.2) return 'Lote Norte · Castillo';
  if (x > 3.8) return 'Terraza Este · Caturra';
  if (x < -3.5) return 'Bosque Oeste · Sombrío';
  return 'Sendero Central';
}

renderer.setAnimationLoop((timeMs) => {
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  frameCounter++;

  // 1. Actualizar motor Webcam Merged Reality
  const mrState = mrEngine.update(timeMs);

  // 2. Leer mandos Touch Plus de Meta Quest 3 (Mano Izq = Monitor, Mano Der = Spray/Tijeras)
  const xrInput = xrManager.pollControllers(dt);
  if (xrManager.session) {
    if (xrInput.snapTurnRad !== 0) {
      playerRig.rotation.y += xrInput.snapTurnRad;
    }

    // Gatillo Izquierdo de Quest 3: Escanear SOLO si el Monitor está en [1.ESCÁNER]
    if (xrInput.leftScanTriggerJustPressed) {
      monitor.triggerButtonPress('side');
      if (!isMonitorInScanMenu()) {
        warnMustBeInScanMenu();
      } else {
        sound.playButtonClick('side');
      }
    }

    if (xrInput.leftScanTriggerHeld && isMonitorInScanMenu()) {
      appState.isScanning = true;
    } else if (!pointerHoldingPrimary) {
      appState.isScanning = false;
    }
  } else {
    const turnSpeed = 1.85;
    if (keysHeld.has('KeyQ') || keysHeld.has('ArrowLeft')) appState.playerYaw += turnSpeed * dt;
    if (keysHeld.has('KeyE') || keysHeld.has('ArrowRight')) appState.playerYaw -= turnSpeed * dt;

    camera.rotation.y = appState.playerYaw;
    camera.rotation.x = appState.playerPitch;
  }

  // 3. Locomoción suave en el mapa (WASD + Joystick Táctil + Stick Izquierdo Quest 3 + AutoWalk)
  let moveForward = joyVector.y - xrInput.moveZ;
  let moveStrafe = joyVector.x + xrInput.moveX;

  if (keysHeld.has('KeyW')) moveForward += 1;
  if (keysHeld.has('KeyS')) moveForward -= 1;
  if (keysHeld.has('KeyD')) moveStrafe += 1;
  if (keysHeld.has('KeyA')) moveStrafe -= 1;

  if (Math.abs(moveForward) > 0.05 || Math.abs(moveStrafe) > 0.05) {
    appState.autoWalkTarget = null;
  }

  if (appState.autoWalkTarget) {
    const dx = appState.autoWalkTarget.x - playerRig.position.x;
    const dz = appState.autoWalkTarget.z - playerRig.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.22) {
      if (typeof appState.autoWalkTarget.lookAtX === 'number') {
        const lx = appState.autoWalkTarget.lookAtX - playerRig.position.x;
        const lz = appState.autoWalkTarget.lookAtZ - playerRig.position.z;
        appState.playerYaw = Math.atan2(-lx, -lz);
      }
      appState.autoWalkTarget = null;
    } else {
      const targetYaw = Math.atan2(-dx, -dz);
      if (!xrManager.session) {
        let diff = targetYaw - appState.playerYaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        appState.playerYaw += diff * Math.min(1, dt * 6);
        camera.rotation.y = appState.playerYaw;
      }
      moveForward = 1.0;
    }
  }

  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  if (tmpForward.lengthSq() < 0.001) tmpForward.set(0, 0, -1);
  tmpForward.normalize();
  tmpRight.set(-tmpForward.z, 0, tmpForward.x);

  const moveLen = Math.hypot(moveForward, moveStrafe);
  const isSprinting = keysHeld.has('ShiftLeft') || keysHeld.has('ShiftRight');
  const walkSpeed = (isSprinting ? 5.8 : 3.6) * Math.min(1, moveLen);

  if (moveLen > 0.04) {
    const nf = moveForward / moveLen;
    const ns = moveStrafe / moveLen;
    playerRig.position.x += (tmpForward.x * nf + tmpRight.x * ns) * walkSpeed * dt;
    playerRig.position.z += (tmpForward.z * nf + tmpRight.z * ns) * walkSpeed * dt;

    const lim = environment.mapHalfExtent - 0.5;
    playerRig.position.x = THREE.MathUtils.clamp(playerRig.position.x, -lim, lim);
    playerRig.position.z = THREE.MathUtils.clamp(playerRig.position.z, -lim, lim);
    appState.walkBobPhase += dt * (isSprinting ? 12.5 : 8.5);
  }

  const groundY = getTerrainHeight(playerRig.position.x, playerRig.position.z);
  playerRig.position.y = THREE.MathUtils.lerp(playerRig.position.y, groundY, Math.min(1, dt * 14));

  // 4. Interacción de mano en modo Cámara MR y postura de manos en pantalla
  if (appState.mrMode === 'webcam') {
    const badge = document.getElementById('mrTrackerBadge');
    if (mrState.handDetected) {
      badge.textContent =
        mrState.trackerType === 'mediapipe'
          ? `✋ Mano 3D activa ${mrState.isPinching ? '· ¡ACCIÓN PELLIZCO!' : '(pellizca = usar equipo en mano)'}`
          : '👋 Movimiento óptico detectado';

      appState.handAimOffset.x = THREE.MathUtils.lerp(
        appState.handAimOffset.x,
        mrState.handX * 0.16,
        dt * 8
      );
      appState.handAimOffset.y = THREE.MathUtils.lerp(
        appState.handAimOffset.y,
        mrState.handY * 0.12,
        dt * 8
      );

      if (appState.equippedSlot === 'tool') {
        if (mrState.justPinched) usePhysicalTool();
      } else {
        if (mrState.justPinched && !isMonitorInScanMenu()) {
          warnMustBeInScanMenu();
        } else if (mrState.isPinching && isMonitorInScanMenu()) {
          appState.isScanning = true;
        } else if (!pointerHoldingPrimary) {
          appState.isScanning = false;
        }
      }

      if (Math.abs(mrState.waveImpulseX) > 0.08) {
        triggerHumanVentilationGust(Math.min(1.4, Math.abs(mrState.waveImpulseX)));
      }
    } else {
      badge.textContent = mrEngine.mpReady
        ? '📹 Cámara activa · Muestra tu mano o camina con WASD/Joystick'
        : '📹 Cámara activa · Luz y movimiento acoplados al cafetal';
      appState.handAimOffset.multiplyScalar(0.92);
    }
  } else {
    appState.handAimOffset.multiplyScalar(0.9);
  }

  if (!xrManager.session) {
    const bobX = moveLen > 0.05 ? Math.cos(appState.walkBobPhase * 0.5) * 0.006 : 0;
    const bobY =
      moveLen > 0.05
        ? Math.abs(Math.sin(appState.walkBobPhase)) * 0.009
        : Math.sin(elapsed * 2.1) * 0.0025;

    if (appState.equippedSlot === 'monitor') {
      monitor.root.position.set(
        0.145 + appState.handAimOffset.x + bobX,
        -0.055 + appState.handAimOffset.y - bobY,
        -0.44
      );
      monitor.root.rotation.set(
        0.03 + appState.handAimOffset.y * 0.5,
        -0.14 - appState.handAimOffset.x * 0.6,
        Math.sin(elapsed * 1.4) * 0.008
      );
    } else {
      // Monitor sujeto en la mano izquierda como referencia diagnóstica
      monitor.root.position.set(-0.23 + bobX * 0.6, -0.095 - bobY * 0.7, -0.52);
      monitor.root.rotation.set(0.04, 0.24, 0);

      // Herramienta física activa (Spray / Tijeras de Podar / Sello) en la mano derecha
      agroTools.root.position.set(
        0.165 + appState.handAimOffset.x + bobX,
        -0.08 + appState.handAimOffset.y - bobY,
        -0.42
      );
      agroTools.root.rotation.set(
        0.05 + appState.handAimOffset.y * 0.4,
        -0.16 - appState.handAimOffset.x * 0.5,
        0
      );
    }
  }

  playerRig.updateMatrixWorld(true);
  monitor.root.getWorldPosition(tmpMonitorWorld);

  // 5. Detectar qué estación está dentro del rango (< 3.35 m) y en mira
  const gazeDir = new THREE.Vector3();
  const refOrigin = new THREE.Vector3();
  if (xrManager.session) {
    // En Quest 3 puedes apuntar con la cámara de tu casco o con el monitor/herramienta
    camera.getWorldPosition(refOrigin);
    camera.getWorldDirection(gazeDir);
  } else {
    camera.getWorldPosition(refOrigin);
    camera.getWorldDirection(gazeDir);
  }

  let bestStation = null;
  let bestScore = Infinity;
  let bestDistM = Infinity;

  stations.forEach((st) => {
    st.getFocusWorldPosition(tmpStationWorld);
    tmpToStation.copy(tmpStationWorld).sub(refOrigin);
    const distM = tmpToStation.length();
    if (distM > MAX_SCAN_RANGE_M) return;

    const align = tmpToStation.normalize().dot(gazeDir);
    if (align > 0.35) {
      const score = distM - align * 1.1;
      if (score < bestScore) {
        bestScore = score;
        bestStation = st;
        bestDistM = distM;
      }
    }
  });

  if (bestStation !== appState.activeStation) {
    const prev = appState.activeStation;
    appState.activeStation = bestStation;
    appState.scanProgress = bestStation && bestStation.scanned ? 1 : 0;
    if (prev) prev.refreshBadge(false);
    if (bestStation) bestStation.refreshBadge(true);
    renderToolbeltUI();
    updateDiagnosisPanel();
  }

  if (bestStation) {
    bestStation.getFocusWorldPosition(tmpStationWorld);
    monitor.lensCamera.lookAt(tmpStationWorld);
  } else {
    monitor.lensCamera.rotation.set(0, 0, 0);
  }

  // Brújula hacia la mata enferma o sin escanear más cercana
  let compassAngle = null;
  let compassDistM = null;
  const pendingPool = stations.filter((s) => s.diseaseId !== 'healthy' || !s.scanned);
  if (pendingPool.length > 0) {
    let minD = Infinity;
    let nearestPending = null;
    pendingPool.forEach((st) => {
      const d = Math.hypot(
        st.group.position.x - playerRig.position.x,
        st.group.position.z - playerRig.position.z
      );
      if (d < minD) {
        minD = d;
        nearestPending = st;
      }
    });
    if (nearestPending) {
      compassDistM = minD;
      const targetBearing = Math.atan2(
        nearestPending.group.position.x - playerRig.position.x,
        nearestPending.group.position.z - playerRig.position.z
      );
      const playerBearing = Math.atan2(tmpForward.x, tmpForward.z);
      compassAngle = playerBearing - targetBearing;
    }
  }

  const distCm = bestStation ? bestDistM * 100 : (compassDistM || 9.9) * 100;

  // 6. Progreso de escaneo óptico (SOLO avanza si está en 1.ESCÁNER)
  if (!isMonitorInScanMenu()) {
    appState.isScanning = false;
  }

  btnPrimaryAction.classList.toggle('scanning', appState.isScanning);
  if (appState.isScanning && isMonitorInScanMenu() && bestStation && !bestStation.scanned) {
    const proxBoost = bestDistM < 1.9 ? 0.95 : 0.65;
    appState.scanProgress = Math.min(1, appState.scanProgress + dt * proxBoost);
    sound.playScanTick(appState.scanProgress, bestStation.diseaseId !== 'healthy');

    if (appState.scanProgress >= 1) {
      appState.scanProgress = 1;
      appState.isScanning = false;
      if (xrManager.session) xrManager.pulseHaptic('left', 0.8, 110);
      game.completeStationScan(bestStation);
    }
  }

  // 7. Actualizar juego, herramientas 3D, estaciones 3D, partículas y ecosistema
  game.update(dt);
  agroTools.update(dt);

  const effectiveWind = environment.windStrength + mrState.humanMotion * 0.65;
  stations.forEach((st) => {
    st.update(dt, elapsed, effectiveWind, st === appState.activeStation);
  });

  fxSystem.update(dt);
  environment.update(dt, elapsed, {
    ecosystemHealth: game.ecosystemHealth,
    roomBrightness: appState.mrMode === 'webcam' ? mrState.roomBrightness : 0.76,
    humanMotion: mrState.humanMotion
  });

  const ledColor =
    bestStation && bestStation.scanned ? DISEASES[bestStation.diseaseId].accentColor : '#38bdf8';
  monitor.update(dt, elapsed, {
    isScanning: appState.isScanning,
    accentHex: ledColor,
    autoRotateCad: appState.cadInspection
  });

  // 8. Lecturas del sensor trasero Ø12 mm
  const readings = game.computeLiveSensorReadings({
    envBaseTemp: environment.baseTemp,
    envBaseHumidity: environment.baseHumidity,
    roomBrightness: appState.mrMode === 'webcam' ? mrState.roomBrightness : 0.74,
    humanMotion: mrState.humanMotion,
    targetStation: bestStation,
    distanceCm: distCm,
    elapsed
  });

  // 9. Renderizar vista óptica de la cámara trasera Ø8 mm (oculta tanto monitor como herramientas 3D)
  const lensFrameInterval = renderer.xr.isPresenting ? 4 : 2;
  if (frameCounter % lensFrameInterval === 0) {
    const wasXR = renderer.xr.enabled;
    const prevToolVis = agroTools.root.visible;
    renderer.xr.enabled = false;
    monitor.root.visible = false;
    agroTools.root.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(lensRenderTarget);
    renderer.clear();
    renderer.render(scene, monitor.lensCamera);
    renderer.setRenderTarget(prevTarget);

    monitor.root.visible = true;
    agroTools.root.visible = prevToolVis;
    renderer.xr.enabled = wasXR;

    ipsScreen.ingestLensPixels(
      renderer,
      lensRenderTarget,
      SCREEN_MODES[appState.screenModeIndex].id,
      appState.mrMode === 'webcam' ? videoEl : null
    );
  }

  const remainingSick = game.getSickCount();

  ipsScreen.render(
    {
      screenModeIndex: appState.screenModeIndex,
      selectedTreatmentIndex: appState.selectedTreatmentIndex,
      targetStation: bestStation,
      distanceCm: distCm,
      compassAngle,
      compassDistM,
      remainingSick,
      isScanning: appState.isScanning,
      scanProgress: appState.scanProgress,
      liveTemp: readings.liveTemp,
      liveHumidity: readings.liveHumidity,
      liveVoc: readings.liveVoc,
      mrMode: appState.mrMode.startsWith('webxr') ? 'webxr' : appState.mrMode,
      ecosystemHealth: game.ecosystemHealth
    },
    timeMs
  );

  // 10. Actualizar HUD, Minimapa Radar y Muñeca Quest 3
  if (frameCounter % 6 === 0) {
    drawMinimap();
    document.getElementById('kpiHealth').textContent = `${Math.round(game.ecosystemHealth)}%`;
    document.getElementById('kpiSick').textContent = String(remainingSick);
    document.getElementById('kpiHarvest').textContent = `${game.harvestSavedKg.toFixed(1)} kg`;
    document.getElementById('kpiScore').textContent = String(game.score);
    document.getElementById('kpiWave').textContent = `#${game.wave}`;

    document.getElementById('uiTempHum').textContent =
      `${readings.liveTemp.toFixed(1)}°C · ${Math.round(readings.liveHumidity)}%`;
    document.getElementById('uiDistance').textContent = bestStation
      ? `${bestDistM.toFixed(1)} m (A tiro)`
      : compassDistM
        ? `${compassDistM.toFixed(1)} m`
        : '--';
    document.getElementById('uiZoneName').textContent = computeCurrentZoneName(
      playerRig.position.x,
      playerRig.position.z
    );
    document.getElementById('radarCoords').textContent = `${playerRig.position.x.toFixed(0)}m, ${playerRig.position.z.toFixed(0)}m`;

    if (xrManager.session) {
      xrManager.updateWristHud({
        health: game.ecosystemHealth,
        wave: game.wave,
        sickCount: remainingSick,
        score: game.score
      });
    }
  }

  // 11. Renderizado principal (pantalla o estéreo Meta Quest 3)
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  mrEngine.resizeOverlay(window.innerWidth, window.innerHeight);
});
