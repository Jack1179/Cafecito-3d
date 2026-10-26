import * as THREE from 'three';

/**
 * Crea una figura Shape de rectángulo redondeado centrada en (0, 0)
 */
function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/**
 * Crea un triángulo equilátero redondeado apuntando hacia arriba (+Y) o abajo (-Y)
 */
function createRoundedTriangleShape(size, pointUp = true) {
  const shape = new THREE.Shape();
  const dir = pointUp ? 1 : -1;
  const h = size * 0.88;
  const halfW = size * 0.52;

  const pTop = new THREE.Vector2(0, dir * (h * 0.58));
  const pLeft = new THREE.Vector2(-halfW, -dir * (h * 0.42));
  const pRight = new THREE.Vector2(halfW, -dir * (h * 0.42));

  const pts = pointUp ? [pTop, pRight, pLeft] : [pTop, pLeft, pRight];
  const cornerLerp = 0.22;

  for (let i = 0; i < 3; i++) {
    const prev = pts[(i + 2) % 3];
    const curr = pts[i];
    const next = pts[(i + 1) % 3];

    const start = curr.clone().lerp(prev, cornerLerp);
    const end = curr.clone().lerp(next, cornerLerp);
    if (i === 0) shape.moveTo(start.x, start.y);
    else shape.lineTo(start.x, start.y);
    shape.quadraticCurveTo(curr.x, curr.y, end.x, end.y);
  }
  shape.closePath();
  return shape;
}

/**
 *Crea una etiqueta sprite flotante para las cotas técnicas CAD
 */
function createCadLabelSprite(text, subtext = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(8, 18, 28, 0.88)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(6, 6, 308, 72, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 160, subtext ? 36 : 48);

  if (subtext) {
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(subtext, 160, 62);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.068, 0.018, 1);
  return sprite;
}

/**
 * Réplica 3D exacta del Monitor Ambiental Portátil (120 × 65 × 18 mm, 85 g)
 * basada en la hoja de diseño técnico adjunta:
 *  - Cuerpo Matte White Polycarbonate (65 mm ancho × 120 mm alto × 18 mm prof.)
 *  - Pantalla frontal IPS 50 mm × 50 mm con bisel negro
 *  - 3 botones frontales táctiles: Arriba (▲), Seleccionar (●), Abajo (▼)
 *  - Botón lateral tipo cápsula (Side button)
 *  - Reverso superior: Lente de cámara Ø8 mm + cámara virtual acoplada + haz óptico
 *  - Reverso inferior: Rejilla concéntrica de sensor T/HR Ø12 mm + flujo de aire
 */
export class HandheldMonitor3D {
  constructor(ipsTexture) {
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    // Dimensiones exactas en metros (1 mm = 0.001 m)
    this.width = 0.065;
    this.height = 0.120;
    this.depth = 0.018;

    this.interactiveMeshes = [];
    this.buttonStates = {
      up: { press: 0, mesh: null, basePos: 0 },
      select: { press: 0, mesh: null, basePos: 0 },
      down: { press: 0, mesh: null, basePos: 0 },
      side: { press: 0, mesh: null, basePos: 0 }
    };

    this.hoveredButton = null;
    this.inspectSpinY = 0;
    this.targetSpinY = 0;

    this.buildMaterials(ipsTexture);
    this.buildShell();
    this.buildFrontScreenAndButtons();
    this.buildSideButton();
    this.buildRearCameraAndGrill();
    this.buildOpticalEffects();
    this.buildCadCallouts();
  }

