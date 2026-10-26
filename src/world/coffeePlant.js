import * as THREE from 'three';
import { DISEASES } from '../game/diseases.js';

/**
 * Genera una textura procedural detallada de hoja de café (Coffea arabica)
 * con nervadura central/secundaria y lesiones patológicas dinámicas.
 */
function paintCoffeeLeafCanvas(canvas, diseaseId = 'healthy', severity = 1.0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Color base foliar según estado nutricional/patológico
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (diseaseId === 'cercospora') {
    grad.addColorStop(0, '#65a30d');
    grad.addColorStop(0.6, '#4d7c0f');
    grad.addColorStop(1, '#84cc16');
  } else if (diseaseId === 'roya') {
    grad.addColorStop(0, '#15803d');
    grad.addColorStop(0.7, '#166534');
    grad.addColorStop(1, '#3f6212');
  } else if (diseaseId === 'antracnosis') {
    grad.addColorStop(0, '#14532d');
    grad.addColorStop(1, '#1e293b');
  } else {
    grad.addColorStop(0, '#16a34a');
    grad.addColorStop(0.5, '#15803d');
    grad.addColorStop(1, '#14532d');
  }

  // Silueta acuminada típica de Coffea arabica
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.03);
  ctx.bezierCurveTo(W * 0.92, H * 0.24, W * 0.94, H * 0.68, W * 0.5, H * 0.97);
  ctx.bezierCurveTo(W * 0.06, H * 0.68, W * 0.08, H * 0.24, W * 0.5, H * 0.03);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.clip();

  // Nervadura central y pares de venas secundarias arqueadas
  ctx.strokeStyle = 'rgba(187, 247, 208, 0.42)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.05);
  ctx.lineTo(W * 0.5, H * 0.95);
  ctx.stroke();

  ctx.lineWidth = 1.7;
  for (let i = 1; i <= 7; i++) {
    const y = H * (0.14 + i * 0.105);
    const span = Math.sin((i / 8) * Math.PI) * W * 0.36;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, y);
    ctx.quadraticCurveTo(W * 0.5 + span * 0.55, y - 8, W * 0.5 + span, y - 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(W * 0.5, y);
    ctx.quadraticCurveTo(W * 0.5 - span * 0.55, y - 8, W * 0.5 - span, y - 20);
    ctx.stroke();
  }

  // Lesiones específicas por enfermedad
  const spots = [
    [0.34, 0.36, 18],
    [0.65, 0.44, 22],
    [0.40, 0.62, 20],
    [0.62, 0.70, 16],
    [0.48, 0.26, 14],
    [0.30, 0.52, 15],
    [0.70, 0.56, 15]
  ];

  if (diseaseId === 'roya' && severity > 0.05) {
    // Pústulas polvorientas amarillo-naranja de Hemileia vastatrix
    spots.forEach(([nx, ny, rad]) => {
      const r = rad * severity;
      const gSpot = ctx.createRadialGradient(W * nx, H * ny, r * 0.1, W * nx, H * ny, r * 1.35);
      gSpot.addColorStop(0, '#ea580c');
      gSpot.addColorStop(0.55, '#f97316');
      gSpot.addColorStop(0.85, 'rgba(250, 204, 21, 0.75)');
      gSpot.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = gSpot;
      ctx.beginPath();
      ctx.arc(W * nx, H * ny, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (diseaseId === 'cercospora' && severity > 0.05) {
    // Mancha de hierro: centro necrótico pardo oscuro + halo amarillo brillante
    spots.slice(0, 5).forEach(([nx, ny, rad]) => {
      const r = rad * 0.95 * severity;
      ctx.fillStyle = 'rgba(253, 224, 71, 0.88)';
      ctx.beginPath();
      ctx.arc(W * nx, H * ny, r * 1.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c2d0c';
      ctx.beginPath();
      ctx.arc(W * nx, H * ny, r * 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a16207';
      ctx.beginPath();
      ctx.arc(W * nx, H * ny, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (diseaseId === 'antracnosis' && severity > 0.05) {
    // Necrosis marginal oscura hundida
    spots.slice(0, 5).forEach(([nx, ny, rad]) => {
      const r = rad * 1.15 * severity;
      const gDark = ctx.createRadialGradient(W * nx, H * ny, 2, W * nx, H * ny, r);
      gDark.addColorStop(0, '#09090b');
      gDark.addColorStop(0.7, '#27272a');
      gDark.addColorStop(1, 'rgba(39, 39, 42, 0)');
      ctx.fillStyle = gDark;
      ctx.beginPath();
      ctx.arc(W * nx, H * ny, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}

/**
 * Crea etiqueta flotante minimalista sobre cada estación cafetera
 */
function createStationBadge() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.34, 0.085, 1);
  return { sprite, canvas, ctx: canvas.getContext('2d'), tex };
}

/**
 * Estación interactiva de Café (puede ser una Mata 3D completa,
 * un Canasto de Cerezas Cosechadas o una Zaranda de Café Pergamino).
 */
export class CoffeeStation3D {
  constructor(config, groundY = 0) {
    this.config = config;
    this.index = config.index;
    this.id = config.id;
    this.name = config.name;
    this.zone = config.zone || 'Cafetal';
    this.kind = config.kind; // 'plant' | 'cherries' | 'beans'

    this.diseaseId = 'healthy';
    this.scanned = false;
    this.verifiedHealthy = false;
    this.health = 96;
    this.lesionSeverity = 0;
    this.swayVelocity = new THREE.Vector2(0, 0);
    this.swayOffset = new THREE.Vector2(0, 0);
    this.bloomFactor = 0; // Floración cafetera tras curar

    const sc = config.scale || 1;
    const [mx, mz] = config.mapPos || [config.position?.[0] || 0, config.position?.[2] || -1];
    const baseY = config.onTable ? groundY + 0.78 : groundY + 0.13 * sc;

    this.group = new THREE.Group();
    this.group.position.set(mx, baseY, mz);
    this.group.scale.setScalar(sc);

    this.swayPivot = new THREE.Group();
    this.group.add(this.swayPivot);

    if (config.onTable) {
      this.buildWoodenTable(0.78 / sc);
    }
    this.buildGroundBeacon(config.onTable ? -0.77 / sc : -0.125);

    // Textura propia de hoja para poder actualizar patología dinámicamente
    this.leafCanvas = document.createElement('canvas');
    this.leafCanvas.width = 256;
    this.leafCanvas.height = 256;
    paintCoffeeLeafCanvas(this.leafCanvas, 'healthy', 0);
    this.leafTexture = new THREE.CanvasTexture(this.leafCanvas);
    this.leafTexture.colorSpace = THREE.SRGBColorSpace;

    this.cherryMeshes = [];
    this.boreHoleMeshes = [];
    this.flowerMeshes = [];
    this.beanMeshes = [];
    this.branchGroups = [];

    if (this.kind === 'plant') {
      this.buildCoffeePlant();
    } else if (this.kind === 'cherries') {
      this.buildCherryBasket();
    } else {
      this.buildParchmentBeanTray();
    }

    this.buildSporeAura();
    this.badge = createStationBadge();
    this.badge.sprite.position.set(0, this.kind === 'plant' ? 0.58 : 0.25, 0);
    this.group.add(this.badge.sprite);
    this.refreshBadge();

    // Hitbox invisible para selección fácil con raycaster / mano / toque
    const hitGeo = new THREE.SphereGeometry(this.kind === 'plant' ? 0.28 : 0.20, 14, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitCollider = new THREE.Mesh(hitGeo, hitMat);
    this.hitCollider.position.y = this.kind === 'plant' ? 0.26 : 0.08;
    this.hitCollider.userData = { stationIndex: this.index };
    this.group.add(this.hitCollider);
  }

  getFocusWorldPosition(target = new THREE.Vector3()) {
    this.hitCollider.getWorldPosition(target);
    return target;
  }

  buildWoodenTable(tableHeightLocal) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.82 });
    const topGeo = new THREE.BoxGeometry(0.46, 0.028, 0.36);
    const topMesh = new THREE.Mesh(topGeo, woodMat);
    topMesh.position.y = -0.012;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    this.group.add(topMesh);

    const legH = Math.max(0.2, tableHeightLocal - 0.02);
    const legGeo = new THREE.BoxGeometry(0.032, legH, 0.032);
    [
      [-0.19, -0.14],
      [0.19, -0.14],
      [-0.19, 0.14],
      [0.19, 0.14]
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, -legH / 2 - 0.02, lz);
      leg.castShadow = true;
      this.group.add(leg);
    });
  }

  buildGroundBeacon(localY) {
    const ringGeo = new THREE.RingGeometry(0.22, 0.26, 36);
    ringGeo.rotateX(-Math.PI / 2);
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.beaconRing = new THREE.Mesh(ringGeo, this.beaconMat);
    this.beaconRing.position.y = localY;
    this.group.add(this.beaconRing);
  }

  buildCoffeePlant() {
    // Maceta / montículo de suelo volcánico andino
    const potMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.85 });
    const potGeo = new THREE.CylinderGeometry(0.13, 0.095, 0.14, 20);
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.y = -0.06;
    pot.castShadow = true;
    pot.receiveShadow = true;
    this.group.add(pot);

    const soilMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.95 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.011;
    this.group.add(soil);

    // Tallo ortotrópico leñoso
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.82 });
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.022, 0.48, 12);
    stemGeo.translate(0, 0.24, 0);
    const stem = new THREE.Mesh(stemGeo, barkMat);
    stem.castShadow = true;
    this.swayPivot.add(stem);

    // Material foliar con alpha cutout suave
    this.leafMat = new THREE.MeshStandardMaterial({
      map: this.leafTexture,
      transparent: true,
      alphaTest: 0.18,
      roughness: 0.34,
      metalness: 0.04,
      side: THREE.DoubleSide
    });

    // Geometría de hoja curvada orgánicamente
    const leafGeo = new THREE.PlaneGeometry(0.095, 0.145, 4, 6);
    const posAttr = leafGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      // Curvatura longitudinal y acanalado central
      const bendZ = -Math.pow(y / 0.072, 2) * 0.012 + Math.abs(x) * 0.12;
      posAttr.setZ(i, bendZ);
    }
    leafGeo.computeVertexNormals();
    leafGeo.translate(0, 0.07, 0);

    const cherryGeo = new THREE.SphereGeometry(0.0135, 14, 12);
    cherryGeo.scale(1, 1.18, 1);

    const holeGeo = new THREE.CircleGeometry(0.0042, 10);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x09090b, side: THREE.DoubleSide });

    const flowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef9c3,
      emissiveIntensity: 0.28,
      roughness: 0.3
    });

    // 3 pisos de ramas plagiotrópicas cruzadas
    const tiers = [
      { y: 0.16, len: 0.23, count: 4, rotOffset: 0.2 },
      { y: 0.29, len: 0.20, count: 4, rotOffset: 0.95 },
      { y: 0.41, len: 0.14, count: 4, rotOffset: 0.4 }
    ];

    tiers.forEach((tier) => {
      for (let b = 0; b < tier.count; b++) {
        const angle = tier.rotOffset + (b * Math.PI * 2) / tier.count;
        const branchGroup = new THREE.Group();
        branchGroup.position.set(0, tier.y, 0);
        branchGroup.rotation.y = angle;
        branchGroup.userData = { baseRotZ: -0.18 };
        branchGroup.rotation.z = -0.18;
        this.swayPivot.add(branchGroup);
        this.branchGroups.push(branchGroup);

        const twigGeo = new THREE.CylinderGeometry(0.0035, 0.006, tier.len, 8);
        twigGeo.rotateZ(-Math.PI / 2);
        twigGeo.translate(tier.len / 2, 0, 0);
        const twig = new THREE.Mesh(twigGeo, barkMat);
        branchGroup.add(twig);

        // Pares de hojas opuestas a lo largo de la rama
        const nodes = [0.44, 0.82];
        nodes.forEach((nFrac) => {
          [-1, 1].forEach((side) => {
            const leaf = new THREE.Mesh(leafGeo, this.leafMat);
            leaf.position.set(tier.len * nFrac, 0.004, side * 0.01);
            leaf.rotation.order = 'YXZ';
            leaf.rotation.y = side * 1.15;
            leaf.rotation.x = 1.12;
            leaf.castShadow = true;
            branchGroup.add(leaf);
          });
        });

        // Hoja apical en la punta de la rama
        const tipLeaf = new THREE.Mesh(leafGeo, this.leafMat);
        tipLeaf.position.set(tier.len, 0.005, 0);
        tipLeaf.rotation.z = -Math.PI / 2;
        tipLeaf.rotation.y = 0.2;
        tipLeaf.scale.setScalar(0.82);
        branchGroup.add(tipLeaf);

        // Glomérulo (racimo) de cerezas de café en el nudo interno
        const clusterX = tier.len * 0.36;
        for (let c = 0; c < 4; c++) {
          const cMat = new THREE.MeshPhysicalMaterial({
            color: c === 3 ? 0x65a30d : 0xdc2626,
            roughness: 0.2,
            clearcoat: 0.65
          });
          const cherry = new THREE.Mesh(cherryGeo, cMat);
          const ca = (c * Math.PI) / 2 + b;
          cherry.position.set(
            clusterX + Math.cos(ca) * 0.012,
            Math.sin(ca) * 0.014,
            Math.sin(ca * 2) * 0.014
          );
          cherry.userData = { isGreen: c === 3 };
          branchGroup.add(cherry);
          this.cherryMeshes.push(cherry);

          // Perforación de Broca (visible cuando diseaseId === 'broca')
          const hole = new THREE.Mesh(holeGeo, holeMat);
          hole.position.set(0, 0, 0.0142);
          hole.visible = false;
          cherry.add(hole);
          this.boreHoleMeshes.push(hole);
        }

        // Flor blanca de café (aparece cuando la planta florece sana)
        const flowerGroup = new THREE.Group();
        flowerGroup.position.set(tier.len * 0.64, 0.016, 0);
        for (let p = 0; p < 5; p++) {
          const petalGeo = new THREE.PlaneGeometry(0.007, 0.019);
          petalGeo.translate(0, 0.01, 0);
          const petal = new THREE.Mesh(petalGeo, flowerMat);
          petal.rotation.x = -Math.PI / 2.4;
          petal.rotation.z = (p * Math.PI * 2) / 5;
          flowerGroup.add(petal);
        }
        flowerGroup.scale.setScalar(0.001);
        branchGroup.add(flowerGroup);
        this.flowerMeshes.push(flowerGroup);
      }
    });
  }

  buildCherryBasket() {
    // Canasto artesanal cafetero tejido lleno de cerezas de café recién recolectadas
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0x926239,
      roughness: 0.78
    });
    const basketGeo = new THREE.CylinderGeometry(0.155, 0.115, 0.11, 24);
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.y = 0.03;
    basket.castShadow = true;
    this.swayPivot.add(basket);

    const rimGeo = new THREE.TorusGeometry(0.155, 0.011, 10, 28);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, basketMat);
    rim.position.y = 0.085;
    this.swayPivot.add(rim);

    const cherryGeo = new THREE.SphereGeometry(0.017, 14, 12);
    cherryGeo.scale(1, 1.16, 1);
    const holeGeo = new THREE.CircleGeometry(0.0055, 12);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x09090b, side: THREE.DoubleSide });

    for (let i = 0; i < 34; i++) {
      const r = Math.sqrt(Math.random()) * 0.125;
      const theta = Math.random() * Math.PI * 2;
      const isRipe = i % 6 !== 0;
      const cMat = new THREE.MeshPhysicalMaterial({
        color: isRipe ? 0xdc2626 : 0xeab308,
        roughness: 0.18,
        clearcoat: 0.72
      });
      const cherry = new THREE.Mesh(cherryGeo, cMat);
      cherry.position.set(
        Math.cos(theta) * r,
        0.082 + (1 - r / 0.13) * 0.032 + Math.random() * 0.012,
        Math.sin(theta) * r
      );
      cherry.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
      cherry.userData = { isGreen: !isRipe };
      this.swayPivot.add(cherry);
      this.cherryMeshes.push(cherry);

      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.set(0, 0.018, 0.006);
      hole.rotation.x = -Math.PI / 3;
      hole.visible = false;
      cherry.add(hole);
      this.boreHoleMeshes.push(hole);
    }
  }

  buildParchmentBeanTray() {
    // Zaranda de madera para inspección de café pergamino / almendra seca
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78502b, roughness: 0.72 });
    const baseGeo = new THREE.BoxGeometry(0.30, 0.025, 0.24);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.02;
    base.castShadow = true;
    this.swayPivot.add(base);

    // Malla metálica interior
    const meshFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.20),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.4 })
    );
    meshFloor.rotation.x = -Math.PI / 2;
    meshFloor.position.y = 0.034;
    this.swayPivot.add(meshFloor);

    // Bordes de la zaranda
    const borderH = 0.045;
    const fbGeo = new THREE.BoxGeometry(0.30, borderH, 0.016);
    const lrGeo = new THREE.BoxGeometry(0.016, borderH, 0.24);
    [-0.112, 0.112].forEach((z) => {
      const m = new THREE.Mesh(fbGeo, woodMat);
      m.position.set(0, 0.045, z);
      this.swayPivot.add(m);
    });
    [-0.142, 0.142].forEach((x) => {
      const m = new THREE.Mesh(lrGeo, woodMat);
      m.position.set(x, 0.045, 0);
      this.swayPivot.add(m);
    });

    // Granos de café con hendidura central
    const beanGeo = new THREE.SphereGeometry(0.013, 12, 10);
    beanGeo.scale(0.78, 0.52, 1.22);
    const holeGeo = new THREE.CircleGeometry(0.0042, 10);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x09090b, side: THREE.DoubleSide });

    for (let i = 0; i < 42; i++) {
      const bMat = new THREE.MeshStandardMaterial({
        color: 0xd6c7a9, // Pergamino sano dorado claro
        roughness: 0.55
      });
      const bean = new THREE.Mesh(beanGeo, bMat);
      bean.position.set(
        (Math.random() - 0.5) * 0.22,
        0.042 + Math.random() * 0.012,
        (Math.random() - 0.5) * 0.16
      );
      bean.rotation.y = Math.random() * Math.PI * 2;
      this.swayPivot.add(bean);
      this.beanMeshes.push(bean);

      // Hendidura central del grano
      const groove = new THREE.Mesh(
        new THREE.BoxGeometry(0.002, 0.002, 0.022),
        new THREE.MeshBasicMaterial({ color: 0x6b533b })
      );
      groove.position.y = 0.0065;
      bean.add(groove);

      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.set(0.003, 0.007, 0.004);
      hole.rotation.x = -Math.PI / 2;
      hole.visible = false;
      bean.add(hole);
      this.boreHoleMeshes.push(hole);
    }
  }

  buildSporeAura() {
    const count = 26;
    const pos = new Float32Array(count * 3);
    this.sporeSeeds = [];
    for (let i = 0; i < count; i++) {
      const seed = {
        a: Math.random() * Math.PI * 2,
        r: 0.08 + Math.random() * 0.18,
        y: 0.05 + Math.random() * 0.42,
        s: 0.6 + Math.random() * 0.9
      };
      this.sporeSeeds.push(seed);
      pos[i * 3] = Math.cos(seed.a) * seed.r;
      pos[i * 3 + 1] = seed.y;
      pos[i * 3 + 2] = Math.sin(seed.a) * seed.r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sporeMat = new THREE.PointsMaterial({
      color: 0xf97316,
      size: 0.012,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this.sporePoints = new THREE.Points(geo, this.sporeMat);
    this.group.add(this.sporePoints);
  }

  setDisease(diseaseId, markUnscanned = true) {
    this.diseaseId = diseaseId;
    if (markUnscanned) this.scanned = false;
    this.lesionSeverity = diseaseId === 'healthy' ? 0 : 1.0;
    this.health = diseaseId === 'healthy' ? 94 + Math.random() * 5 : 38 + Math.random() * 24;
    if (diseaseId === 'healthy') this.bloomFactor = 1.0;
    else this.bloomFactor = 0.0;

    this.applyDiseaseVisuals();
    this.refreshBadge();
  }

  applyDiseaseVisuals() {
    if (this.kind === 'plant') {
      paintCoffeeLeafCanvas(this.leafCanvas, this.diseaseId, this.lesionSeverity);
      this.leafTexture.needsUpdate = true;

      // Inclinación por decaimiento foliar si está enferma
      const droop = this.diseaseId === 'healthy' ? 0 : -0.14 * this.lesionSeverity;
      this.branchGroups.forEach((bg) => {
        bg.rotation.z = bg.userData.baseRotZ + droop;
      });
    }

    // Actualizar cerezas (Broca / Antracnosis / Cercospora / Sano)
    this.cherryMeshes.forEach((ch, idx) => {
      if (this.diseaseId === 'antracnosis' && idx % 2 === 0) {
        ch.material.color.setHex(0x27272a);
      } else if (this.diseaseId === 'cercospora' && idx % 3 === 0) {
        ch.material.color.setHex(0x78350f);
      } else if (this.diseaseId === 'broca' && idx % 2 === 0) {
        ch.material.color.setHex(0x991b1b);
      } else {
        ch.material.color.setHex(ch.userData.isGreen ? 0x65a30d : 0xdc2626);
      }
    });

    // Agujeros Ø1mm de Broca
    const showHoles = this.diseaseId === 'broca' && this.lesionSeverity > 0.25;
    this.boreHoleMeshes.forEach((h, idx) => {
      h.visible = showHoles && idx % 2 === 0;
    });

    // Actualizar granos pergamino en la zaranda
    this.beanMeshes.forEach((bean, idx) => {
      if (this.diseaseId === 'antracnosis' && idx % 2 === 0) {
        // Moho húmedo azul-verdoso oscuro
        bean.material.color.setHex(0x475569);
      } else if (this.diseaseId === 'broca' && idx % 2 === 0) {
        // Grano brocado manchado
        bean.material.color.setHex(0x785a46);
      } else {
        bean.material.color.setHex(0xd6c7a9);
      }
    });

    // Color de esporas / insectos orbitando
    if (this.diseaseId === 'healthy') {
      this.sporeMat.opacity = 0;
    } else {
      const dis = DISEASES[this.diseaseId];
      this.sporeMat.color.set(dis.accentColor);
      this.sporeMat.opacity = 0.72 * this.lesionSeverity;
    }
  }

  refreshBadge(isTargeted = false) {
    const { ctx, canvas, tex } = this.badge;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dis = DISEASES[this.diseaseId];
    const borderCol = this.scanned ? dis.accentColor : isTargeted ? '#38bdf8' : 'rgba(148,163,184,0.45)';

    ctx.fillStyle = 'rgba(6, 15, 24, 0.84)';
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = isTargeted ? 4 : 2.5;
    ctx.beginPath();
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, canvas.width / 2, 40);

    ctx.fillStyle = this.scanned ? dis.accentColor : '#94a3b8';
    ctx.font = 'bold 18px ui-monospace, monospace';
    const statusTxt = this.scanned
      ? `${dis.shortName} · ${Math.round(this.health)}%`
      : '● ACÉRCATE Y ESCANEA';
    ctx.fillText(statusTxt, canvas.width / 2, 71);

    if (this.beaconMat) {
      this.beaconMat.color.set(this.scanned ? dis.accentColor : '#38bdf8');
    }

    tex.needsUpdate = true;
  }

  applyImpulse(vx, vz) {
    this.swayVelocity.x += vx;
    this.swayVelocity.y += vz;
  }

  update(dt, elapsed, windStrength = 0.15, isTargeted = false) {
    // Física de resorte para movimiento de ramas ante interacción humana / viento
    const springK = 22.0;
    const damping = 4.8;
    const windWave = Math.sin(elapsed * 2.1 + this.index * 1.4) * windStrength * 0.08;

    this.swayVelocity.x += (-springK * this.swayOffset.x) * dt;
    this.swayVelocity.y += (-springK * this.swayOffset.y) * dt;
    this.swayVelocity.multiplyScalar(Math.max(0, 1 - damping * dt));
    this.swayOffset.addScaledVector(this.swayVelocity, dt);

    this.swayPivot.rotation.z = this.swayOffset.x + windWave;
    this.swayPivot.rotation.x = this.swayOffset.y + windWave * 0.5;

    // Floración suave de flores blancas en matas sanas
    const targetFlowerScale = this.diseaseId === 'healthy' ? 1.0 : 0.001;
    this.flowerMeshes.forEach((fl) => {
      const s = THREE.MathUtils.lerp(fl.scale.x, targetFlowerScale, Math.min(1, dt * 4));
      fl.scale.setScalar(s);
    });

    // Animar nube de esporas/broca si la estación está enferma
    if (this.diseaseId !== 'healthy') {
      const attr = this.sporePoints.geometry.attributes.position;
      for (let i = 0; i < this.sporeSeeds.length; i++) {
        const s = this.sporeSeeds[i];
        const ang = s.a + elapsed * s.s;
        const rad = s.r + Math.sin(elapsed * 2 + i) * 0.025;
        attr.setXYZ(
          i,
          Math.cos(ang) * rad,
          s.y + Math.sin(elapsed * 1.6 + i) * 0.03,
          Math.sin(ang) * rad
        );
      }
      attr.needsUpdate = true;
    }

    // Pulso de escala sutil en la etiqueta y anillo de piso cuando está en la mira
    const targetBadgeScale = isTargeted ? 1.12 : 0.94;
    this.badge.sprite.scale.set(0.34 * targetBadgeScale, 0.085 * targetBadgeScale, 1);

    if (this.beaconRing) {
      const pulse = 1 + Math.sin(elapsed * 3.5 + this.index) * 0.08;
      this.beaconRing.scale.setScalar(isTargeted ? pulse * 1.16 : pulse);
      this.beaconMat.opacity = isTargeted ? 0.92 : this.scanned && this.diseaseId === 'healthy' ? 0.36 : 0.68;
    }
  }
}

/**
 * Sistema de partículas 3D para nebulización de tratamientos y chispas de curación
 */
export class TreatmentFXSystem {
  constructor(scene) {
    this.bursts = [];
    this.scene = scene;
  }

  emitSpray(origin, destination, hexColor = 0x34d399) {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    const dir = destination.clone().sub(origin).normalize();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.04;
      positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.04;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.04;

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.45,
        (Math.random() - 0.35) * 0.45,
        (Math.random() - 0.5) * 0.45
      );
      velocities.push(dir.clone().multiplyScalar(1.2 + Math.random() * 0.9).add(spread));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: hexColor,
      size: 0.018,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.bursts.push({ points, velocities, age: 0, maxAge: 1.05 });
  }

  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      if (b.age >= b.maxAge) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }

      const attr = b.points.geometry.attributes.position;
      for (let p = 0; p < b.velocities.length; p++) {
        const v = b.velocities[p];
        v.y += 0.18 * dt;
        attr.setXYZ(
          p,
          attr.getX(p) + v.x * dt,
          attr.getY(p) + v.y * dt,
          attr.getZ(p) + v.z * dt
        );
      }
      attr.needsUpdate = true;
      b.points.material.opacity = 1 - b.age / b.maxAge;
    }
  }
}
