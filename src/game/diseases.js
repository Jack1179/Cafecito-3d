/**
 * Catálogo agronómico de patologías del café (mata y grano/cereza),
 * protocolos de tratamiento y estaciones distribuidas por el mapa explorable.
 */

export const DISEASES = {
  healthy: {
    id: 'healthy',
    name: 'Cafeto / Café Sano',
    shortName: 'SANO · ÓPTIMO',
    scientific: 'Coffea arabica — Vigor Fitosanitario Alto',
    code: 'OK-00',
    severity: 'none',
    accentColor: '#10b981',
    uvColor: '#00f5a0',
    lesionColor: null,
    haloColor: null,
    tempRange: [19.5, 22.2],
    humidityRange: [64, 72],
    vocRange: [18, 42],
    grainMoisture: 11.2,
    requiredTreatment: 'verify_healthy',
    targetsAllowed: ['plant', 'cherries', 'beans'],
    symptoms: 'Hojas verde esmeralda brillante, cerezas firmes sin perforaciones y humedad equilibrada.',
    recommendation: 'Certificar estado saludable. Evitar agroquímicos innecesarios para proteger polinizadores.'
  },
  roya: {
    id: 'roya',
    name: 'Roya del Cafeto',
    shortName: 'ROYA DETECTADA',
    scientific: 'Hemileia vastatrix (Hongo Uredinal)',
    code: 'PAT-RY1',
    severity: 'high',
    accentColor: '#f97316',
    uvColor: '#ff9f1c',
    lesionColor: '#ea580c',
    haloColor: '#facc15',
    tempRange: [22.8, 25.1],
    humidityRange: [84, 94],
    vocRange: [260, 410],
    grainMoisture: 15.4,
    requiredTreatment: 'bio_fungicide',
    targetsAllowed: ['plant'],
    symptoms: 'Pústulas polvorientas amarillo-naranja en el envés de las hojas y defoliación progresiva.',
    recommendation: 'Aplicar Bio-Fungicida Cúprico / Trichoderma y mejorar ventilación del follaje.'
  },
  broca: {
    id: 'broca',
    name: 'Broca del Café',
    shortName: 'BROCA EN GRANO',
    scientific: 'Hypothenemus hampei (Coleóptero)',
    code: 'PAT-BR2',
    severity: 'critical',
    accentColor: '#ef4444',
    uvColor: '#ff2a6d',
    lesionColor: '#1c1917',
    haloColor: '#dc2626',
    tempRange: [24.8, 27.6],
    humidityRange: [58, 70],
    vocRange: [310, 480],
    grainMoisture: 13.8,
    requiredTreatment: 'beauveria_rere',
    targetsAllowed: ['plant', 'cherries', 'beans'],
    symptoms: 'Perforación circular Ø 1 mm en el ombligo/corona de la cereza y galerías internas en la almendra.',
    recommendation: 'Aplicar hongo entomopatógeno Beauveria bassiana + Recolección Sanitaria (Re-Re).'
  },
  cercospora: {
    id: 'cercospora',
    name: 'Mancha de Hierro + Déficit NPK',
    shortName: 'MANCHA HIERRO',
    scientific: 'Cercospora coffeicola + Estrés Nutricional',
    code: 'PAT-MH3',
    severity: 'medium',
    accentColor: '#eab308',
    uvColor: '#fde047',
    lesionColor: '#713f12',
    haloColor: '#fde047',
    tempRange: [27.0, 30.2],
    humidityRange: [40, 52],
    vocRange: [190, 290],
    grainMoisture: 9.4,
    requiredTreatment: 'foliar_npk',
    targetsAllowed: ['plant', 'cherries'],
    symptoms: 'Lesiones necróticas pardas con halo clorótico amarillo por alta radiación y falta de nitrógeno/potasio.',
    recommendation: 'Aplicar Nutrición Foliar NPK Orgánica y activar regulación de sombrío húmedo.'
  },
  antracnosis: {
    id: 'antracnosis',
    name: 'Antracnosis / Moho Húmedo',
    shortName: 'ANTRACNOSIS / HR+',
    scientific: 'Colletotrichum kahawae / Exceso Hídrico',
    code: 'PAT-AN4',
    severity: 'high',
    accentColor: '#a855f7',
    uvColor: '#c084fc',
    lesionColor: '#27272a',
    haloColor: '#9333ea',
    tempRange: [15.4, 18.2],
    humidityRange: [90, 98],
    vocRange: [340, 520],
    grainMoisture: 18.6,
    requiredTreatment: 'pruning_solar',
    targetsAllowed: ['plant', 'cherries', 'beans'],
    symptoms: 'Manchas negras hundidas en cerezas/ramas y humedad crítica (>18% en grano pergamino).',
    recommendation: 'Ejecutar Poda Fitosanitaria + Aireación y Secado Solar Controlado.'
  }
};

