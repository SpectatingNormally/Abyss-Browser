import { cp, mkdir, copyFile, access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'dist');
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'style.css', 'script.js']) {
  await copyFile(path.join(root, file), path.join(out, file));
}

// Host both the FFmpeg JavaScript worker package and its single-thread WASM core
// on the same GitHub Pages origin. This avoids runtime dependency on a third-party CDN.
const ffmpegEsm = path.join(root, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm');
const coreUmd = path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
await access(ffmpegEsm);
await access(coreUmd);
await mkdir(path.join(out, 'vendor'), { recursive: true });
await cp(ffmpegEsm, path.join(out, 'vendor', 'ffmpeg'), { recursive: true });
await cp(coreUmd, path.join(out, 'vendor', 'ffmpeg-core'), { recursive: true });
await writeFile(path.join(out, '.nojekyll'), '');
console.log('Abyss Pages build complete.');
