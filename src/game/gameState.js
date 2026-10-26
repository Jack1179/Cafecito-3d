import { DISEASES, TREATMENTS } from './diseases.js';

/**
 * Director de juego y simulación fitosanitaria del cafetal.
 * Gestiona rondas de cosecha, propagación de patógenos, puntajes,
 * modo Laboratorio Libre y telemetría reactiva del sensor Ø12mm.
 */
export class GameDirector {
  constructor(stations, callbacks = {}) {
    this.stations = stations;
    this.callbacks = callbacks;

    this.playMode = 'campaign'; // 'campaign' | 'sandbox'
    this.wave = 1;
    this.score = 0;
    this.streak = 0;
    this.harvestSavedKg = 12.5;
    this.ecosystemHealth = 78;

    this.spreadTimer = 0;
    this.waveCompleted = false;
  }

  startWave(waveNum = 1) {
    this.wave = waveNum;
    this.waveCompleted = false;
    this.spreadTimer = 0;

    // Seleccionar patologías válidas repartidas por las 10 estaciones del mapa
    const total = this.stations.length;
    const sickCount = Math.min(total - 2, 4 + waveNum);
    const indices = this.stations.map((s) => s.index).sort(() => Math.random() - 0.5);
    const sickSet = new Set(indices.slice(0, sickCount));

    this.stations.forEach((st) => {
      st.verifiedHealthy = false;
      if (sickSet.has(st.index)) {
        const candidates = Object.values(DISEASES).filter(
          (d) => d.id !== 'healthy' && d.targetsAllowed.includes(st.kind)
        );
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        st.setDisease(chosen.id, true);
      } else {
        st.setDisease('healthy', true);
      }
    });

    this.recomputeEcosystemHealth();
    if (this.callbacks.onLog) {
      this.callbacks.onLog(
        `Ronda #${this.wave}: camina por la finca (WASD / Joystick / Quest 3) y erradica los ${sickCount} brotes de café enfermo.`,
        'info'
      );
    }
  }

  setPlayMode(mode) {
    this.playMode = mode;
    if (mode === 'campaign') {
      this.startWave(this.wave);
    } else if (this.callbacks.onLog) {
      this.callbacks.onLog(
        'Modo Laboratorio Libre activo: prueba patologías, clima y sensores sin límite de tiempo.',
        'info'
      );
    }
  }

  recomputeEcosystemHealth() {
    let sum = 0;
    this.stations.forEach((st) => {
      sum += st.diseaseId === 'healthy' ? 98 : st.health;
    });
    this.ecosystemHealth = sum / this.stations.length;
    return this.ecosystemHealth;
  }

  completeStationScan(station) {
    if (!station || station.scanned) return false;
    station.scanned = true;
    station.refreshBadge(true);

    const dis = DISEASES[station.diseaseId];
    this.score += 40;

    if (this.callbacks.onDiagnosis) {
      this.callbacks.onDiagnosis(station, dis);
    }
    return true;
  }

  applyTreatment(station, treatmentIndex) {
    const treatment = TREATMENTS[treatmentIndex];
    if (!station || !treatment) {
      return { ok: false, reason: 'Apunta primero el monitor a una mata o lote de café.' };
    }

    const dis = DISEASES[station.diseaseId];

    // Si aún no ha sido escaneada, advertir pero permitir diagnóstico guiado
    if (!station.scanned) {
      return {
        ok: false,
        reason: 'Escanea primero con el lente Ø8mm (Botón Lateral) antes de tratar.'
      };
    }

    if (treatment.cures === station.diseaseId) {
      this.streak += 1;
      const bonus = 120 + this.streak * 25;
      this.score += bonus;

      if (station.diseaseId === 'healthy') {
        station.verifiedHealthy = true;
        this.harvestSavedKg += 4.5;
        this.recomputeEcosystemHealth();
        this.checkWaveVictory();
        return {
          ok: true,
          cured: false,
          certified: true,
          treatment,
          message: `¡${station.name} certificada como Café Especial Sano! (+${bonus} pts)`
        };
      } else {
        const oldDiseaseName = dis.name;
        station.setDisease('healthy', false);
        station.scanned = true;
        station.verifiedHealthy = true;
        station.refreshBadge(true);
        this.harvestSavedKg += 8.0;
        this.recomputeEcosystemHealth();
        this.checkWaveVictory();
        return {
          ok: true,
          cured: true,
          certified: true,
          treatment,
          message: `¡${oldDiseaseName} erradicada con ${treatment.shortLabel}! (+${bonus} pts)`
        };
      }
    } else {
      // Tratamiento incorrecto
      this.streak = 0;
      station.health = Math.max(18, station.health - 10);
      this.recomputeEcosystemHealth();
      const needed = TREATMENTS.find((t) => t.id === dis.requiredTreatment);
      return {
        ok: false,
        wrongProtocol: true,
        treatment,
        reason: `Protocolo incorrecto para ${dis.shortName}. Usa: ${needed ? needed.shortLabel : dis.recommendation}`
      };
    }
  }

