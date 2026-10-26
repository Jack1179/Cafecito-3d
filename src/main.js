import * as THREE from 'three';
import { DISEASES, TREATMENTS, STATIONS_CONFIG } from './game/diseases.js';
import { GameDirector } from './game/gameState.js';
import { SoundEngine } from './audio/soundEngine.js';
import { IPSScreenRenderer, SCREEN_MODES } from './device/ipsScreen.js';
import { HandheldMonitor3D } from './device/monitorModel.js';
import { CoffeeStation3D, TreatmentFXSystem } from './world/coffeePlant.js';
import { CoffeeEnvironment, getTerrainHeight } from './world/environment.js';
import { MergedRealityEngine } from './mr/mergedReality.js';
import { WebXRManager } from './mr/webxrManager.js';

// ============================================================================
// 1. ESCENA THREE.JS, PLAYER RIG CAMINABLE Y MONITOR PORTÁTIL 3D
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

// En pantalla (PC/Móvil/Webcam) el monitor va sujeto en la mano derecha frente a la cámara
function attachMonitorToDesktopHand() {
  if (monitor.root.parent) monitor.root.parent.remove(monitor.root);
  camera.add(monitor.root);
  monitor.root.scale.setScalar(1.68);
  monitor.root.position.set(0.145, -0.055, -0.44);
  monitor.root.rotation.set(0.03, -0.14, 0);
}
attachMonitorToDesktopHand();

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
// 2. ESTADO DE EXPLORACIÓN, LOCOMOCIÓN Y DISPOSITIVO
// ============================================================================
const MAX_SCAN_RANGE_M = 3.35;

const appState = {
  mrMode: '3d', // '3d' | 'webcam' | 'webxr-ar' | 'webxr-vr'
  mrBlend: 0.42,
  screenModeIndex: 0,
  selectedTreatmentIndex: 0,
  activeStation: null, // Estación actualmente enfocada y a rango (< 3.35 m)
  playerYaw: 0.12, // Mirando inicialmente hacia Mata #1 y el Sendero Central
  playerPitch: -0.06,
  walkBobPhase: 0,
  autoWalkTarget: null, // Destino opcional al hacer clic en una mata lejana o en el Radar
  handAimOffset: new THREE.Vector2(0, 0),
  isScanning: false,
  scanProgress: 0,
  cadInspection: false
};

camera.rotation.y = appState.playerYaw;
camera.rotation.x = appState.playerPitch;

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

const game = new GameDirector(stations, {
  onLog: (msg, level) => {
    showToast(msg, level === 'warn' ? '#f97316' : '#38bdf8', 3600);
  },
  onDiagnosis: (station, dis) => {
    sound.playDiagnosisComplete(dis.id === 'healthy');
    ipsScreen.showBanner(`DIAGNÓSTICO: ${dis.shortName}`, dis.accentColor, 2000);

    const recIdx = TREATMENTS.findIndex((t) => t.id === dis.requiredTreatment);
    if (recIdx >= 0) {
      appState.selectedTreatmentIndex = recIdx;
      renderProtocolButtons();
    }
    updateDiagnosisPanel();
    showToast(
      `${station.name}: ${dis.name}. Pulsa "● Aplicar" (Enter / Botón A en Quest 3) para ${TREATMENTS[appState.selectedTreatmentIndex].shortLabel}.`,
      dis.accentColor,
      4000
    );
  },
  onWaveComplete: (wave, score, savedKg) => {
    sound.playTreatmentSpray(true);
    const modal = document.getElementById('waveModal');
    document.getElementById('waveModalTitle').textContent = `¡Ronda #${wave} Completada!`;
    document.getElementById('waveModalSummary').textContent =
      `Exploraste toda la finca y sanaste todos los brotes fitosanitarios. Puntaje: ${score} pts · Cosecha salvada: ${savedKg.toFixed(1)} kg.`;
    modal.classList.remove('hidden');
  }
});

game.startWave(1);

// ============================================================================
// 3. MOTORES MERGED REALITY (WEBCAM + MANOS) Y META QUEST 3 (MR / VR)
// ============================================================================
const mrEngine = new MergedRealityEngine(videoEl, handOverlay);
mrEngine.resizeOverlay(window.innerWidth, window.innerHeight);

