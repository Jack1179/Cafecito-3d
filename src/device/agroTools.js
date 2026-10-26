import * as THREE from 'three';
import { TREATMENTS } from '../game/diseases.js';

/**
 * Kit de herramientas físicas 3D independientes del Monitor Ambiental para
 * tratar las matas y lotes de café:
 *  1. 🧴 Atomizador / Spray de Medicina Biológica (con tanque de líquido que cambia de color según fórmula)
 *  2. ✂️ Tijeras de Podar Bypass de Acero (con cierre animado de cuchillas y mangos)
 *  3. 🏷️ Sello Certificador de Café Especial Sano
 */
export class AgroTools3D {
  constructor() {
    this.root = new THREE.Group();

    this.sprayerGroup = new THREE.Group();
    this.shearsGroup = new THREE.Group();
    this.certifierGroup = new THREE.Group();

    this.root.add(this.sprayerGroup, this.shearsGroup, this.certifierGroup);

    this.activeTreatmentIndex = 0;
    this.actionAnim = 0; // 1 -> 0 animación de apretar gatillo / cortar con tijeras / sellar
    this.showXrHint = false;

    this.buildSprayer();
    this.buildPruningShears();
    this.buildCertifierStamp();
    this.buildFloatingToolBadge();

    this.setTreatmentIndex(0);
  }