  getSickCount() {
    return this.stations.filter((st) => st.diseaseId !== 'healthy').length;
  }

  checkWaveVictory() {
    if (this.playMode !== 'campaign' || this.waveCompleted) return;
    const allCured = this.stations.every((st) => st.diseaseId === 'healthy');
    if (allCured) {
      this.waveCompleted = true;
      this.score += 350;
      this.harvestSavedKg += 18;
      if (this.callbacks.onWaveComplete) {
        this.callbacks.onWaveComplete(this.wave, this.score, this.harvestSavedKg);
      }
    }
  }

  /**
   * Calcula lecturas en vivo de la rejilla trasera Ø12 mm combinando:
   * - Clima ambiental base
   * - Luz y movimiento real del cuarto (Merged Reality)
   * - Microclima local de la mata/grano enfocado según distancia al caminar
   */
  computeLiveSensorReadings({
    envBaseTemp = 21.0,
    envBaseHumidity = 68.0,
    roomBrightness = 0.72,
    humanMotion = 0,
    targetStation = null,
    distanceCm = 120,
    elapsed = 0
  }) {
    // Influencia humana/ambiental: más luz sube ligeramente T y baja HR; brisa humana ventila HR
    let temp = envBaseTemp + (roomBrightness - 0.65) * 3.4 - humanMotion * 0.9;
    let hum = envBaseHumidity - (roomBrightness - 0.65) * 11.0 - humanMotion * 8.5;
    let voc = 28;

    if (targetStation) {
      const dis = DISEASES[targetStation.diseaseId];
      const proxWeight = Math.max(0, Math.min(1, 1 - (distanceCm - 45) / 280));
      const targetTemp = (dis.tempRange[0] + dis.tempRange[1]) * 0.5;
      const targetHum = (dis.humidityRange[0] + dis.humidityRange[1]) * 0.5;
      const targetVoc = (dis.vocRange[0] + dis.vocRange[1]) * 0.5;

      temp = temp * (1 - proxWeight) + targetTemp * proxWeight;
      hum = hum * (1 - proxWeight) + targetHum * proxWeight;
      voc = voc * (1 - proxWeight) + targetVoc * proxWeight;
    }

    // Micro-oscilación realista de sensor digital SHT4x
    temp += Math.sin(elapsed * 2.7) * 0.08;
    hum = Math.max(25, Math.min(99, hum + Math.cos(elapsed * 2.1) * 0.4));
    voc = Math.max(10, voc + Math.sin(elapsed * 3.5) * 3);

    return { liveTemp: temp, liveHumidity: hum, liveVoc: voc };
  }

  update(dt) {
    if (this.playMode !== 'campaign' || this.waveCompleted) return;

    const sickStations = this.stations.filter((s) => s.diseaseId !== 'healthy');
    if (sickStations.length === 0) return;

    // Degradación lenta y propagación de esporas si no se atienden las plantas enfermas
    sickStations.forEach((st) => {
      st.health = Math.max(15, st.health - dt * 0.45);
    });

    this.spreadTimer += dt;
    if (this.spreadTimer > 34) {
      this.spreadTimer = 0;
      const healthyTargets = this.stations.filter((s) => s.diseaseId === 'healthy');
      if (healthyTargets.length > 0) {
        const victim = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
        const validContagion = sickStations
          .map((s) => DISEASES[s.diseaseId])
          .filter((d) => d.targetsAllowed.includes(victim.kind));

        if (validContagion.length > 0) {
          const pathogen = validContagion[0];
          victim.setDisease(pathogen.id, true);
          victim.verifiedHealthy = false;
          if (this.callbacks.onLog) {
            this.callbacks.onLog(
              `¡Alerta fitosanitaria! Esporas de ${pathogen.name} se propagaron hacia ${victim.name}.`,
              'warn'
            );
          }
        }
      }
    }

    this.recomputeEcosystemHealth();
  }
}