export const TREATMENTS = [
  {
    id: 'verify_healthy',
    shortLabel: 'CERTIFICAR SANO',
    name: 'Certificar Lote Sano',
    icon: '✓',
    color: '#10b981',
    particleColor: 0x34d399,
    cures: 'healthy',
    description: 'Registra mata o grano saludable como Café Especial de Origen sin químicos.'
  },
  {
    id: 'bio_fungicide',
    shortLabel: 'BIO-FUNGICIDA',
    name: 'Bio-Fungicida + Trichoderma',
    icon: '✦',
    color: '#38bdf8',
    particleColor: 0x38bdf8,
    cures: 'roya',
    description: 'Nebulización biológica contra esporas de Roya (Hemileia vastatrix).'
  },
  {
    id: 'beauveria_rere',
    shortLabel: 'BEAUVERIA + RE-RE',
    name: 'Beauveria bassiana + Re-Re',
    icon: '❖',
    color: '#f43f5e',
    particleColor: 0xfda4af,
    cures: 'broca',
    description: 'Control biológico y recolección sanitaria de frutos perforados por Broca.'
  },
  {
    id: 'foliar_npk',
    shortLabel: 'NUTRICIÓN NPK',
    name: 'Nutrición Foliar NPK + Sombrío',
    icon: '◈',
    color: '#facc15',
    particleColor: 0xfde047,
    cures: 'cercospora',
    description: 'Restaura clorofila, potasio y equilibrio hídrico frente a Mancha de Hierro.'
  },
  {
    id: 'pruning_solar',
    shortLabel: 'PODA Y SECADO',
    name: 'Poda Sanitaria & Secado Solar',
    icon: '☀',
    color: '#c084fc',
    particleColor: 0xe879f9,
    cures: 'antracnosis',
    description: 'Elimina tejido necrótico y reduce exceso de humedad en rama o grano pergamino.'
  }
];

/**
 * 10 estaciones cafeteras repartidas en las 4 zonas de la finca explorable (34m × 34m):
 * - Beneficiadero Central (muestras de cereza y pergamino en mesas de madera)
 * - Sendero Norte (Lote Variedad Castillo)
 * - Terraza Este (Lote Variedad Caturra al sol)
 * - Bosque Oeste (Sombrío de Borbón Rosado y Geisha)
 */
export const STATIONS_CONFIG = [
  {
    index: 0,
    id: 'mata-castillo-1',
    name: 'Mata #1 · Castillo Entrada',
    zone: 'Sendero Central',
    kind: 'plant',
    mapPos: [-1.7, -1.6],
    scale: 2.15
  },
  {
    index: 1,
    id: 'canasto-patio',
    name: 'Canasto #1 · Cerezas Patio',
    zone: 'Beneficiadero',
    kind: 'cherries',
    onTable: true,
    mapPos: [1.9, -1.5],
    scale: 1.55
  },
  {
    index: 2,
    id: 'zaranda-solar',
    name: 'Zaranda #1 · Pergamino Sol',
    zone: 'Beneficiadero',
    kind: 'beans',
    onTable: true,
    mapPos: [3.4, -3.1],
    scale: 1.55
  },
  {
    index: 3,
    id: 'mata-castillo-2',
    name: 'Mata #2 · Castillo Norte',
    zone: 'Lote Norte',
    kind: 'plant',
    mapPos: [-2.8, -6.2],
    scale: 2.25
  },
  {
    index: 4,
    id: 'mata-castillo-3',
    name: 'Mata #3 · Cumbre Castillo',
    zone: 'Lote Norte',
    kind: 'plant',
    mapPos: [1.1, -9.4],
    scale: 2.35
  },
  {
    index: 5,
    id: 'mata-caturra-1',
    name: 'Mata #4 · Caturra Terraza',
    zone: 'Terraza Este',
    kind: 'plant',
    mapPos: [6.4, -4.6],
    scale: 2.2
  },
  {
    index: 6,
    id: 'mata-caturra-2',
    name: 'Mata #5 · Caturra Ladera',
    zone: 'Terraza Este',
    kind: 'plant',
    mapPos: [8.6, -0.4],
    scale: 2.25
  },
  {
    index: 7,
    id: 'canasto-este',
    name: 'Canasto #2 · Cosecha Este',
    zone: 'Terraza Este',
    kind: 'cherries',
    onTable: true,
    mapPos: [5.8, 3.1],
    scale: 1.55
  },
  {
    index: 8,
    id: 'mata-borbon-1',
    name: 'Mata #6 · Borbón Sombrío',
    zone: 'Bosque Oeste',
    kind: 'plant',
    mapPos: [-6.3, -3.4],
    scale: 2.3
  },
  {
    index: 9,
    id: 'mata-geisha-1',
    name: 'Mata #7 · Geisha Especial',
    zone: 'Bosque Oeste',
    kind: 'plant',
    mapPos: [-5.1, 3.5],
    scale: 2.2
  }
];