  buildSprayer() {
    // Tanque translúcido de polietileno (altura ~17 cm)
    const tankShellMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      transmission: 0.55,
      transparent: true,
      opacity: 0.78
    });
    const tankGeo = new THREE.CylinderGeometry(0.034, 0.044, 0.135, 24);
    const tank = new THREE.Mesh(tankGeo, tankShellMat);
    tank.position.set(0, -0.045, 0);
    tank.castShadow = true;
    this.sprayerGroup.add(tank);

    // Base reforzada negra del tanque
    const darkPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.15
    });
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.046, 0.018, 24), darkPlasticMat);
    baseRing.position.set(0, -0.11, 0);
    this.sprayerGroup.add(baseRing);

    // Líquido interior cuyo color refleja la medicina cargada (Azul Roya / Rojo Broca / Dorado NPK)
    this.liquidMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.2
    });
    const liquidGeo = new THREE.CylinderGeometry(0.030, 0.039, 0.105, 20);
    this.liquidMesh = new THREE.Mesh(liquidGeo, this.liquidMat);
    this.liquidMesh.position.set(0, -0.052, 0);
    this.sprayerGroup.add(this.liquidMesh);

    // Cuello roscado y cabezal pulverizador ergonómico
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.028, 20), darkPlasticMat);
    collar.position.set(0, 0.034, 0);
    this.sprayerGroup.add(collar);

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      roughness: 0.38
    });
    const headBody = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.038, 0.095), headMat);
    headBody.position.set(0, 0.062, -0.015);
    this.sprayerGroup.add(headBody);

    // Empuñadura trasera inclinada
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.085, 14), darkPlasticMat);
    grip.position.set(0, 0.025, 0.024);
    grip.rotation.x = 0.32;
    this.sprayerGroup.add(grip);

    // Gatillo móvil del atomizador
    const leverMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 });
    this.sprayLever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, 0.014), leverMat);
    this.sprayLever.position.set(0, 0.032, -0.024);
    this.sprayLever.rotation.x = -0.22;
    this.sprayerGroup.add(this.sprayLever);

    // Lanza y boquilla de bronce apuntando hacia -Z
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.28,
      metalness: 0.82
    });
    const wandGeo = new THREE.CylinderGeometry(0.005, 0.006, 0.075, 16);
    wandGeo.rotateX(Math.PI / 2);
    const wand = new THREE.Mesh(wandGeo, brassMat);
    wand.position.set(0, 0.064, -0.095);
    this.sprayerGroup.add(wand);

    const nozzleGeo = new THREE.ConeGeometry(0.011, 0.022, 18);
    nozzleGeo.rotateX(-Math.PI / 2);
    this.nozzleMesh = new THREE.Mesh(nozzleGeo, brassMat);
    this.nozzleMesh.position.set(0, 0.064, -0.138);
    this.sprayerGroup.add(this.nozzleMesh);
  }

  buildPruningShears() {
    // Tijeras de podar bypass orientadas hacia adelante (-Z)
    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(0, 0.015, -0.035);
    // Inclinar ligeramente para postura natural de corte en mano
    pivotGroup.rotation.x = 0.15;
    this.shearsGroup.add(pivotGroup);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.88
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.78
    });
    const redGripMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.52,
      metalness: 0.05
    });
    const brassBoltMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.85
    });

    // Perno central de giro
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 18), brassBoltMat);
    pivotGroup.add(bolt);

    // Mitad izquierda (contrahoja + mango izquierdo)
    this.shearJawLeft = new THREE.Group();
    pivotGroup.add(this.shearJawLeft);

    const bladeShapeL = new THREE.Shape();
    bladeShapeL.moveTo(0, 0.008);
    bladeShapeL.quadraticCurveTo(-0.016, -0.045, -0.003, -0.092);
    bladeShapeL.quadraticCurveTo(0.010, -0.050, 0.008, -0.004);
    bladeShapeL.closePath();
    const bladeGeoL = new THREE.ExtrudeGeometry(bladeShapeL, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008 });
    bladeGeoL.rotateX(Math.PI / 2);
    const bladeMeshL = new THREE.Mesh(bladeGeoL, darkSteelMat);
    bladeMeshL.position.y = -0.002;
    this.shearJawLeft.add(bladeMeshL);

    const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.115, 14), redGripMat);
    handleL.rotation.x = Math.PI / 2;
    handleL.rotation.z = 0.08;
    handleL.position.set(-0.012, 0, 0.062);
    this.shearJawLeft.add(handleL);

    // Mitad derecha (hoja cortante curva de acero + mango derecho)
    this.shearJawRight = new THREE.Group();
    pivotGroup.add(this.shearJawRight);

    const bladeShapeR = new THREE.Shape();
    bladeShapeR.moveTo(0, 0.008);
    bladeShapeR.quadraticCurveTo(0.020, -0.045, 0.002, -0.096);
    bladeShapeR.quadraticCurveTo(-0.008, -0.052, -0.008, -0.004);
    bladeShapeR.closePath();
    const bladeGeoR = new THREE.ExtrudeGeometry(bladeShapeR, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008 });
    bladeGeoR.rotateX(Math.PI / 2);
    const bladeMeshR = new THREE.Mesh(bladeGeoR, steelMat);
    bladeMeshR.position.y = 0.003;
    this.shearJawRight.add(bladeMeshR);

    const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.115, 14), redGripMat);
    handleR.rotation.x = Math.PI / 2;
    handleR.rotation.z = -0.08;
    handleR.position.set(0.012, 0, 0.062);
    this.shearJawRight.add(handleR);

    // Resorte metálico central entre los mangos
    this.shearSpring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.036, 12),
      steelMat
    );
    this.shearSpring.rotation.z = Math.PI / 2;
    this.shearSpring.position.set(0, 0, 0.042);
    pivotGroup.add(this.shearSpring);
  }

  buildCertifierStamp() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.68 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.8 });
    const emeraldPadMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      roughness: 0.3
    });

    this.stampPlunger = new THREE.Group();
    this.certifierGroup.add(this.stampPlunger);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.020, 0.085, 18), woodMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.01, 0.02);
    this.stampPlunger.add(handle);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.021, 18, 14), woodMat);
    knob.position.set(0, 0.01, 0.062);
    this.stampPlunger.add(knob);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 22), goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.01, -0.026);
    this.stampPlunger.add(collar);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 24), emeraldPadMat);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(0, 0.01, -0.038);
    this.stampPlunger.add(pad);
  }

  buildFloatingToolBadge() {
    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 420;
    this.badgeCanvas.height = 104;
    this.badgeCtx = this.badgeCanvas.getContext('2d');
    this.badgeTex = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map: this.badgeTex,
      transparent: true,
      depthTest: false
    });
    this.badgeSprite = new THREE.Sprite(mat);
    this.badgeSprite.position.set(0, 0.135, -0.02);
    this.badgeSprite.scale.set(0.185, 0.046, 1);
    this.root.add(this.badgeSprite);
  }

  setTreatmentIndex(idx, showXrHint = this.showXrHint) {
    this.activeTreatmentIndex = ((idx % TREATMENTS.length) + TREATMENTS.length) % TREATMENTS.length;
    this.showXrHint = showXrHint;
    const tr = TREATMENTS[this.activeTreatmentIndex];

    this.sprayerGroup.visible = tr.toolKind === 'sprayer';
    this.shearsGroup.visible = tr.toolKind === 'shears';
    this.certifierGroup.visible = tr.toolKind === 'certifier';

    if (tr.toolKind === 'sprayer') {
      this.liquidMat.color.setHex(tr.liquidHex);
      this.liquidMat.emissive.setHex(tr.liquidHex);
    }

    this.redrawBadge();
  }

  redrawBadge() {
    const tr = TREATMENTS[this.activeTreatmentIndex];
    const ctx = this.badgeCtx;
    const W = this.badgeCanvas.width;
    const H = this.badgeCanvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6, 16, 26, 0.9)';
    ctx.strokeStyle = tr.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tr.name, W / 2, 42);

    ctx.fillStyle = tr.color;
    ctx.font = 'bold 16px ui-monospace, monospace';
    const sub = this.showXrHint
      ? 'A/B: Cambiar Herramienta · Gatillo Der: Usar'
      : `Cura: ${tr.cures.toUpperCase()} · Clic / Enter: Usar`;
    ctx.fillText(sub, W / 2, 76);

    this.badgeTex.needsUpdate = true;
  }

  triggerUseAnimation() {
    this.actionAnim = 1.0;
  }

  getNozzleWorldPosition(out = new THREE.Vector3()) {
    const tr = TREATMENTS[this.activeTreatmentIndex];
    if (tr.toolKind === 'sprayer') {
      return this.nozzleMesh.getWorldPosition(out);
    }
    return this.root.getWorldPosition(out);
  }

  update(dt) {
    this.actionAnim = Math.max(0, this.actionAnim - dt * 4.2);
    const squeeze = Math.sin(this.actionAnim * Math.PI);

    // 1. Gatillo del Spray
    this.sprayLever.rotation.x = -0.22 + squeeze * 0.42;
    this.sprayLever.position.z = -0.024 + squeeze * 0.008;

    // 2. Cuchillas de las Tijeras de Podar (abiertas a 0.28 rad -> cierran a 0.01 rad al cortar)
    const openAngle = 0.27 * (1 - squeeze * 0.95);
    this.shearJawLeft.rotation.y = openAngle;
    this.shearJawRight.rotation.y = -openAngle;
    this.shearSpring.scale.y = 1 - squeeze * 0.38;

    // 3. Golpe hacia adelante del Sello Certificador
    this.stampPlunger.position.z = -squeeze * 0.038;
  }
}
