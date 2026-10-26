import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('node_modules/@mediapipe/tasks-vision/wasm');
const destDir = path.resolve('public/wasm');

if (fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
  console.log('[copy-wasm] Copied MediaPipe WASM runtime to public/wasm');
}
