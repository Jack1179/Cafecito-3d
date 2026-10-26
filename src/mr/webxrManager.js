import * as THREE from 'three';

/**
 * Gestor WebXR diseñado ergonómicamente para Meta Quest 3 (Touch Plus) y Android AR:
 *  - Mano Izquierda sostiene el 📱 Monitor Ambiental Cafecito (120×65×18 mm):
 *      • Botones X / Y: Cambiar libremente entre los 4 menús IPS (1.ESCÁNER, 2.CLIMA, 3.UV·IR, 4.FICHA)
 *      • Gatillo Izquierdo: Escanear (congruente: requiere estar en el menú 1.ESCÁNER)
 *      • Grip Izquierdo: Voltear monitor 180° para ver lente Ø8mm y rejilla Ø12mm
 *  - Mano Derecha sostiene la 🧰 Herramienta Física (🧴 Spray Medicina / ✂️ Tijeras de Podar / 🏷️ Sello):
 *      • Botones A / B: Cambiar entre Spray (3 fórmulas), Tijeras de Podar y Sello Sano
 *      • Gatillo Derecho: Accionar el Spray o cortar con las Tijeras de Podar
 *      • Grip Derecho: Ventilar la mata
 *  - Sticks: Stick Izquierdo camina 360°; Stick Derecho (solo horizontal) gira 30° sin alterar menús.
 */
export class WebXRManager {
  constructor(renderer, playerRig, hudElement, callbacks = {}) {
    this.renderer = renderer;
    this.playerRig = playerRig;
    this.hudElement = hudElement;
    this.callbacks = callbacks;

    this.arSupported = false;
    this.vrSupported = false;
    this.session = null;
    this.sessionMode = null;

    this.controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    this.controllerHandedness = ['unknown', 'unknown'];

    this.leftController = this.controllers[0];
    this.rightController = this.controllers[1];

    this._snapCooldown = 0;
    this._prevBtn = {
      leftX: false,
      leftY: false,
      leftGrip: false,
      rightTrigger: false,
      rightA: false,
      rightB: false,
      rightGrip: false
    };

    this.setupControllers();
    this.checkSupport();
  }

