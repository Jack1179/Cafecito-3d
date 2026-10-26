# ☕🌿 Cafecito MR · Finca Explorable 3D & Meta Quest 3 Mixed Reality

**Juego interactivo 3D explorable en Merged Reality y Mixed Reality** construido alrededor del **Monitor Ambiental Portátil (Handheld Environmental Monitor)** del *Proyecto Cafecito*: camina libremente por una finca cafetera andina buscando **matas de café** y **muestras de cosecha (cerezas y grano pergamino)** para diagnosticar si están sanas o enfermas, aplicar tratamientos fitosanitarios y ver cómo el aparato y el ecosistema reaccionan en tiempo real.

🔗 **Jugar en vivo (GitHub Pages):** **[https://jack1179.github.io/Cafecito-3d/](https://jack1179.github.io/Cafecito-3d/)**

---

## 🥽 Compatible con Meta Quest 3, Webcam MR, PC y Móvil

1. **🥽 Meta Quest 3 — Passthrough Mixed Reality (`🥽 Quest 3 MR`) y VR (`🥽 Quest VR`)**
   - Ábrelo directamente desde **Meta Quest Browser** (sobre HTTPS en GitHub Pages).
   - **Mano derecha (Escala física real 1:1 — `120 × 65 × 18 mm`)**: sostienes el monitor en tu mano; puedes acercarlo físicamente a las hojas y cerezas o girar tu muñeca para ver el lente `Ø8 mm` y la rejilla `Ø12 mm`.
   - **Stick Izquierdo**: caminar suavemente en 360° por todos los senderos de la finca (además de caminar físicamente en tu espacio *room-scale*).
   - **Stick Derecho**: giro cómodo por pasos (*snap-turn* `30°`) e izquierda/derecha o arriba/abajo (`▲ / ▼`) en el menú de la pantalla IPS.
   - **Gatillo Derecho**: mantener presionado para escanear con la cámara óptica `Ø8 mm`.
   - **Botón A / Grip Derecho**: confirmar / aplicar el tratamiento seleccionado (`●`).
   - **Mano Izquierda**: rayo láser 3D para pulsar directamente los botones físicos del monitor + **HUD espacial en la muñeca** + Grip izquierdo para ventilar el follaje.

2. **📹 Merged Reality en PC / Móvil (Cámara en Vivo + Manos MediaPipe)**
   - Mezcla tu cámara real con el cafetal 3D explorable, mide la iluminación y movimiento reales de tu cuarto para modificar el microclima (`Temp` y `% HR`), y detecta tu mano en vivo (pellizca pulgar + índice para escanear/curar y abanica para ventilar).

3. **🌿 Finca Cafetera 3D Explorable (Teclado/Mouse y Joystick Táctil)**
   - Recorre **4 zonas** (*Sendero Central*, *Beneficiadero*, *Lote Norte Castillo*, *Terraza Este Caturra* y *Bosque Oeste Borbón/Geisha*) con **10 estaciones interactivas**, brújula de rastreo integrada en la pantalla IPS `50×50 mm` y **Radar / Minimapa interactivo**.

---

## 📐 Réplica 3D Exacta del Dispositivo (CAD 1:1)

![Hoja Técnica del Monitor Ambiental Portátil](./public/assets/technical-sheet.jpg)

| Característica | Especificación Implementada en 3D |
| :--- | :--- |
| **Dimensiones Totales** | `120 mm (Alto) × 65 mm (Ancho) × 18 mm (Profundidad)` · Peso `85 g` |
| **Material** | Policarbonato Blanco Mate (*Matte White Polycarbonate*) con línea de unión perimetral |
| **Pantalla Frontal** | **IPS cuadrada `50 mm × 50 mm`** con visor óptico en vivo, brújula hacia brotes cercanos y 4 modos (`Óptica IA`, `Clima T/HR`, `Espectro UV·IR`, `Protocolo Fito`) |
| **Controles Físicos** | **3× Botones frontales 3D** (`▲`, `●`, `▼`) + **Side Button** lateral clicables directamente |
| **Sensores Traseros** | **Cámara Superior `Ø8 mm`** (*Picture-in-Picture* real hacia la pantalla IPS) + **Rejilla Concéntrica Inferior `Ø12 mm`** de Humedad y Temperatura |

---

## 🎮 Controles en PC y Móvil

- **Caminar por el mapa**: **`W / A / S / D`** (`Shift` para correr), **Joystick virtual** en la esquina inferior izquierda, o **clic en cualquier punto/mata del Radar** para caminar automáticamente hasta allí.
- **Mirar 360°**: **Arrastra con el mouse o dedo** en la escena, o usa **`Q / E`** (`← / →`).
- **Usar el Monitor**:
  - Acércate a menos de `3 metros` de cualquier mata o mesa de café.
  - **`Espacio`** (o botón `🔍 Escáner Ø8mm` / botón lateral 3D): escanear patología.
  - **`↑ / ↓`** (o botones `▲ / ▼`): cambiar modo de pantalla o elegir tratamiento.
  - **`Enter`** (o botón `● Aplicar`): aplicar tratamiento o certificar lote sano.
  - **`R`** (o `🧭 Buscar Mata`): orientarte y caminar hacia el brote pendiente más cercano.
  - **`F`**: girar el aparato `180°` para inspeccionar su reverso.

---

## 🛠️ Desarrollo Local

```bash
npm install
npm run dev
```

Compilación de producción para GitHub Pages:

```bash
npm run build
npm run preview
```