  buildMaterials(ipsTexture) {
    // Policarbonato blanco mate (Matte White Polycarbonate)
    this.polyWhiteMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f6f9,
      roughness: 0.44,
      metalness: 0.02,
      clearcoat: 0.08,
      clearcoatRoughness: 0.55
    });

    // Ranura de unión y biseles sutiles para lectura limpia de líneas CAD
    this.seamMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.65,
      metalness: 0.08
    });

    // Botones blancos táctiles con ligero contraste satinado
    this.buttonBaseColor = new THREE.Color(0xf8fafc);
    this.buttonHoverColor = new THREE.Color(0xdcfce7);

    // Bisel negro alrededor de la pantalla IPS 50×50 mm
    this.bezelMat = new THREE.MeshPhysicalMaterial({
      color: 0x111827,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 0.75,
      clearcoatRoughness: 0.15
    });

    // Pantalla activa IPS 50×50 mm
    this.screenMat = new THREE.MeshBasicMaterial({
      map: ipsTexture
    });

    // Cristal del lente trasero Ø8 mm
    this.lensGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x091e2c,
      emissive: 0x052e2b,
      emissiveIntensity: 0.35,
      roughness: 0.05,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04
    });

    this.darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.72
    });

    this.sensorCavityMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.15
    });
  }

  buildShell() {
    const cornerRadius = 0.0135; // 13.5 mm según silueta de la hoja técnica

    // Mitad frontal (8 mm prof. con bisel limpio hacia el frente z > 0)
    const frontShape = createRoundedRectShape(this.width - 0.0024, this.height - 0.0024, cornerRadius - 0.001);
    const frontGeo = new THREE.ExtrudeGeometry(frontShape, {
      depth: 0.0068,
      bevelEnabled: true,
      bevelSegments: 6,
      steps: 1,
      bevelSize: 0.0012,
      bevelThickness: 0.0012
    });
    // Alinear para que vaya desde z = 0 hasta z = +0.009
    frontGeo.translate(0, 0, 0.001);
    const frontShell = new THREE.Mesh(frontGeo, this.polyWhiteMat);
    frontShell.castShadow = true;
    frontShell.receiveShadow = true;
    this.bodyGroup.add(frontShell);

    // Mitad trasera ergonómica curvada (10 mm prof. hacia z < 0, como en SIDE VIEW)
    const backShape = createRoundedRectShape(this.width - 0.0056, this.height - 0.0056, cornerRadius - 0.0024);
    const backGeo = new THREE.ExtrudeGeometry(backShape, {
      depth: 0.0052,
      bevelEnabled: true,
      bevelSegments: 8,
      steps: 1,
      bevelSize: 0.0028,
      bevelThickness: 0.0024
    });
    // Alinear para que cubra z = 0 hasta z = -0.009
    backGeo.translate(0, 0, -0.0066);
    const backShell = new THREE.Mesh(backGeo, this.polyWhiteMat);
    backShell.castShadow = true;
    backShell.receiveShadow = true;
    this.bodyGroup.add(backShell);

    // Línea perimetral de ensamble (parting seam en z = 0)
    const seamOuter = createRoundedRectShape(this.width + 0.0002, this.height + 0.0002, cornerRadius);
    const seamHole = createRoundedRectShape(this.width - 0.002, this.height - 0.002, cornerRadius - 0.001);
    seamOuter.holes.push(seamHole);
    const seamGeo = new THREE.ExtrudeGeometry(seamOuter, {
      depth: 0.0009,
      bevelEnabled: false
    });
    seamGeo.translate(0, 0, -0.00045);
    const seamMesh = new THREE.Mesh(seamGeo, this.seamMat);
    this.bodyGroup.add(seamMesh);

    // Sutil reborde frontal concéntrico visto en FRONT VIEW
    const frontRimOuter = createRoundedRectShape(this.width - 0.005, this.height - 0.005, cornerRadius - 0.0022);
    const frontRimInner = createRoundedRectShape(this.width - 0.0062, this.height - 0.0062, cornerRadius - 0.0028);
    frontRimOuter.holes.push(frontRimInner);
    const frontRimGeo = new THREE.ShapeGeometry(frontRimOuter, 24);
    const frontRim = new THREE.Mesh(frontRimGeo, this.seamMat);
    frontRim.position.z = 0.00905;
    this.bodyGroup.add(frontRim);
  }

  buildFrontScreenAndButtons() {
    const frontZ = 0.00905;
    const screenCenterY = 0.0235; // Parte superior del cuerpo de 120 mm (-60 a +60 mm)

    // Bisel negro redondeado (~55 mm × 55 mm) alrededor de la pantalla IPS 50×50 mm
    const bezelShape = createRoundedRectShape(0.055, 0.055, 0.0046);
    const bezelGeo = new THREE.ExtrudeGeometry(bezelShape, {
      depth: 0.0005,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.0003,
      bevelThickness: 0.0002
    });
    const bezelMesh = new THREE.Mesh(bezelGeo, this.bezelMat);
    bezelMesh.position.set(0, screenCenterY, frontZ - 0.0002);
    this.bodyGroup.add(bezelMesh);

    // Pantalla activa IPS exacta: 50 mm × 50 mm
    const screenGeo = new THREE.PlaneGeometry(0.050, 0.050);
    this.screenMesh = new THREE.Mesh(screenGeo, this.screenMat);
    this.screenMesh.position.set(0, screenCenterY, frontZ + 0.0006);
    this.screenMesh.userData = { buttonId: 'screen', label: 'Pantalla IPS 50×50 mm' };
    this.bodyGroup.add(this.screenMesh);
    this.interactiveMeshes.push(this.screenMesh);

    // 3 botones de navegación frontales: Arriba (▲), Seleccionar (●), Abajo (▼)
    const createFrontButton = (id, label, shape, yPos) => {
      // Sombra/ranura perimetral del botón
      const slotMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      const slotGeo = new THREE.ShapeGeometry(shape, 20);
      const slotMesh = new THREE.Mesh(slotGeo, slotMat);
      slotMesh.scale.set(1.13, 1.13, 1);
      slotMesh.position.set(0, yPos, frontZ + 0.0001);
      this.bodyGroup.add(slotMesh);

      const btnMat = new THREE.MeshPhysicalMaterial({
        color: this.buttonBaseColor.clone(),
        roughness: 0.35,
        metalness: 0.04,
        clearcoat: 0.2
      });

      const btnGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.0011,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: 0.00035,
        bevelThickness: 0.00035
      });

      const btnMesh = new THREE.Mesh(btnGeo, btnMat);
      const baseZ = frontZ + 0.00015;
      btnMesh.position.set(0, yPos, baseZ);
      btnMesh.userData = { buttonId: id, label };
      this.bodyGroup.add(btnMesh);
      this.interactiveMeshes.push(btnMesh);

      this.buttonStates[id] = { press: 0, mesh: btnMesh, basePos: baseZ, axis: 'z', dir: -1 };
    };

    // ▲ Botón Arriba
    createFrontButton(
      'up',
      'Botón Arriba (▲)',
      createRoundedTriangleShape(0.0098, true),
      -0.0145
    );

    // ● Botón Central Seleccionar (Ø 10 mm)
    const circleShape = new THREE.Shape();
    circleShape.absarc(0, 0, 0.0050, 0, Math.PI * 2, false);
    createFrontButton('select', 'Botón Seleccionar (●)', circleShape, -0.0295);

    // ▼ Botón Abajo
    createFrontButton(
      'down',
      'Botón Abajo (▼)',
      createRoundedTriangleShape(0.0098, false),
      -0.0445
    );
  }

  buildSideButton() {
    // Botón lateral tipo píldora en el borde derecho (x = +32.5 mm, y = +6 mm)
    const pillShape = createRoundedRectShape(0.0046, 0.0125, 0.0023);
    const pillGeo = new THREE.ExtrudeGeometry(pillShape, {
      depth: 0.0016,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.0004,
      bevelThickness: 0.0004
    });
    // Rotar para que extruya hacia +X
    pillGeo.rotateY(Math.PI / 2);

    const sideMat = new THREE.MeshPhysicalMaterial({
      color: this.buttonBaseColor.clone(),
      roughness: 0.35,
      metalness: 0.05
    });

    const baseX = this.width / 2 - 0.0003;
    const sideBtn = new THREE.Mesh(pillGeo, sideMat);
    sideBtn.position.set(baseX, 0.006, 0);
    sideBtn.userData = { buttonId: 'side', label: 'Botón Lateral (Escáner Rápido)' };
    this.bodyGroup.add(sideBtn);
    this.interactiveMeshes.push(sideBtn);

    // Contorno sutil alrededor del botón lateral
    const rimShape = createRoundedRectShape(0.0056, 0.0136, 0.0028);
    const rimGeo = new THREE.ShapeGeometry(rimShape, 16);
    rimGeo.rotateY(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, this.seamMat);
    rimMesh.position.set(this.width / 2 + 0.00008, 0.006, 0);
    this.bodyGroup.add(rimMesh);

    this.buttonStates.side = { press: 0, mesh: sideBtn, basePos: baseX, axis: 'x', dir: -1 };
  }

  buildRearCameraAndGrill() {
    const rearZ = -0.00905;

    // =========================================================
    // 1. REVERSO SUPERIOR: LENTE DE CÁMARA Ø8 mm (y = +27 mm)
    // =========================================================
    const camY = 0.027;
    const camGroup = new THREE.Group();
    camGroup.position.set(0, camY, rearZ);
    // Mirar hacia -Z (el exterior trasero del dispositivo)
    camGroup.rotation.x = Math.PI;
    this.bodyGroup.add(camGroup);

    // Anillo biselado exterior visto en BACK VIEW (Ø 13.5 mm)
    const outerRingGeo = new THREE.RingGeometry(0.0043, 0.0068, 36);
    const outerRing = new THREE.Mesh(outerRingGeo, this.seamMat);
    outerRing.position.z = 0.0001;
    camGroup.add(outerRing);

    // Barril anodizado negro Ø8 mm exacto (radio = 4.0 mm)
    const barrelGeo = new THREE.CylinderGeometry(0.0040, 0.0042, 0.0014, 36);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, this.darkAnodizedMat);
    barrel.position.z = 0.0005;
    camGroup.add(barrel);

    // Anillo LED indicador de estado alrededor de la óptica
    const ledRingGeo = new THREE.RingGeometry(0.0033, 0.0038, 32);
    this.statusLedMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
    const ledRing = new THREE.Mesh(ledRingGeo, this.statusLedMat);
    ledRing.position.z = 0.00125;
    camGroup.add(ledRing);

    // Cristal óptico convexo multicapa
    const glassGeo = new THREE.SphereGeometry(0.0032, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
    glassGeo.rotateX(Math.PI / 2);
    const glass = new THREE.Mesh(glassGeo, this.lensGlassMat);
    glass.position.z = 0.0004;
    camGroup.add(glass);

    // Pupila/apertura interior Ø 2.4 mm
    const irisGeo = new THREE.CircleGeometry(0.0012, 24);
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x020617 });
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.z = 0.00135;
    camGroup.add(iris);

    // Cámara Three.js real acoplada al lente Ø8 mm mirando hacia -Z del dispositivo
    this.lensCamera = new THREE.PerspectiveCamera(44, 1, 0.04, 4.5);
    this.lensCamera.position.set(0, camY, rearZ - 0.003);
    // Por defecto una cámara mira hacia -Z local, que coincide con la parte trasera (-Z) del monitor
    this.bodyGroup.add(this.lensCamera);

    // =========================================================
    // 2. REVERSO INFERIOR: REJILLA DE SENSOR Ø12 mm (y = -34 mm)
    // =========================================================
    const grillY = -0.034;
    const grillGroup = new THREE.Group();
    grillGroup.position.set(0, grillY, rearZ);
    grillGroup.rotation.x = Math.PI;
    this.bodyGroup.add(grillGroup);

    // Cavidad oscura interna Ø 12 mm (radio = 6.0 mm) que aloja el sensor de humedad/temperatura
    const cavityGeo = new THREE.CircleGeometry(0.0060, 40);
    const cavity = new THREE.Mesh(cavityGeo, this.sensorCavityMat);
    cavity.position.z = 0.00008;
    grillGroup.add(cavity);

    // Rejilla concéntrica blanca sobre la cavidad (idéntica al dibujo BACK VIEW Ø12 mm)
    const grillRibMat = new THREE.MeshStandardMaterial({
      color: 0xeef2f6,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Anillo exterior Ø 12 mm, anillo intermedio Ø 8.2 mm y núcleo central Ø 3.8 mm
    const outerBand = new THREE.Mesh(new THREE.RingGeometry(0.0054, 0.0062, 40), grillRibMat);
    outerBand.position.z = 0.00028;
    grillGroup.add(outerBand);

    const midBand = new THREE.Mesh(new THREE.RingGeometry(0.0034, 0.0041, 36), grillRibMat);
    midBand.position.z = 0.00028;
    grillGroup.add(midBand);

    const centerHub = new THREE.Mesh(new THREE.CircleGeometry(0.0019, 28), grillRibMat);
    centerHub.position.z = 0.0003;
    grillGroup.add(centerHub);

    // 6 nervaduras radiales que dividen las ranuras arqueadas concéntricas
    for (let i = 0; i < 6; i++) {
      const ribGeo = new THREE.PlaneGeometry(0.00085, 0.0118);
      const rib = new THREE.Mesh(ribGeo, grillRibMat);
      rib.rotation.z = (i * Math.PI) / 6;
      rib.position.z = 0.00029;
      grillGroup.add(rib);
    }
  }

  buildOpticalEffects() {
    // Haz volumétrico del escáner óptico desde la cámara trasera Ø8 mm
    this.scanBeamGroup = new THREE.Group();
    this.scanBeamGroup.position.set(0, 0.027, -0.011);
    this.bodyGroup.add(this.scanBeamGroup);

    const coneLen = 0.52;
    const coneGeo = new THREE.ConeGeometry(0.16, coneLen, 28, 1, true);
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(Math.PI / 2); // Apuntar desde vértice (0,0,0) hacia -Z

    this.scanConeMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.scanCone = new THREE.Mesh(coneGeo, this.scanConeMat);
    this.scanBeamGroup.add(this.scanCone);

    // Anillo láser proyectado al frente del cono
    const ringGeo = new THREE.RingGeometry(0.055, 0.062, 36);
    this.laserRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.laserRing = new THREE.Mesh(ringGeo, this.laserRingMat);
    this.laserRing.position.z = -0.34;
    this.scanBeamGroup.add(this.laserRing);

    // Partículas de muestreo de aire entrando a la rejilla Ø12 mm (y = -34 mm)
    const count = 32;
    const pos = new Float32Array(count * 3);
    this.airSeeds = [];
    for (let i = 0; i < count; i++) {
      const seed = {
        angle: Math.random() * Math.PI * 2,
        radius: 0.006 + Math.random() * 0.045,
        phase: Math.random()
      };
      this.airSeeds.push(seed);
      pos[i * 3] = Math.cos(seed.angle) * seed.radius;
      pos[i * 3 + 1] = -0.034 + Math.sin(seed.angle) * seed.radius;
      pos[i * 3 + 2] = -0.012 - seed.phase * 0.14;
    }

    const airGeo = new THREE.BufferGeometry();
    airGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.airMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.0045,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.airPoints = new THREE.Points(airGeo, this.airMat);
    this.bodyGroup.add(this.airPoints);
  }

  buildCadCallouts() {
    this.cadOverlayGroup = new THREE.Group();
    this.cadOverlayGroup.visible = false;
    this.bodyGroup.add(this.cadOverlayGroup);

    const addCallout = (text, sub, x, y, z) => {
      const sp = createCadLabelSprite(text, sub);
      sp.position.set(x, y, z);
      this.cadOverlayGroup.add(sp);
    };

    addCallout('120 × 65 × 18 mm', '85g Policarbonato Mate', 0, 0.082, 0.01);
    addCallout('IPS 50 × 50 mm', 'Visor IA + Clima', -0.068, 0.025, 0.015);
    addCallout('3x Botones ▲ ● ▼', 'Navegación Táctil', -0.068, -0.030, 0.015);
    addCallout('Side Button', 'Disparo Óptico', 0.066, 0.008, 0.005);
    addCallout('Cámara Ø8 mm', 'Óptica Trasera Superior', 0.066, 0.032, -0.018);
    addCallout('Sensor Grill Ø12 mm', 'Humedad / Temp Inferior', 0.068, -0.036, -0.018);
  }

  triggerButtonPress(buttonId) {
    const st = this.buttonStates[buttonId];
    if (st) st.press = 1.0;
  }

  setHoveredButton(buttonId) {
    if (this.hoveredButton === buttonId) return;
    this.hoveredButton = buttonId;
    Object.entries(this.buttonStates).forEach(([id, st]) => {
      if (st.mesh && st.mesh.material) {
        st.mesh.material.color.copy(id === buttonId ? this.buttonHoverColor : this.buttonBaseColor);
      }
    });
  }

  toggleCadInspection(forceState) {
    const isNowInspect =
      typeof forceState === 'boolean' ? forceState : !this.cadOverlayGroup.visible;
    this.cadOverlayGroup.visible = isNowInspect;
    return isNowInspect;
  }

  flipBackView() {
    // Alterna entre vista frontal (0 rad) y vista trasera (π rad) para ver cámara Ø8mm y rejilla Ø12mm
    this.targetSpinY = Math.abs(this.targetSpinY) < 0.5 ? Math.PI : 0;
    return Math.abs(this.targetSpinY) > 0.5;
  }

  update(dt, elapsed, { isScanning = false, accentHex = '#10b981', autoRotateCad = false } = {}) {
    // Animación elástica de los botones físicos
    Object.values(this.buttonStates).forEach((st) => {
      if (!st.mesh) return;
      st.press = Math.max(0, st.press - dt * 5.5);
      const offset = Math.sin(st.press * Math.PI * 0.5) * 0.0011 * st.dir;
      st.mesh.position[st.axis] = st.basePos + offset;
    });

    // Rotación suave de inspección 360° o vista trasera
    if (autoRotateCad && this.cadOverlayGroup.visible) {
      this.inspectSpinY += dt * 0.75;
    } else {
      this.inspectSpinY = THREE.MathUtils.lerp(this.inspectSpinY, this.targetSpinY, Math.min(1, dt * 7));
    }
    this.bodyGroup.rotation.y = this.inspectSpinY;

    // Color del anillo LED trasero y haz de escaneo
    this.statusLedMat.color.set(accentHex);
    this.scanConeMat.color.set(accentHex);

    const targetConeOpacity = isScanning ? 0.22 + Math.sin(elapsed * 14) * 0.05 : 0.035;
    this.scanConeMat.opacity = THREE.MathUtils.lerp(
      this.scanConeMat.opacity,
      targetConeOpacity,
      Math.min(1, dt * 10)
    );
    this.laserRingMat.opacity = isScanning ? 0.65 : 0.14;
    const pulseScale = isScanning ? 0.9 + Math.sin(elapsed * 10) * 0.14 : 0.85;
    this.laserRing.scale.setScalar(pulseScale);
    this.scanBeamGroup.scale.z = Math.abs(this.inspectSpinY) > 1.2 ? 0.28 : 1.0;

    // Animar partículas de aire entrando a la rejilla Ø12 mm
    const attr = this.airPoints.geometry.attributes.position;
    const speed = isScanning ? 1.45 : 0.55;
    for (let i = 0; i < this.airSeeds.length; i++) {
      const s = this.airSeeds[i];
      s.phase = (s.phase + dt * speed) % 1;
      const inv = 1 - s.phase; // Se acerca hacia z = -0.010 y radio -> 0.003
      const curR = 0.002 + s.radius * inv;
      const curAngle = s.angle + (1 - inv) * 2.2;
      attr.setXYZ(
        i,
        Math.cos(curAngle) * curR,
        -0.034 + Math.sin(curAngle) * curR,
        -0.010 - inv * 0.16
      );
    }
    attr.needsUpdate = true;
    this.airMat.opacity = isScanning ? 0.82 : 0.35;
  }
}