const raycaster = new THREE.Raycaster();
const tmpMatrix = new THREE.Matrix4();

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
  onSessionStarted: (sessionMode, rightCtrl) => {
    appState.mrMode = sessionMode === 'immersive-vr' ? 'webxr-vr' : 'webxr-ar';

    // En Quest 3 el casco maneja la altura física local-floor; acoplar monitor 1:1 al mando derecho
    camera.position.set(0, 0, 0);
    if (monitor.root.parent) monitor.root.parent.remove(monitor.root);
    rightCtrl.add(monitor.root);
    monitor.root.scale.setScalar(1.0); // Tamaño físico real 120×65×18 mm
    monitor.root.position.set(0, 0.015, -0.065);
    monitor.root.rotation.set(-0.32, 0, 0);

    environment.setRealityMode(appState.mrMode);
    updateModeButtonsUI();
    showToast(
      sessionMode === 'immersive-ar'
        ? 'Meta Quest 3 Passthrough MR activo: camina con tu cuerpo o con el Stick Izquierdo.'
        : 'Meta Quest 3 VR Cafetal activo: usa Stick Izquierdo para caminar y Gatillo Derecho para escanear.',
      '#34d399',
      4500
    );
  },
  onSessionEnded: () => {
    camera.position.set(0, EYE_HEIGHT, 0);
    camera.rotation.set(appState.playerPitch, appState.playerYaw, 0, 'YXZ');
    attachMonitorToDesktopHand();
    switchToMode('3d');
  },
  onTriggerDown: () => {
    pointerHoldingScan = true;
    appState.isScanning = true;
    monitor.triggerButtonPress('side');
    sound.playButtonClick('side');
  },
  onTriggerUp: () => {
    pointerHoldingScan = false;
    appState.isScanning = false;
  },
  onLeftLaserClick: (leftCtrl) => {
    // Apuntar con el rayo láser izquierdo de Quest 3 a los botones 3D del monitor en la mano derecha
    tmpMatrix.identity().extractRotation(leftCtrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(leftCtrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
    const hits = raycaster.intersectObjects(monitor.interactiveMeshes, false);
    if (hits.length > 0) {
      handleDeviceButton(hits[0].object.userData.buttonId, hits[0].uv);
    } else {
      handleDeviceButton('select');
    }
  },
  onNavUp: () => handleDeviceButton('up'),
  onNavDown: () => handleDeviceButton('down'),
  onSelectAction: () => handleDeviceButton('select'),
  onFlipDevice: () => {
    monitor.flipBackView();
    sound.playButtonClick('nav');
  },
  onVentilate: () => triggerHumanVentilationGust(1.1)
});

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
        'Merged Reality activa: camina por la finca y usa tu mano frente a la cámara (pellizca para escanear/curar).',
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
// 4. LÓGICA DE BOTONES DEL DISPOSITIVO (▲ ● ▼, LATERAL Y PANTALLA IPS)
// ============================================================================
function handleDeviceButton(buttonId, uvHit = null) {
  if (buttonId === 'screen' && uvHit) {
    if (uvHit.y > 0.80 && uvHit.y < 0.91) {
      const tabIdx = Math.min(3, Math.max(0, Math.floor(uvHit.x * 4)));
      appState.screenModeIndex = tabIdx;
      sound.playButtonClick('nav');
      return;
    }
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
    const st = appState.activeStation;
    if (!st) {
      ipsScreen.showBanner('ACÉRCATE A UNA MATA (< 3m)', '#38bdf8', 1500);
      showToast('Camina más cerca de una mata o mesa de café (< 3 metros) para interactuar.', '#38bdf8');
      return;
    }
    if (!st.scanned) {
      triggerInstantOrHoldScan();
    } else {
      executeSelectedTreatment();
    }
  }
}

function triggerInstantOrHoldScan() {
  const st = appState.activeStation;
  if (!st) {
    ipsScreen.showBanner('SIN OBJETIVO EN RANGO', '#f59e0b', 1400);
    showToast('Acércate caminando a una mata o lote de café (< 3m) para escanearlo.', '#f59e0b');
    return;
  }
  if (st.scanned) {
    const dis = DISEASES[st.diseaseId];
    ipsScreen.showBanner(`YA ESCANEADO: ${dis.shortName}`, dis.accentColor, 1400);
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
      if (!pointerHoldingScan) appState.isScanning = false;
    }, 380);
  }
}

