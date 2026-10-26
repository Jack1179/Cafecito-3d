# ☕🌿 Cafecito MR · Juego Interactivo 3D de Merged & Mixed Reality

**Juego y simulador interactivo 3D en Merged Reality / Mixed Reality** construido alrededor del **Monitor Ambiental Portátil (Handheld Environmental Monitor)** del *Proyecto Cafecito*: un dispositivo diseñado para diagnosticar en tiempo real si una **mata de café** o **el café cosechado (cereza y grano pergamino)** está sano o enfermo, permitiendo detectar patologías y aplicar tratamientos mientras el aparato y el ecosistema cafetero reaccionan dinámicamente a tus acciones.

🔗 **Jugar en vivo (GitHub Pages):** **[https://jack1179.github.io/Cafecito-3d/](https://jack1179.github.io/Cafecito-3d/)**

---

## 📐 Réplica 3D Exacta del Dispositivo (CAD 1:1)

![Hoja Técnica del Monitor Ambiental Portátil](./public/assets/technical-sheet.jpg)

El modelo 3D interactivo reproduce al milímetro las especificaciones de la hoja técnica:

| Característica | Especificación Implementada en 3D |
| :--- | :--- |
| **Dimensiones Totales** | `120 mm (Alto) × 65 mm (Ancho) × 18 mm (Profundidad)` · Peso `85 g` |
| **Material** | Policarbonato Blanco Mate (*Matte White Polycarbonate*) con línea de unión perimetral |
| **Pantalla Frontal** | **IPS cuadrada `50 mm × 50 mm`** con bisel negro y 4 modos en tiempo real (`Óptica IA`, `Clima T/HR`, `Espectro UV·IR`, `Protocolo Fito`) |
| **Controles Frontales** | **3× Botones táctiles clicables en 3D**: Arriba (`▲`), Seleccionar (`●`), Abajo (`▼`) |
| **Control Lateral** | **Side Button** tipo cápsula en el canto derecho para disparo rápido del escáner óptico |
| **Sensores Traseros** | **Cámara Superior `Ø8 mm`** (con renderizado real *Picture-in-Picture* hacia la pantalla IPS) + **Rejilla Concéntrica Inferior `Ø12 mm`** de Humedad y Temperatura con partículas de muestreo de aire |

---

## 🥽 Modos de Realidad Soportados

1. **📹 Merged Reality (Cámara en Vivo + Manos MediaPipe + Fusión Ambiental)**
   - Mezcla el video de tu cámara (PC o móvil frontal/trasera) con el cafetal 3D y el monitor portátil.
   - **Seguimiento de manos en vivo (21 articulaciones)**: mueve tu mano para apuntar el aparato, **pellizca pulgar + índice** para escanear o aplicar el tratamiento, y **agita la palma** para generar brisa real que sacude las ramas 3D y ventila el exceso de humedad.
   - **Acoplamiento lumínico y cinético**: la iluminación real de tu habitación y tu movimiento modifican la radiación solar virtual, la temperatura (`°C`), la humedad relativa (`% HR`) captada por la rejilla `Ø12 mm` y las corrientes de polen/esporas.
   - Control deslizante **Fusión de Realidad (0% – 100%)** para graduar cuánto entorno cafetero andino se fusiona sobre tu espacio físico.
2. **🥽 WebXR Mixed Reality (`immersive-ar`)**
   - Soporte nativo para gafas **Meta Quest (Passthrough)** y teléfonos **Android Chrome (ARCore)** a escala métrica real `1:1`.
3. **🌿 Cafetal 3D Interactivo (Escritorio y Móvil sin Cámara)**
   - Paisaje cultural cafetero andino completo con montañas, mariposas polinizadoras, polen, floración cafetera y control fluido por mouse, pantalla táctil o teclado.

---

## 🔬 Enfermedades Detectables y Protocolos de Tratamiento

El juego incluye **3 matas vivas de *Coffea arabica*** (*Castillo*, *Caturra*, *Borbón Rosado*) y **2 estaciones de café cosechado** (*Canasto de Cerezas* y *Zaranda de Café Pergamino*):

| Estado / Patología | Señal Óptica (`Ø8 mm`) y Microclima (`Ø12 mm`) | Tratamiento Correcto | Respuesta del Entorno |
| :--- | :--- | :--- | :--- |
| **Cafeto / Café Sano** | Follaje esmeralda, cereza firme, `19–22 °C`, `64–72% HR` | **✓ Certificar Lote Sano** | Certifica Café Especial sin estresar polinizadores |
| **Roya del Cafeto** (*Hemileia vastatrix*) | Pústulas naranja-amarillas en hojas, `84–94% HR` | **✦ Bio-Fungicida + Trichoderma** | Nebulización cian, disuelve esporas y restaura clorofila |
| **Broca del Café** (*Hypothenemus hampei*) | Perforación `Ø1 mm` en corona de cereza/grano, `25–28 °C` | **❖ Beauveria bassiana + Re-Re** | Control biológico y saneamiento de granos perforados |
| **Mancha de Hierro + Déficit NPK** (*Cercospora*) | Manchas pardas con halo amarillo, baja HR (`40–52%`) | **◈ Nutrición Foliar NPK + Sombrío** | Absorción dorada de nutrientes y floración blanca |
| **Antracnosis / Moho en Grano** (*Colletotrichum*) | Lesiones negras hundidas y grano `>18%` humedad | **☀ Poda Sanitaria & Secado Solar** | Aireación, reducción hídrica y recuperación de vigor |

---

## 🎮 Controles Rápidos

- **Mouse / Touch**: Arrastra en la escena para mover el monitor entre matas y bandejas; haz clic directamente sobre los botones 3D del aparato (`▲`, `●`, `▼`, `Side button`) o usa la barra inferior.
- **Teclado**:
  - `A` / `D` o `←` / `→`: Cambiar entre las 5 estaciones de café.
  - `Espacio` (mantener): Activar escáner óptico `Ø8 mm` (Botón Lateral).
  - `W` / `S` o `↑` / `↓`: Botones `▲` y `▼` del monitor.
  - `Enter` o `E`: Botón central `●` (Escanear / Aplicar protocolo).
  - `1` – `4`: Cambiar modo de la pantalla IPS `50×50 mm`.
  - `F`: Girar el dispositivo `180°` para inspeccionar el lente `Ø8 mm` y la rejilla `Ø12 mm`.
  - `V`: Generar ráfaga de ventilación sobre las matas.

---

## 🛠️ Desarrollo Local

```bash
npm install
npm run dev
```

Para generar la compilación estática lista para GitHub Pages:

```bash
npm run build
npm run preview
```
