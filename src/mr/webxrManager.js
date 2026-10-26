import * as THREE from 'three';

/**
 * Gestor completo WebXR para Meta Quest 3 (Passthrough MR `immersive-ar` y
 * Cafetal Completo `immersive-vr`) y móviles ARCore:
 *  - Soporta locomoción suave con el stick izquierdo (Quest 3 Touch Plus)
 *  - Giro cómodo por pasos (snap-turn) y navegación IPS ▲/▼ con el stick derecho
 *  - Mano derecha sostiene el Monitor Cafecito 120×65×18 mm a escala real 1:1
 *  - Mano izquierda proyecta rayo láser 3D para pulsar botones del aparato + HUD de muñeca
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
    this.sessionMode = null; // 'immersive-ar' | 'immersive-vr'

    // Controladores espaciales dentro del playerRig
    this.controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    this.controllerHandedness = ['unknown', 'unknown'];

    this.rightController = this.controllers[0];
    this.leftController = this.controllers[1];

    this._snapCooldown = 0;
    this._navCooldown = 0;
    this._prevButtons = {
      rightA: false,
      rightB: false,
      rightGrip: false,
      leftTrigger: false,
      leftGrip: false
    };

    this.setupControllersVisuals();
    this.checkSupport();
  }

  setupControllersVisuals() {
    this.controllers.forEach((ctrl, idx) => {
      this.playerRig.add(ctrl);

      ctrl.addEventListener('connected', (event) => {
        const hand = event.data?.handedness || 'unknown';
        this.controllerHandedness[idx] = hand;
        this.reassignHands();
      });

      ctrl.addEventListener('selectstart', () => {
        if (ctrl === this.rightController) {
          if (this.callbacks.onTriggerDown) this.callbacks.onTriggerDown();
        } else if (ctrl === this.leftController) {
          if (this.callbacks.onLeftLaserClick) this.callbacks.onLeftLaserClick(this.leftController);
        }
      });

      ctrl.addEventListener('selectend', () => {
        if (ctrl === this.rightController) {
          if (this.callbacks.onTriggerUp) this.callbacks.onTriggerUp();
        }
      });
    });

    // Rayo láser cian para la mano auxiliar (izquierda en Quest 3)
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1.6)
    ]);
    const rayMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8
    });
    this.leftRayLine = new THREE.Line(rayGeo, rayMat);
    this.leftRayLine.visible = false;

    // HUD espacial de muñeca para Quest 3 (donde el HTML dom-overlay no siempre se proyecta)
    this.wristCanvas = document.createElement('canvas');
    this.wristCanvas.width = 384;
    this.wristCanvas.height = 176;
    this.wristCtx = this.wristCanvas.getContext('2d');
    this.wristTex = new THREE.CanvasTexture(this.wristCanvas);
    this.wristTex.colorSpace = THREE.SRGBColorSpace;

    const wristGeo = new THREE.PlaneGeometry(0.18, 0.082);
    const wristMat = new THREE.MeshBasicMaterial({
      map: this.wristTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.wristHudMesh = new THREE.Mesh(wristGeo, wristMat);
    this.wristHudMesh.position.set(0.03, 0.055, -0.04);
    this.wristHudMesh.rotation.x = -Math.PI / 3.2;
    this.wristHudMesh.visible = false;

    this.reassignHands();
  }

  reassignHands() {
    const rightIdx = this.controllerHandedness.indexOf('right');
    const leftIdx = this.controllerHandedness.indexOf('left');

    if (rightIdx !== -1) {
      this.rightController = this.controllers[rightIdx];
      this.leftController = this.controllers[rightIdx === 0 ? 1 : 0];
    } else if (leftIdx !== -1) {
      this.leftController = this.controllers[leftIdx];
      this.rightController = this.controllers[leftIdx === 0 ? 1 : 0];
    } else {
      this.rightController = this.controllers[0];
      this.leftController = this.controllers[1];
    }

    if (this.leftRayLine.parent) this.leftRayLine.parent.remove(this.leftRayLine);
    if (this.wristHudMesh.parent) this.wristHudMesh.parent.remove(this.wristHudMesh);
    this.leftController.add(this.leftRayLine);
    this.leftController.add(this.wristHudMesh);
  }

  async checkSupport() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      if (this.callbacks.onSupportChecked) {
        this.callbacks.onSupportChecked({ ar: false, vr: false });
      }
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

  /**
   * Inicia sesión en Quest 3 / Android AR.
   * Si se pide 'auto', prioriza `immersive-ar` (Passthrough MR en Quest 3) y cae a `immersive-vr`.
   */
  async startSession(preferredMode = 'auto') {
    if (!navigator.xr) {
      throw new Error('WebXR no está disponible en este navegador.');
    }

    await this.checkSupport();

    let modeToUse = preferredMode;
    if (preferredMode === 'auto') {
      modeToUse = this.arSupported
        ? 'immersive-ar'
        : this.vrSupported
          ? 'immersive-vr'
          : 'immersive-ar';
    }

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

    this.leftRayLine.visible = true;
    this.wristHudMesh.visible = true;

    session.addEventListener('end', () => {
      this.session = null;
      this.sessionMode = null;
      this.leftRayLine.visible = false;
      this.wristHudMesh.visible = false;
      this.renderer.xr.enabled = false;
      if (this.callbacks.onSessionEnded) this.callbacks.onSessionEnded();
    });

    if (this.callbacks.onSessionStarted) {
      this.callbacks.onSessionStarted(modeToUse, this.rightController, this.leftController);
    }
    return session;
  }

  async stopSession() {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }

  updateWristHud({ health = 82, wave = 1, score = 0, nearestText = 'Explora la finca' }) {
    if (!this.session) return;
    const ctx = this.wristCtx;
    const W = this.wristCanvas.width;
    const H = this.wristCanvas.height;

    ctx.fillStyle = 'rgba(6, 16, 26, 0.9)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, W - 8, H - 8, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.fillText(`QUEST 3 MR · RONDA #${wave}`, 18, 34);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`Cafetal: ${Math.round(health)}%  |  ${score} pts`, 18, 68);

    ctx.fillStyle = '#7dd3fc';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(nearestText.slice(0, 36), 18, 102);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText('Stick Izq: Caminar | Stick Der: Girar/Menú', 18, 134);
    ctx.fillText('Gatillo Der: Escanear | Botón A/Grip: Curar', 18, 156);

    this.wristTex.needsUpdate = true;
  }

  /**
   * Lee joysticks y botones de los mandos Touch Plus de Meta Quest 3 en cada frame.
   * Devuelve vector de locomoción { moveX, moveZ, snapTurnRad }.
   */
  pollControllers(dt) {
    const out = { moveX: 0, moveZ: 0, snapTurnRad: 0, rightTriggerHeld: false };
    if (!this.session) return out;

    this._snapCooldown = Math.max(0, this._snapCooldown - dt);
    this._navCooldown = Math.max(0, this._navCooldown - dt);

    for (const source of this.session.inputSources) {
      const gp = source.gamepad;
      if (!gp) continue;

      const axX = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const axY = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;

      if (source.handedness === 'left') {
        // Stick izquierdo: caminar libremente por el cafetal
        if (Math.abs(axX) > 0.14) out.moveX = axX;
        if (Math.abs(axY) > 0.14) out.moveZ = axY;

        // Grip izquierdo: ventilar matas
        const lGrip = Boolean(gp.buttons[1]?.pressed);
        if (lGrip && !this._prevButtons.leftGrip && this.callbacks.onVentilate) {
          this.callbacks.onVentilate();
        }
        this._prevButtons.leftGrip = lGrip;
      } else if (source.handedness === 'right' || source.handedness === 'none') {
        // Stick derecho horizontal: giro suave por pasos de 30° (confort VR/MR)
        if (Math.abs(axX) > 0.65 && this._snapCooldown <= 0) {
          out.snapTurnRad = axX > 0 ? -Math.PI / 6 : Math.PI / 6;
          this._snapCooldown = 0.32;
        }
        // Stick derecho vertical: navegar botones ▲ / ▼ del monitor
        if (Math.abs(axY) > 0.65 && this._navCooldown <= 0) {
          if (axY < 0 && this.callbacks.onNavUp) this.callbacks.onNavUp();
          if (axY > 0 && this.callbacks.onNavDown) this.callbacks.onNavDown();
          this._navCooldown = 0.28;
        }

        // Gatillo derecho mantenido: escáner óptico Ø8mm
        out.rightTriggerHeld = Boolean(gp.buttons[0]?.pressed);

        // Botón A (buttons[4]) o Grip derecho (buttons[1]): Seleccionar / Aplicar cura (●)
        const rAction = Boolean(gp.buttons[4]?.pressed || gp.buttons[1]?.pressed);
        if (rAction && !this._prevButtons.rightA && this.callbacks.onSelectAction) {
          this.callbacks.onSelectAction();
        }
        this._prevButtons.rightA = rAction;

        // Botón B (buttons[5]): girar monitor 180°
        const rB = Boolean(gp.buttons[5]?.pressed);
        if (rB && !this._prevButtons.rightB && this.callbacks.onFlipDevice) {
          this.callbacks.onFlipDevice();
        }
        this._prevButtons.rightB = rB;
      }
    }

    return out;
  }
}