function executeSelectedTreatment() {
  const st = appState.activeStation;
  const res = game.applyTreatment(st, appState.selectedTreatmentIndex);

  if (!res.ok) {
    sound.playTreatmentSpray(false);
    ipsScreen.showBanner(
      res.wrongProtocol ? 'PROTOCOLO INCORRECTO' : 'ESCANEA PRIMERO',
      '#f97316',
      1900
    );
    showToast(res.reason, '#f97316', 3500);
    updateDiagnosisPanel();
    return;
  }

  const origin = new THREE.Vector3();
  monitor.root.getWorldPosition(origin);
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
  renderProtocolButtons();
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
// 5. LOCOMOCIÓN: TECLADO WASD, JOYSTICK TÁCTIL, MIRAR 360° Y VIAJE RADAR
// ============================================================================
const keysHeld = new Set();
const joyVector = new THREE.Vector2(0, 0); // x: strafe, y: forward (-1..1)
const pointerNDC = new THREE.Vector2();
let isLookingDrag = false;
let lookLastX = 0;
let lookLastY = 0;
let dragAccumDist = 0;
let pointerHoldingScan = false;

window.addEventListener('keydown', (e) => {
  keysHeld.add(e.code);

  if (e.code === 'Space') {
    e.preventDefault();
    pointerHoldingScan = true;
    appState.isScanning = true;
    monitor.triggerButtonPress('side');
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    handleDeviceButton('up');
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    handleDeviceButton('down');
  } else if (e.code === 'Enter') {
    handleDeviceButton('select');
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
  } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    appState.screenModeIndex = Number(e.code.replace('Digit', '')) - 1;
    sound.playButtonClick('nav');
  }
});

window.addEventListener('keyup', (e) => {
  keysHeld.delete(e.code);
  if (e.code === 'Space') {
    pointerHoldingScan = false;
    appState.isScanning = false;
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
  joyVector.set(dx / maxR, -dy / maxR); // +y = caminar adelante
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

// Clic en botones 3D del monitor o arrastrar para girar la vista 360°
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
      pointerHoldingScan = true;
      appState.isScanning = true;
    }
    handleDeviceButton(btnId, hit.uv);
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
  if (pointerHoldingScan) {
    pointerHoldingScan = false;
    appState.isScanning = false;
  }

  if (isLookingDrag) {
    isLookingDrag = false;
    // Si fue un toque/clic limpio sobre una estación 3D en el mapa, caminar hacia ella
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
  // Pararse a ~1.35 m frente a la estación
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

  // Priorizar enfermas o no escaneadas
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

// Clic en el Minimapa Radar para viajar/caminar a cualquier lote
minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const nz = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  const mapScale = environment.mapHalfExtent;
  const clickWorldX = nx * mapScale;
  const clickWorldZ = nz * mapScale;

  // Si hizo clic cerca de una estación, caminar a esa estación; si no, caminar al punto
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
// 6. VINCULACIÓN DE LA INTERFAZ HUD Y MINIMAPA RADAR
// ============================================================================
function renderProtocolButtons() {
  const list = document.getElementById('protocolList');
  list.innerHTML = '';
  const st = appState.activeStation;

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
      appState.screenModeIndex = 3;
      sound.playButtonClick('nav');
      renderProtocolButtons();
    });
    list.appendChild(btn);
  });
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
      'Camina por los senderos (WASD / Joystick / Quest 3) siguiendo los anillos de luz o el Radar hasta acercarte (< 3m) a una mata o mesa.';
    return;
  }

  if (!st.scanned) {
    titleEl.textContent = `${st.name} · En rango`;
    titleEl.style.color = '#38bdf8';
    cardEl.style.borderLeftColor = '#38bdf8';
    descEl.textContent =
      'Mantén presionado "🔍 Escáner Ø8mm" (Espacio o Gatillo Derecho en Quest 3) para diagnosticar hojas, cerezas y microclima.';
  } else {
    const dis = DISEASES[st.diseaseId];
    titleEl.textContent = `${dis.name} (${Math.round(st.health)}% vigor)`;
    titleEl.style.color = dis.accentColor;
    cardEl.style.borderLeftColor = dis.accentColor;
    descEl.textContent = `${dis.symptoms} → ${dis.recommendation}`;
  }
}

