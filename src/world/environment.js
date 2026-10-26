import * as THREE from 'three';

/**
 * Entorno generado reactivo del Cafetal Andino + Portal de Merged Reality.
 * Reacciona tanto a la salud fitosanitaria del cultivo como a la luz/movimiento
 * reales captados del humano en modo Merged Reality.
 */
export class CoffeeEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.worldGroup = new THREE.Group();
    this.backdropGroup = new THREE.Group(); // Se atenúa/oculta en AR o según slider de Fusión MR
    this.portalGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.worldGroup.add(this.backdropGroup);
    this.worldGroup.add(this.portalGroup);

    this.mrBlend = 0.45; // Nivel de fusión en modo cámara (0 = solo cámara, 1 = cafetal denso)
    this.mode = '3d'; // '3d' | 'webcam' | 'webxr'

    this.climatePreset = 'balanced'; // 'balanced' | 'humid' | 'hot' | 'cold_rain'
    this.baseTemp = 21.0;
    this.baseHumidity = 68.0;
    this.windStrength = 0.18;

    this.buildLights();
    this.buildSkyAndMountains();
    this.buildPortalTerrace();
    this.buildPollinatorsAndMist();
  }

  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f2e21, 1.15);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.sunLight.position.set(1.6, 2.8, 1.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 0.3;
    this.sunLight.shadow.camera.far = 8;
    const d = 1.6;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Luz frontal suave para el policarbonato blanco mate del monitor
    this.fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.72);
    this.fillLight.position.set(-1.1, 0.8, 1.8);
    this.scene.add(this.fillLight);
  }

  buildSkyAndMountains() {
    // Domo celeste degradado procedural
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 64;
    skyCanvas.height = 256;
    this.skyCtx = skyCanvas.getContext('2d');
    this.skyCanvas = skyCanvas;
    this.paintSkyGradient(0.85, 0.75);

    this.skyTex = new THREE.CanvasTexture(skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;

    const skyGeo = new THREE.SphereGeometry(14, 28, 20);
    this.skyMat = new THREE.MeshBasicMaterial({
      map: this.skyTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
    this.backdropGroup.add(this.skyDome);

    // Siluetas de montañas cafeteras andinas en capas
    const mountainLayers = [
      { radius: 7.5, height: 2.3, color: 0x0f392b, y: -1.1, seed: 1.2 },
      { radius: 5.2, height: 1.6, color: 0x14532d, y: -1.0, seed: 2.7 },
      { radius: 3.4, height: 1.0, color: 0x166534, y: -0.9, seed: 4.1 }
    ];

    this.mountainMeshes = [];
    mountainLayers.forEach((layer) => {
      const geo = new THREE.CylinderGeometry(layer.radius, layer.radius * 1.08, layer.height, 48, 4, true);
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

    // Terreno amplio verde esmeralda para modo 3D completo
    const groundGeo = new THREE.CircleGeometry(9, 48);
    groundGeo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x143824,
      roughness: 0.94,
      transparent: true,
      opacity: 1.0
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.position.y = -0.44;
    ground.receiveShadow = true;
    this.backdropGroup.add(ground);
  }

  buildPortalTerrace() {
    // Plataforma / terraza holográfica de Merged Reality donde reposan las matas y muestras
    const terraceGeo = new THREE.CylinderGeometry(1.06, 1.14, 0.05, 48);
    this.terraceMat = new THREE.MeshStandardMaterial({
      color: 0x29211b,
      roughness: 0.85,
      transparent: true,
      opacity: 0.88
    });
    this.terraceMesh = new THREE.Mesh(terraceGeo, this.terraceMat);
    this.terraceMesh.position.set(0, -0.39, -0.82);
    this.terraceMesh.receiveShadow = true;
    this.portalGroup.add(this.terraceMesh);

    // Anillo luminoso espacial de anclaje MR
    const ringGeo = new THREE.RingGeometry(1.05, 1.09, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.portalRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    this.portalRing = new THREE.Mesh(ringGeo, this.portalRingMat);
    this.portalRing.position.set(0, -0.362, -0.82);
    this.portalGroup.add(this.portalRing);

    // Grilla polar sutil de referencia espacial MR
    const gridHelper = new THREE.PolarGridHelper(1.04, 12, 5, 48, 0x38bdf8, 0x10b981);
    gridHelper.position.set(0, -0.363, -0.82);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.22;
    this.portalGrid = gridHelper;
    this.portalGroup.add(gridHelper);
  }

  buildPollinatorsAndMist() {
    // Mariposas polinizadoras andinas (aparecen cuando el cafetal está saludable)
    this.butterflies = [];
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const wingGeo = new THREE.PlaneGeometry(0.028, 0.036);
    wingGeo.translate(0.014, 0, 0);

    for (let i = 0; i < 6; i++) {
      const bf = new THREE.Group();
      const leftW = new THREE.Mesh(wingGeo, wingMat);
      const rightW = new THREE.Mesh(wingGeo, wingMat);
      rightW.scale.x = -1;
      bf.add(leftW, rightW);
      bf.userData = {
        leftW,
        rightW,
        seed: i * 1.37,
        radius: 0.35 + (i % 3) * 0.22,
        height: -0.05 + (i % 3) * 0.14
      };
      this.portalGroup.add(bf);
      this.butterflies.push(bf);
    }

    // Partículas ambientales (polen dorado sano vs llovizna/neblina húmeda)
    const pCount = 110;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 2.8;
      pPos[i * 3 + 1] = -0.3 + Math.random() * 1.6;
      pPos[i * 3 + 2] = -1.7 + Math.random() * 1.6;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    this.ambientMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.011,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.ambientPoints = new THREE.Points(pGeo, this.ambientMat);
    this.portalGroup.add(this.ambientPoints);
  }

  paintSkyGradient(healthNorm = 0.85, sunNorm = 0.75) {
    const ctx = this.skyCtx;
    const W = this.skyCanvas.width;
    const H = this.skyCanvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);

    if (healthNorm < 0.45) {
      // Cielo grisáceo opresivo por plaga alta
      g.addColorStop(0, '#1e293b');
      g.addColorStop(0.55, '#334155');
      g.addColorStop(1, '#475569');
    } else if (sunNorm < 0.38) {
      // Atardecer / penumbra húmeda de bosque de niebla
      g.addColorStop(0, '#091526');
      g.addColorStop(0.55, '#16324f');
      g.addColorStop(1, '#1e4640');
    } else {
      // Mañana luminosa de paisaje cultural cafetero
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

    if (mode === '3d') {
      this.backdropGroup.visible = true;
      this.skyMat.opacity = 1.0;
      this.groundMat.opacity = 1.0;
      this.mountainMeshes.forEach((m) => (m.material.opacity = 1.0));
      this.terraceMat.opacity = 0.96;
    } else if (mode === 'webcam') {
      // En Merged Reality, el usuario controla cuánta capa virtual se mezcla sobre su cámara real
      this.backdropGroup.visible = mrBlend > 0.08;
      this.skyMat.opacity = mrBlend * 0.65;
      this.groundMat.opacity = mrBlend * 0.55;
      this.mountainMeshes.forEach((m) => (m.material.opacity = mrBlend * 0.8));
      this.terraceMat.opacity = 0.35 + mrBlend * 0.5;
    } else if (mode === 'webxr') {
      this.backdropGroup.visible = false;
      this.terraceMat.opacity = 0.42;
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

    // Acoplamiento con luz real del cuarto (si hay webcam) y salud del cafetal
    const sunTarget = (0.65 + roomBrightness * 1.45) * (0.65 + healthNorm * 0.45);
    this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, sunTarget, dt * 3);
    this.hemiLight.intensity = 0.75 + roomBrightness * 0.6;

    // Actualizar cielo cada ~0.5 s de forma económica
    if (Math.floor(elapsed * 2) !== this._lastSkyTick) {
      this._lastSkyTick = Math.floor(elapsed * 2);
      this.paintSkyGradient(healthNorm, roomBrightness);
    }

    // Color del anillo portal MR refleja salud del ecosistema
    if (healthNorm > 0.75) this.portalRingMat.color.setHex(0x10b981);
    else if (healthNorm > 0.48) this.portalRingMat.color.setHex(0xf59e0b);
    else this.portalRingMat.color.setHex(0xef4444);

    // Mariposas polinizadoras: activas cuando el cafetal supera 55% de salud
    const activeButterflies = Math.round(THREE.MathUtils.clamp((healthNorm - 0.35) * 9, 0, 6));
    this.butterflies.forEach((bf, idx) => {
      bf.visible = idx < activeButterflies;
      if (!bf.visible) return;
      const d = bf.userData;
      const t = elapsed * 1.15 + d.seed;
      bf.position.set(
        Math.cos(t) * d.radius * 1.3,
        d.height + Math.sin(t * 2.3) * 0.09,
        -0.82 + Math.sin(t * 0.9) * d.radius * 0.75
      );
      bf.rotation.y = -t + Math.PI / 2;
      const flap = Math.sin(elapsed * 18 + d.seed) * 0.85;
      d.leftW.rotation.y = flap;
      d.rightW.rotation.y = -flap;
    });

    // Partículas ambientales: lluvia/neblina si humedad alta, polen dorado si equilibrado
    const attr = this.ambientPoints.geometry.attributes.position;
    const isRainy = this.climatePreset === 'cold_rain' || this.climatePreset === 'humid';
    this.ambientMat.color.setHex(isRainy ? 0x7dd3fc : 0xfef08a);

    const windX = (this.windStrength + humanMotion * 0.8) * 0.35;
    for (let i = 0; i < attr.count; i++) {
      let x = attr.getX(i) + windX * dt;
      let y = attr.getY(i) + (isRainy ? -0.65 : 0.11) * dt;
      if (y < -0.36) y = 1.25;
      if (y > 1.3) y = -0.32;
      if (x > 1.4) x = -1.4;
      attr.setXY(i, x, y);
    }
    attr.needsUpdate = true;
  }
}