  setupControllers() {
    this.controllers.forEach((ctrl, idx) => {
      this.playerRig.add(ctrl);

      ctrl.addEventListener('connected', (event) => {
        const hand = event.data?.handedness || 'unknown';
        this.controllerHandedness[idx] = hand;
        this.reassignHands();
        if (this.callbacks.onHandsUpdated) {
          this.callbacks.onHandsUpdated(this.leftController, this.rightController);
        }
      });

      // Respaldo para Android AR táctil (transient-pointer sin botones físicos)
      ctrl.addEventListener('selectstart', (ev) => {
        if (ev.data?.targetRayMode === 'screen') {
          if (this.callbacks.onScreenArTap) this.callbacks.onScreenArTap();
        }
      });
    });

    // Etiqueta guía bajo el Monitor en la mano izquierda de Quest 3
    this.leftHintSprite = this.createHelperTag(
      '📱 MONITOR · X/Y: Cambiar Menú IPS',
      'Gatillo Izq: Escanear (en 1.ESCÁNER) · Grip: Reverso'
    );
    this.leftHintSprite.position.set(0, -0.095, -0.05);
    this.leftHintSprite.visible = false;

    // HUD compacto de estado de partida en la muñeca izquierda
    this.wristCanvas = document.createElement('canvas');
    this.wristCanvas.width = 384;
    this.wristCanvas.height = 128;
    this.wristCtx = this.wristCanvas.getContext('2d');
    this.wristTex = new THREE.CanvasTexture(this.wristCanvas);
    this.wristTex.colorSpace = THREE.SRGBColorSpace;

    const wristGeo = new THREE.PlaneGeometry(0.15, 0.05);
    const wristMat = new THREE.MeshBasicMaterial({
      map: this.wristTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.wristHudMesh = new THREE.Mesh(wristGeo, wristMat);
    this.wristHudMesh.position.set(0, 0.095, -0.03);
    this.wristHudMesh.rotation.x = -0.35;
    this.wristHudMesh.visible = false;

    this.reassignHands();
  }

  createHelperTag(line1, line2) {
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 16, 26, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, 432, 88, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(line1, 220, 38);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillText(line2, 220, 70);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );
    sp.scale.set(0.185, 0.04, 1);
    return sp;
  }

  reassignHands() {
    const leftIdx = this.controllerHandedness.indexOf('left');
    const rightIdx = this.controllerHandedness.indexOf('right');

    if (leftIdx !== -1 && rightIdx !== -1) {
      this.leftController = this.controllers[leftIdx];
      this.rightController = this.controllers[rightIdx];
    } else if (rightIdx !== -1) {
      this.rightController = this.controllers[rightIdx];
      this.leftController = this.controllers[rightIdx === 0 ? 1 : 0];
    } else if (leftIdx !== -1) {
      this.leftController = this.controllers[leftIdx];
      this.rightController = this.controllers[leftIdx === 0 ? 1 : 0];
    } else {
      this.leftController = this.controllers[0];
      this.rightController = this.controllers[1];
    }

    if (this.leftHintSprite.parent) this.leftHintSprite.parent.remove(this.leftHintSprite);
    if (this.wristHudMesh.parent) this.wristHudMesh.parent.remove(this.wristHudMesh);
    this.leftController.add(this.leftHintSprite);
    this.leftController.add(this.wristHudMesh);
  }

  async checkSupport() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      if (this.callbacks.onSupportChecked) this.callbacks.onSupportChecked({ ar: false, vr: false });
      return { ar: false, vr: false };
    }
    try {
      this.arSupported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      this.arSupported = false;
    }
    try {
      this.vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      this.vrSupported = false;
    }
    if (this.callbacks.onSupportChecked) {
      this.callbacks.onSupportChecked({ ar: this.arSupported, vr: this.vrSupported });
    }
    return { ar: this.arSupported, vr: this.vrSupported };
  }

  async startSession(preferredMode = 'immersive-ar') {
    if (!navigator.xr) {
      throw new Error('WebXR no está disponible en este navegador.');
    }

    await this.checkSupport();
    const modeToUse = preferredMode === 'immersive-vr' ? 'immersive-vr' : 'immersive-ar';

    const sessionInit = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    };
    if (modeToUse === 'immersive-ar' && this.hudElement) {
      sessionInit.optionalFeatures.push('dom-overlay');
      sessionInit.domOverlay = { root: this.hudElement };
    }

    const session = await navigator.xr.requestSession(modeToUse, sessionInit);
    this.session = session;
    this.sessionMode = modeToUse;

    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);

    this.leftHintSprite.visible = true;
    this.wristHudMesh.visible = true;

    session.addEventListener('end', () => {
      this.session = null;
      this.sessionMode = null;
      this.leftHintSprite.visible = false;
      this.wristHudMesh.visible = false;
      this.renderer.xr.enabled = false;
      if (this.callbacks.onSessionEnded) this.callbacks.onSessionEnded();
    });

    if (this.callbacks.onSessionStarted) {
      this.callbacks.onSessionStarted(modeToUse, this.leftController, this.rightController);
    }
    return session;
  }

  async stopSession() {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }

  pulseHaptic(handedness, intensity = 0.5, durationMs = 45) {
    if (!this.session) return;
    for (const src of this.session.inputSources) {
      if (src.handedness === handedness && src.gamepad?.hapticActuators?.[0]) {
        src.gamepad.hapticActuators[0].pulse(intensity, durationMs).catch(() => {});
      }
    }
  }

  updateWristHud({ health = 82, wave = 1, sickCount = 0, score = 0 }) {
    if (!this.session) return;
    const ctx = this.wristCtx;
    const W = this.wristCanvas.width;
    const H = this.wristCanvas.height;

    ctx.fillStyle = 'rgba(6, 16, 26, 0.9)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, W - 8, H - 8, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 21px ui-monospace, monospace';
    ctx.fillText(`RONDA #${wave} · BROTES: ${sickCount}`, 18, 44);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`Salud Cafetal: ${Math.round(health)}% · ${score} pts`, 18, 92);

    this.wristTex.needsUpdate = true;
  }

  /**
   * Lee los mandos Touch Plus de Quest 3 sin mezclar movimiento con menús.
   */
  pollControllers(dt) {
    const out = {
      moveX: 0,
      moveZ: 0,
      snapTurnRad: 0,
      leftScanTriggerHeld: false,
      leftScanTriggerJustPressed: false
    };
    if (!this.session) return out;

    this._snapCooldown = Math.max(0, this._snapCooldown - dt);

    for (const source of this.session.inputSources) {
      const gp = source.gamepad;
      if (!gp) continue;

      const axX = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const axY = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;

      if (source.handedness === 'left') {
        // 1. Stick Izquierdo: caminar en 360°
        if (Math.abs(axX) > 0.16) out.moveX = axX;
        if (Math.abs(axY) > 0.16) out.moveZ = axY;

        // 2. Gatillo Izquierdo: escanear con el Monitor (sujeto a estar en 1.ESCÁNER)
        const lTrig = Boolean(gp.buttons[0]?.pressed);
        if (lTrig && !this._prevLowLeftTrig) {
          out.leftScanTriggerJustPressed = true;
        }
        this._prevLowLeftTrig = lTrig;
        out.leftScanTriggerHeld = lTrig;

        // 3. Botón X (buttons[4]) = Menú Siguiente (▼) | Botón Y (buttons[5]) = Menú Anterior (▲)
        const btnX = Boolean(gp.buttons[4]?.pressed);
        if (btnX && !this._prevBtn.leftX) {
          this.pulseHaptic('left', 0.4, 30);
          if (this.callbacks.onMonitorMenuNext) this.callbacks.onMonitorMenuNext();
        }
        this._prevBtn.leftX = btnX;

        const btnY = Boolean(gp.buttons[5]?.pressed);
        if (btnY && !this._prevBtn.leftY) {
          this.pulseHaptic('left', 0.4, 30);
          if (this.callbacks.onMonitorMenuPrev) this.callbacks.onMonitorMenuPrev();
        }
        this._prevBtn.leftY = btnY;

        // 4. Grip Izquierdo (buttons[1]): girar el monitor 180°
        const lGrip = Boolean(gp.buttons[1]?.pressed);
        if (lGrip && !this._prevBtn.leftGrip) {
          this.pulseHaptic('left', 0.35, 35);
          if (this.callbacks.onFlipMonitor) this.callbacks.onFlipMonitor();
        }
        this._prevBtn.leftGrip = lGrip;
      } else if (source.handedness === 'right' || source.handedness === 'none') {
        // 1. Stick Derecho Horizontal ÚNICAMENTE: Snap-Turn de 30° (sin tocar menús con eje Y)
        if (Math.abs(axX) > 0.68 && this._snapCooldown <= 0) {
          out.snapTurnRad = axX > 0 ? -Math.PI / 6 : Math.PI / 6;
          this._snapCooldown = 0.32;
        }

        // 2. Gatillo Derecho (buttons[0]): Usar la Herramienta Física (Spray / Tijeras / Sello)
        const rTrig = Boolean(gp.buttons[0]?.pressed);
        if (rTrig && !this._prevBtn.rightTrigger) {
          this.pulseHaptic('right', 0.75, 70);
          if (this.callbacks.onUseActiveTool) this.callbacks.onUseActiveTool();
        }
        this._prevBtn.rightTrigger = rTrig;

        // 3. Botón A (buttons[4]) = Siguiente Herramienta | Botón B (buttons[5]) = Herramienta Anterior
        const btnA = Boolean(gp.buttons[4]?.pressed);
        if (btnA && !this._prevBtn.rightA) {
          this.pulseHaptic('right', 0.45, 35);
          if (this.callbacks.onNextTool) this.callbacks.onNextTool();
        }
        this._prevBtn.rightA = btnA;

        const btnB = Boolean(gp.buttons[5]?.pressed);
        if (btnB && !this._prevBtn.rightB) {
          this.pulseHaptic('right', 0.45, 35);
          if (this.callbacks.onPrevTool) this.callbacks.onPrevTool();
        }
        this._prevBtn.rightB = btnB;

        // 4. Grip Derecho (buttons[1]): Ventilar la mata
        const rGrip = Boolean(gp.buttons[1]?.pressed);
        if (rGrip && !this._prevBtn.rightGrip) {
          this.pulseHaptic('right', 0.4, 45);
          if (this.callbacks.onVentilate) this.callbacks.onVentilate();
        }
        this._prevBtn.rightGrip = rGrip;
      }
    }

    return out;
  }
}
