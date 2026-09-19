#!/usr/bin/env node
/**
 * Regenerates `demo-portal/public/faces/*` from the two public-domain, StyleGAN-generated source
 * photos on Wikimedia Commons — see `public/faces/PROVENANCE.md` for exactly which files, their
 * licence, and how each derived file was made. One-off dev tool, not part of `pnpm check`.
 *
 * Deliberately takes the two source images as local file paths, not URLs: this script has no
 * network dependency of its own (nothing here touches `fetch`/`XMLHttpRequest` — AGENTS.md
 * invariant 2 is scoped to the extension and server, but there is no reason for a demo-asset
 * generator to reach the network either). Download the two files from PROVENANCE.md's URLs
 * yourself first, then run:
 *
 *   node demo-portal/scripts/make-face-assets.mjs <this-person-does-not-exist.jpg> <gan-mensch.png>
 *
 * Requires `sharp` (a devDependency here, not of the shipped demo portal).
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/faces');

const [synth1Path, synth2Path] = process.argv.slice(2);
if (!synth1Path || !synth2Path) {
  console.error('Usage: node make-face-assets.mjs <this-person-does-not-exist.jpg> <gan-mensch.png>');
  console.error('See PROVENANCE.md in ../public/faces for where to download those two files from.');
  process.exit(1);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const synth1 = synth1Path;
  const synth2 = synth2Path;

  await sharp(synth1).resize(260, 260, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(path.join(OUT_DIR, 'profile-photo.jpg'));

  const cardW = 420, cardH = 260, photoW = 110, photoH = 140;
  const facePhoto = await sharp(synth2).resize(photoW, photoH, { fit: 'cover' }).png().toBuffer();
  const cardSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
      <rect width="${cardW}" height="${cardH}" rx="14" fill="#eef3f8" stroke="#2d3436" stroke-width="2"/>
      <rect x="0" y="0" width="${cardW}" height="34" rx="14" fill="#2d5f8a"/>
      <text x="14" y="23" font-family="sans-serif" font-size="15" fill="#ffffff" font-weight="bold">SPECIMEN IDENTITY CARD (SYNTHETIC)</text>
      <text x="140" y="70" font-family="sans-serif" font-size="13" fill="#2d3436">Name: FICTIONAL PERSON</text>
      <text x="140" y="92" font-family="sans-serif" font-size="13" fill="#2d3436">DOB: 01/01/1990</text>
      <text x="140" y="114" font-family="sans-serif" font-size="13" fill="#2d3436">ID No: 0000-0000-0000</text>
      <text x="140" y="136" font-family="sans-serif" font-size="13" fill="#2d3436">Address: 000 Nowhere Lane</text>
      <text x="14" y="${cardH - 10}" font-family="sans-serif" font-size="10" fill="#636e72">Synthetic demo card. Face is an AI-generated (StyleGAN) image, no real person.</text>
    </svg>`;
  await sharp(Buffer.from(cardSvg)).composite([{ input: facePhoto, left: 16, top: 50 }]).png().toFile(path.join(OUT_DIR, 'id-card.png'));

  await sharp(synth1)
    .extract({ left: 260, top: 220, width: 260, height: 340 })
    .resize(48, 64, { fit: 'fill' })
    .png()
    .toFile(path.join(OUT_DIR, 'partial-face-small.png'));

  const controlSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="260" height="260">
      <rect width="260" height="260" fill="#f5f6fa"/>
      <circle cx="80" cy="80" r="50" fill="#74b9ff"/>
      <rect x="140" y="40" width="90" height="90" fill="#55efc4"/>
      <polygon points="60,220 130,140 200,220" fill="#ffeaa7" stroke="#2d3436" stroke-width="2"/>
      <text x="20" y="245" font-family="sans-serif" font-size="12" fill="#2d3436">Synthetic control graphic — no face</text>
    </svg>`;
  await sharp(Buffer.from(controlSvg)).png().toFile(path.join(OUT_DIR, 'control-no-face.png'));

  console.log('Wrote profile-photo.jpg, id-card.png, partial-face-small.png, control-no-face.png to', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
