import * as THREE from 'three';

/**
 * Función determinista de altura del terreno andino (en metros) para cualquier (x, z).
 * Mantiene una explanada cómoda en el centro y suaves lomas hacia los lotes.
 */
export function getTerrainHeight(x, z) {
  const distCenter = Math.hypot(x, z);
  const flatBlend = THREE.MathUtils.smoothstep(distCenter, 2.2, 6.5);
  const hill =
    Math.sin(x * 0.19) * 0.28 +
    Math.cos(z * 0.21) * 0.26 +
    Math.max(0, -z - 3.5) * 0.055; // Ligera subida hacia Lote Norte
  return hill * flatBlend;
}

/**
 * Crea un letrero de madera de sendero cafetero
 */
function createSignpost(text, x, z, rotY = 0) {
  const group = new THREE.Group();
  const y = getTerrainHeight(x, z);
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  const postMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 10), postMat);
  post.position.y = 0.72;
  post.castShadow = true;
  group.add(post);

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a2e19';
  ctx.fillRect(0, 0, 384, 96);
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 372, 84);
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 192, 58);

  const boardTex = new THREE.CanvasTexture(canvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.2, 0.035),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 })
  );
  board.position.set(0, 1.28, 0.03);
  board.castShadow = true;
  group.add(board);

  return group;
}

/**
 * Entorno explorable 3D de Finca Cafetera Andina (36m × 36m) + Modo Passthrough MR.
 */