function drawMinimap() {
  const ctx = minimapCtx;
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const half = W / 2;
  const scale = half / (environment.mapHalfExtent + 1.0);

  ctx.clearRect(0, 0, W, H);

  // Anillos concéntricos del radar
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1;
  [0.35, 0.68, 0.95].forEach((r) => {
    ctx.beginPath();
    ctx.arc(half, half, half * r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Senderos principales esquemáticos
  ctx.strokeStyle = 'rgba(180, 130, 80, 0.35)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(half, half + 4 * scale);
  ctx.lineTo(half, half - 10.5 * scale);
  ctx.moveTo(half - 9 * scale, half - 0.5 * scale);
  ctx.lineTo(half + 10 * scale, half - 1.2 * scale);
  ctx.stroke();

  // Estaciones de café en el mapa
  stations.forEach((st) => {
    const sx = half + st.group.position.x * scale;
    const sz = half + st.group.position.z * scale;
    const isFocused = appState.activeStation === st;

    let col = '#38bdf8'; // Sin escanear
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

  // Jugador y cono de visión
  const px = half + playerRig.position.x * scale;
  const pz = half + playerRig.position.z * scale;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const heading = Math.atan2(forward.x, forward.z); // Ángulo en plano XZ

  ctx.save();
  ctx.translate(px, pz);
  // En canvas +X es derecha, +Y es abajo (+Z mundo). Vector (sin(heading), cos(heading))
  ctx.rotate(-heading + Math.PI);

  // Cono visual
  ctx.fillStyle = 'rgba(52, 211, 153, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -24);
  ctx.lineTo(14, -24);
  ctx.closePath();
  ctx.fill();

  // Flecha blanca del jugador
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
      ? 'Cotas técnicas 3D activadas sobre el dispositivo.'
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
    showToast(`${st.name} configurada con: ${DISEASES[dId].name}`, DISEASES[dId].accentColor);
  });
});

document.getElementById('btnNextWave').addEventListener('click', () => {
  document.getElementById('waveModal').classList.add('hidden');
  game.startWave(game.wave + 1);
  appState.scanProgress = 0;
  renderProtocolButtons();
  updateDiagnosisPanel();
});

const btnScanHold = document.getElementById('btnScanHold');
btnScanHold.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointerHoldingScan = true;
  appState.isScanning = true;
  monitor.triggerButtonPress('side');
  sound.playButtonClick('side');
});
window.addEventListener('pointerup', () => {
  pointerHoldingScan = false;
  appState.isScanning = false;
});

document.getElementById('btnDevUp').addEventListener('click', () => handleDeviceButton('up'));
document.getElementById('btnDevDown').addEventListener('click', () => handleDeviceButton('down'));
document.getElementById('btnDevSelect').addEventListener('click', () => handleDeviceButton('select'));
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
document.getElementById('btnFanWind').addEventListener('click', () => {
  triggerHumanVentilationGust(1.1);
});

renderProtocolButtons();
updateDiagnosisPanel();

