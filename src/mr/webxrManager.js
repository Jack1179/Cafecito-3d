/**
 * Gestor de sesiones nativas WebXR Mixed Reality (immersive-ar)
 * para visores Meta Quest Passthrough y móviles Android ARCore.
 */
export class WebXRManager {
  constructor(renderer, hudElement, callbacks = {}) {
    this.renderer = renderer;
    this.hudElement = hudElement;
    this.callbacks = callbacks;

    this.supported = false;
    this.session = null;
    this.controller = null;
    this.isSelectPressed = false;

    this.checkSupport();
  }

  async checkSupport() {
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      this.supported = false;
      if (this.callbacks.onSupportChecked) this.callbacks.onSupportChecked(false);
      return false;
    }
    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      this.supported = false;
    }
    if (this.callbacks.onSupportChecked) this.callbacks.onSupportChecked(this.supported);
    return this.supported;
  }

  async startARSession() {
    if (!navigator.xr) {
      throw new Error('WebXR no está disponible en este navegador.');
    }

    const sessionInit = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
      domOverlay: this.hudElement ? { root: this.hudElement } : undefined
    };

    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    this.session = session;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);

    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener('selectstart', () => {
      this.isSelectPressed = true;
      if (this.callbacks.onTriggerDown) this.callbacks.onTriggerDown();
    });
    this.controller.addEventListener('selectend', () => {
      this.isSelectPressed = false;
      if (this.callbacks.onTriggerUp) this.callbacks.onTriggerUp();
    });

    session.addEventListener('end', () => {
      this.session = null;
      this.isSelectPressed = false;
      this.renderer.xr.enabled = false;
      if (this.callbacks.onSessionEnded) this.callbacks.onSessionEnded();
    });

    if (this.callbacks.onSessionStarted) this.callbacks.onSessionStarted(this.controller);
    return session;
  }

  async stopARSession() {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