export class CoffeeEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.mapHalfExtent = 13.5;

    this.worldGroup = new THREE.Group();
    this.backdropGroup = new THREE.Group(); // Cielo, cordillera y suelo sólido (se atenúan en AR/MR)
    this.farmPropsGroup = new THREE.Group(); // Árboles de sombrío, beneficiadero, senderos y matas
    this.mrGridGroup = new THREE.Group(); // Grilla espacial visible en Passthrough AR / MR

    this.scene.add(this.worldGroup);
    this.worldGroup.add(this.backdropGroup);
    this.worldGroup.add(this.farmPropsGroup);
    this.worldGroup.add(this.mrGridGroup);

    // Alias de compatibilidad donde se insertan las estaciones de café
    this.portalGroup = this.farmPropsGroup;

    this.mrBlend = 0.45;
    this.mode = '3d'; // '3d' | 'webcam' | 'webxr-ar' | 'webxr-vr'

    this.climatePreset = 'balanced';
    this.baseTemp = 21.0;
    this.baseHumidity = 68.0;
    this.windStrength = 0.18;

    this.buildLights();
    this.buildSkyAndMountains();
    this.buildExplorableTerrain();
    this.buildBeneficiaderoAndProps();
    this.buildShadeTrees();
    this.buildMrPassthroughGrid();
    this.buildPollinatorsAndMist();
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f2e21, 1.15);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
    this.sunLight.position.set(8, 16, 7);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 42;
    const d = 15;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    this.fillLight.position.set(-6, 5, 8);
    this.scene.add(this.fillLight);
  }

  buildSkyAndMountains() {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 64;
    skyCanvas.height = 256;
    this.skyCtx = skyCanvas.getContext('2d');
    this.skyCanvas = skyCanvas;
    this.paintSkyGradient(0.85, 0.75);

    this.skyTex = new THREE.CanvasTexture(skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;

    const skyGeo = new THREE.SphereGeometry(48, 32, 22);
    this.skyMat = new THREE.MeshBasicMaterial({
      map: this.skyTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
    this.backdropGroup.add(this.skyDome);

    const mountainLayers = [
      { radius: 36, height: 11.0, color: 0x0f392b, y: -1.5, seed: 1.2 },
      { radius: 27, height: 7.2, color: 0x14532d, y: -1.2, seed: 2.7 },
      { radius: 20, height: 4.4, color: 0x166534, y: -0.9, seed: 4.1 }
    ];

    this.mountainMeshes = [];
    mountainLayers.forEach((layer) => {
      const geo = new THREE.CylinderGeometry(layer.radius, layer.radius * 1.08, layer.height, 56, 4, true);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > 0) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const ang = Math.atan2(z, x);
          const ridge =
            Math.sin(ang * 5 + layer.seed) * 0.28 +
            Math.cos(ang * 9 - layer.seed) * 0.16 +
            Math.sin(ang * 15) * 0.08;
          pos.setY(i, y + ridge * layer.height);
        }
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: layer.color,
        roughness: 0.92,
        side: THREE.BackSide,
        transparent: true,
        opacity: 1.0
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = layer.y;
      this.backdropGroup.add(mesh);
      this.mountainMeshes.push(mesh);
    });
  }

  buildExplorableTerrain() {
    const size = 38;
    const segs = 76;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const grassCol = new THREE.Color(0x1b4d2e);
    const lushCol = new THREE.Color(0x14532d);
    const trailCol = new THREE.Color(0x6b4f35);
    const patioCol = new THREE.Color(0x786552);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      // Senderos de tierra compactada hacia Norte, Este, Oeste y Beneficiadero
      const distNorthTrail = Math.abs(x + Math.sin(z * 0.35) * 0.9) + (z > 3.5 || z < -11 ? 5 : 0);
      const distEastTrail = Math.abs(z + 1.5 - Math.sin(x * 0.3) * 1.1) + (x < -1 || x > 10.5 ? 5 : 0);
      const distWestTrail = Math.abs(z + 0.5 + Math.cos(x * 0.35) * 1.2) + (x > 1 || x < -9.5 ? 5 : 0);
      const distPatio = Math.hypot(x - 2.3, z + 2.1);

      const minTrail = Math.min(distNorthTrail, distEastTrail, distWestTrail);

      if (distPatio < 2.3) {
        tmpCol.copy(patioCol);
      } else if (minTrail < 0.85) {
        const t = THREE.MathUtils.smoothstep(minTrail, 0.45, 0.85);
        tmpCol.copy(trailCol).lerp(grassCol, t);
      } else {
        const noise = (Math.sin(x * 0.8) + Math.cos(z * 0.8)) * 0.25 + 0.5;
        tmpCol.copy(grassCol).lerp(lushCol, noise);
      }

      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      transparent: true,
      opacity: 1.0
    });

    this.terrainMesh = new THREE.Mesh(geo, this.groundMat);
    this.terrainMesh.receiveShadow = true;
    this.backdropGroup.add(this.terrainMesh);
  }

  buildBeneficiaderoAndProps() {
    // Cobertizo artesanal del Beneficiadero en (2.6, z = -2.3)
    const bx = 2.6;
    const bz = -2.3;
    const by = getTerrainHeight(bx, bz);

    const shed = new THREE.Group();
    shed.position.set(bx, by, bz);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.84 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.65, metalness: 0.15 });
    const sackMat = new THREE.MeshStandardMaterial({ color: 0xc2a378, roughness: 0.9 });

    // 4 columnas de guadua/madera
    [
      [-1.7, -1.5],
      [1.7, -1.5],
      [-1.7, 1.5],
      [1.7, 1.5]
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.45, 10), woodMat);
      post.position.set(px, 1.22, pz);
      post.castShadow = true;
      shed.add(post);
    });

    // Techo inclinado de teja andina
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.08, 3.5), roofMat);
    roof.position.set(0, 2.48, 0);
    roof.rotation.z = -0.12;
    roof.castShadow = true;
    shed.add(roof);

    // Costales de fique apilados
    for (let s = 0; s < 3; s++) {
      const sackGeo = new THREE.SphereGeometry(0.32, 12, 10);
      sackGeo.scale(1.15, 0.62, 0.82);
      const sack = new THREE.Mesh(sackGeo, sackMat);
      sack.position.set(1.15, 0.2 + s * 0.32, -0.9 + (s % 2) * 0.12);
      sack.rotation.y = s * 0.4;
      sack.castShadow = true;
      shed.add(sack);
    }

    this.farmPropsGroup.add(shed);

    // Letreros orientadores en el cruce de caminos
    this.farmPropsGroup.add(createSignpost('↑ Lote Norte · Castillo', -0.9, -2.5, 0.15));
    this.farmPropsGroup.add(createSignpost('→ Terraza Este · Caturra', 3.4, -0.2, -0.45));
    this.farmPropsGroup.add(createSignpost('← Sombrío · Borbón/Geisha', -2.9, -0.3, 0.45));

    // Cerca perimetral rústica de madera para delimitar el mapa de 28m × 28m
    const fenceR = this.mapHalfExtent + 0.6;
    const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.95, 8);
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const fx = Math.cos(ang) * fenceR;
      const fz = Math.sin(ang) * fenceR;
      const fy = getTerrainHeight(fx, fz);
      const fp = new THREE.Mesh(postGeo, woodMat);
      fp.position.set(fx, fy + 0.45, fz);
      this.backdropGroup.add(fp);
    }
  }

  buildShadeTrees() {
    // Árboles de sombrío cafetero (Guamos y Plátanos) en los bordes de los lotes
    const treeCoords = [
      [-8.2, -5.8, 1.15],
      [-8.8, 0.8, 1.0],
      [-6.8, 6.2, 1.1],
      [-4.6, -8.8, 1.2],
      [3.8, -10.8, 1.1],
      [9.8, -6.4, 1.05],
      [10.8, 2.2, 1.15],
      [7.2, 6.5, 0.95]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.88 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.78 });

    treeCoords.forEach(([tx, tz, sc]) => {
      const ty = getTerrainHeight(tx, tz);
      const tree = new THREE.Group();
      tree.position.set(tx, ty, tz);
      tree.scale.setScalar(sc);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 2.9, 10), trunkMat);
      trunk.position.y = 1.45;
      trunk.castShadow = true;
      tree.add(trunk);

      // Copa aparasolada típica de árbol de sombrío (Inga / Guamo)
      for (let c = 0; c < 3; c++) {
        const crownGeo = new THREE.DodecahedronGeometry(1.15 - c * 0.18, 1);
        crownGeo.scale(1.45, 0.52, 1.35);
        const crown = new THREE.Mesh(crownGeo, canopyMat);
        crown.position.set((c - 1) * 0.45, 2.85 + c * 0.28, (c % 2) * 0.3);
        crown.castShadow = true;
        tree.add(crown);
      }

      this.backdropGroup.add(tree);
    });
  }

  buildMrPassthroughGrid() {
    // Grilla sutil sobre el suelo para orientación cuando el usuario está en Quest 3 Passthrough o Webcam MR
    const grid = new THREE.GridHelper(28, 28, 0x10b981, 0x38bdf8);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
    this.mrGridGroup.add(grid);
    this.mrGridGroup.visible = false;
  }

  buildPollinatorsAndMist() {
    this.butterflies = [];
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    });
    const wingGeo = new THREE.PlaneGeometry(0.045, 0.058);
    wingGeo.translate(0.022, 0, 0);

    const anchorCenters = [
      [-1.7, -1.6],
      [-2.8, -6.2],
      [1.1, -9.4],
      [6.4, -4.6],
      [8.6, -0.4],
      [-6.3, -3.4],
      [-5.1, 3.5],
      [1.9, -1.5]
    ];

    anchorCenters.forEach(([cx, cz], i) => {
      const bf = new THREE.Group();
      const leftW = new THREE.Mesh(wingGeo, wingMat);
      const rightW = new THREE.Mesh(wingGeo, wingMat);
      rightW.scale.x = -1;
      bf.add(leftW, rightW);
      bf.userData = {
        leftW,
        rightW,
        cx,
        cz,
        baseY: getTerrainHeight(cx, cz) + 0.95,
        seed: i * 1.37,
        radius: 0.65 + (i % 3) * 0.35
      };
      this.farmPropsGroup.add(bf);
      this.butterflies.push(bf);
    });

    // Partículas ambientales repartidas por toda la finca
    const pCount = 260;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 26;
      pPos[i * 3 + 1] = 0.2 + Math.random() * 3.2;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    this.ambientMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.032,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.ambientPoints = new THREE.Points(pGeo, this.ambientMat);
    this.farmPropsGroup.add(this.ambientPoints);
  }

  paintSkyGradient(healthNorm = 0.85, sunNorm = 0.75) {
    const ctx = this.skyCtx;
    const W = this.skyCanvas.width;
    const H = this.skyCanvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);

    if (healthNorm < 0.45) {
      g.addColorStop(0, '#1e293b');
      g.addColorStop(0.55, '#334155');
      g.addColorStop(1, '#475569');
    } else if (sunNorm < 0.38) {
      g.addColorStop(0, '#091526');
      g.addColorStop(0.55, '#16324f');
      g.addColorStop(1, '#1e4640');
    } else {
      g.addColorStop(0, '#072a40');
      g.addColorStop(0.48, '#0e5a6d');
      g.addColorStop(0.82, '#348c7e');
      g.addColorStop(1, '#a7f3d0');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (this.skyTex) this.skyTex.needsUpdate = true;
  }

  setRealityMode(mode, mrBlend = this.mrBlend) {
    this.mode = mode;
    this.mrBlend = mrBlend;

    if (mode === '3d' || mode === 'webxr-vr') {
      this.backdropGroup.visible = true;
      this.mrGridGroup.visible = false;
      this.skyMat.opacity = 1.0;
      this.groundMat.opacity = 1.0;
      this.mountainMeshes.forEach((m) => (m.material.opacity = 1.0));
    } else if (mode === 'webcam') {
      this.backdropGroup.visible = mrBlend > 0.06;
      this.mrGridGroup.visible = true;
      this.skyMat.opacity = mrBlend * 0.65;
      this.groundMat.opacity = Math.max(0.18, mrBlend * 0.78);
      this.mountainMeshes.forEach((m) => (m.material.opacity = mrBlend * 0.8));
    } else if (mode === 'webxr-ar' || mode === 'webxr') {
      // Quest 3 Passthrough Mixed Reality: fondo real 100% despejado + grilla espacial + matas 3D
      this.backdropGroup.visible = false;
      this.mrGridGroup.visible = true;
    }
  }

  setClimatePreset(preset) {
    this.climatePreset = preset;
    if (preset === 'humid') {
      this.baseTemp = 22.8;
      this.baseHumidity = 89.0;
      this.windStrength = 0.08;
    } else if (preset === 'hot') {
      this.baseTemp = 28.4;
      this.baseHumidity = 45.0;
      this.windStrength = 0.22;
    } else if (preset === 'cold_rain') {
      this.baseTemp = 16.2;
      this.baseHumidity = 94.0;
      this.windStrength = 0.34;
    } else {
      this.baseTemp = 21.0;
      this.baseHumidity = 68.0;
      this.windStrength = 0.18;
    }
  }

  update(dt, elapsed, { ecosystemHealth = 85, roomBrightness = 0.72, humanMotion = 0 } = {}) {
    const healthNorm = THREE.MathUtils.clamp(ecosystemHealth / 100, 0, 1);

    const sunTarget = (0.65 + roomBrightness * 1.45) * (0.65 + healthNorm * 0.45);
    this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, sunTarget, dt * 3);
    this.hemiLight.intensity = 0.75 + roomBrightness * 0.6;

    if (Math.floor(elapsed * 2) !== this._lastSkyTick) {
      this._lastSkyTick = Math.floor(elapsed * 2);
      this.paintSkyGradient(healthNorm, roomBrightness);
    }

    // Mariposas polinizadoras proporcionales a la salud del cafetal
    const activeCount = Math.round(THREE.MathUtils.clamp((healthNorm - 0.32) * 12, 0, this.butterflies.length));
    this.butterflies.forEach((bf, idx) => {
      bf.visible = idx < activeCount;
      if (!bf.visible) return;
      const d = bf.userData;
      const t = elapsed * 1.2 + d.seed;
      bf.position.set(
        d.cx + Math.cos(t) * d.radius,
        d.baseY + Math.sin(t * 2.2) * 0.18,
        d.cz + Math.sin(t * 0.9) * d.radius
      );
      bf.rotation.y = -t + Math.PI / 2;
      const flap = Math.sin(elapsed * 18 + d.seed) * 0.85;
      d.leftW.rotation.y = flap;
      d.rightW.rotation.y = -flap;
    });

    const attr = this.ambientPoints.geometry.attributes.position;
    const isRainy = this.climatePreset === 'cold_rain' || this.climatePreset === 'humid';
    this.ambientMat.color.setHex(isRainy ? 0x7dd3fc : 0xfef08a);

    const windX = (this.windStrength + humanMotion * 0.8) * 0.45;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) + windX * dt;
      let y = attr.getY(i) + (isRainy ? -1.2 : 0.14) * dt;
      if (y < 0.05) y = 3.2;
      if (y > 3.4) y = 0.15;
      if (x > 13) x = -13;
      attr.setXY(i, x, y);
    }
    attr.needsUpdate = true;
  }
}