// ============================================================================
// 7. BUCLE PRINCIPAL: CAMINATA POR EL MAPA, DETECCIÓN DE RANGO, QUEST 3 & IPS
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

  // 2. Leer mandos Touch Plus de Meta Quest 3 si hay sesión XR activa
  const xrInput = xrManager.pollControllers(dt);
  if (xrManager.session) {
    if (xrInput.snapTurnRad !== 0) {
      playerRig.rotation.y += xrInput.snapTurnRad;
    }
    if (xrInput.rightTriggerHeld) {
      appState.isScanning = true;
    } else if (!pointerHoldingScan) {
      appState.isScanning = false;
    }
  } else {
    // Giro con teclas Q / E o flechas laterales en escritorio
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
    appState.autoWalkTarget = null; // El control manual cancela caminata automática
  }

  // Caminata asistida al hacer clic en una estación lejana o en el Radar
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

  // Ajustar altura del jugador al relieve suave de la finca
  const groundY = getTerrainHeight(playerRig.position.x, playerRig.position.z);
  playerRig.position.y = THREE.MathUtils.lerp(playerRig.position.y, groundY, Math.min(1, dt * 14));

  // 4. Interacción de mano en modo Cámara MR y balanceo natural al caminar
  if (appState.mrMode === 'webcam') {
    const badge = document.getElementById('mrTrackerBadge');
    if (mrState.handDetected) {
      badge.textContent =
        mrState.trackerType === 'mediapipe'
          ? `✋ Mano 3D activa ${mrState.isPinching ? '· ¡ESCANEO PELLIZCO!' : '(pellizca = escanear / curar)'}`
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

      if (mrState.justPinched && appState.activeStation && appState.activeStation.scanned) {
        executeSelectedTreatment();
      } else if (mrState.isPinching && appState.activeStation && !appState.activeStation.scanned) {
        appState.isScanning = true;
      } else if (!pointerHoldingScan && !mrState.isPinching) {
        appState.isScanning = false;
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
  }

  playerRig.updateMatrixWorld(true);
  monitor.root.getWorldPosition(tmpMonitorWorld);

  // 5. Detectar qué mata o mesa está dentro del rango de escaneo (< 3.35 m) y en el cono frontal
  const gazeDir = new THREE.Vector3();
  if (xrManager.session) {
    monitor.lensCamera.getWorldDirection(gazeDir);
  } else {
    camera.getWorldDirection(gazeDir);
  }

  let bestStation = null;
  let bestScore = Infinity;
  let bestDistM = Infinity;

  stations.forEach((st) => {
    st.getFocusWorldPosition(tmpStationWorld);
    tmpToStation.copy(tmpStationWorld).sub(tmpMonitorWorld);
    const distM = tmpToStation.length();
    if (distM > MAX_SCAN_RANGE_M) return;

    const align = tmpToStation.normalize().dot(gazeDir);
    if (align > 0.38) {
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
    renderProtocolButtons();
    updateDiagnosisPanel();
  }

  // Si hay estación en mira, orientar suavemente la cámara óptica Ø8 mm hacia ella
  if (bestStation) {
    bestStation.getFocusWorldPosition(tmpStationWorld);
    monitor.lensCamera.lookAt(tmpStationWorld);
  } else {
    monitor.lensCamera.rotation.set(0, 0, 0);
  }

  // Calcular brújula hacia la mata enferma o sin escanear más cercana del mapa
  let compassAngle = null;
  let compassDistM = null;
  let nearestLabel = '¡Cafetal sano!';
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
      nearestLabel = `${nearestPending.name} (${minD.toFixed(1)}m)`;
      const targetBearing = Math.atan2(
        nearestPending.group.position.x - playerRig.position.x,
        nearestPending.group.position.z - playerRig.position.z
      );
      const playerBearing = Math.atan2(tmpForward.x, tmpForward.z);
      // Diferencia angular relativa a hacia dónde mira el jugador
      compassAngle = playerBearing - targetBearing;
    }
  }

  const distCm = bestStation ? bestDistM * 100 : (compassDistM || 9.9) * 100;

  // 6. Progreso de escaneo óptico si está activo y a rango
  btnScanHold.classList.toggle('scanning', appState.isScanning);
  if (appState.isScanning && bestStation && !bestStation.scanned) {
    const proxBoost = bestDistM < 1.9 ? 0.95 : 0.65;
    appState.scanProgress = Math.min(1, appState.scanProgress + dt * proxBoost);
    sound.playScanTick(appState.scanProgress, bestStation.diseaseId !== 'healthy');

    if (appState.scanProgress >= 1) {
      appState.scanProgress = 1;
      appState.isScanning = false;
      game.completeStationScan(bestStation);
    }
  }

  // 7. Actualizar juego, estaciones 3D, partículas y ecosistema
  game.update(dt);

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

  // 9. Renderizar vista óptica de la cámara trasera Ø8 mm (funciona también en Meta Quest 3)
  const lensFrameInterval = renderer.xr.isPresenting ? 4 : 2;
  if (frameCounter % lensFrameInterval === 0) {
    const wasXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    monitor.root.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(lensRenderTarget);
    renderer.clear();
    renderer.render(scene, monitor.lensCamera);
    renderer.setRenderTarget(prevTarget);

    monitor.root.visible = true;
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

    document.getElementById('uiTemp').textContent = `${readings.liveTemp.toFixed(1)} °C`;
    document.getElementById('uiHumidity').textContent = `${Math.round(readings.liveHumidity)} %`;
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
        score: game.score,
        nearestText: bestStation ? `En mira: ${bestStation.name}` : `Sig: ${nearestLabel}`
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
