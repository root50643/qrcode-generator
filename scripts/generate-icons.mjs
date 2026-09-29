import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const iconDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
await mkdir(iconDir, { recursive: true });

// Original geometric mark; it is deliberately an icon, not an encoded QR code.
function artwork(maskable = false) {
  const offset = maskable ? 112 : 96;
  const scale = maskable ? 0.9 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#080d19"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <g fill="none" stroke="#7cf5cf" stroke-width="24">
      <rect x="12" y="12" width="108" height="108" rx="24"/>
      <rect x="200" y="12" width="108" height="108" rx="24"/>
      <rect x="12" y="200" width="108" height="108" rx="24"/>
    </g>
    <g fill="#eafef7">
      <rect x="48" y="48" width="36" height="36" rx="8"/>
      <rect x="236" y="48" width="36" height="36" rx="8"/>
      <rect x="48" y="236" width="36" height="36" rx="8"/>
    </g>
    <g fill="#a699ff">
      <rect x="188" y="188" width="48" height="48" rx="10"/>
      <rect x="272" y="188" width="48" height="48" rx="10"/>
      <rect x="188" y="272" width="48" height="48" rx="10"/>
      <rect x="250" y="250" width="70" height="70" rx="12"/>
    </g>
  </g>
</svg>`;
}

const svg = artwork();
await writeFile(`${publicDir}/favicon.svg`, svg);
await Promise.all([
  sharp(Buffer.from(svg)).resize(192, 192).png().toFile(`${iconDir}/icon-192.png`),
  sharp(Buffer.from(svg)).resize(512, 512).png().toFile(`${iconDir}/icon-512.png`),
  sharp(Buffer.from(artwork(true))).resize(512, 512).png().toFile(`${iconDir}/maskable-512.png`),
  sharp(Buffer.from(svg)).resize(180, 180).flatten({ background: '#080d19' }).png().toFile(`${iconDir}/apple-touch-icon.png`),
]);
console.log('Generated the NUU QR favicon and install icons.');
