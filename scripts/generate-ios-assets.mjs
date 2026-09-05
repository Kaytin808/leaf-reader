import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Rasterize Leaf's existing vector brand mark, keeping a fully opaque iOS icon.
const logo = await readFile(new URL('../public/favicon.svg', import.meta.url));
const assetRoot = new URL('../ios/App/App/Assets.xcassets/', import.meta.url);
const icon = await sharp(logo, { density: 1200 })
  .resize(1024, 1024)
  .flatten({ background: '#183b64' })
  .png()
  .toBuffer();
await sharp(icon).toFile(
  fileURLToPath(new URL('AppIcon.appiconset/AppIcon-512@2x.png', assetRoot)),
);
const mark = await sharp(logo, { density: 600 })
  .resize(420, 420)
  .png()
  .toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 3, background: '#183b64' },
})
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toBuffer();
for (const filename of [
  'splash-2732x2732.png',
  'splash-2732x2732-1.png',
  'splash-2732x2732-2.png',
]) {
  await sharp(splash).toFile(
    fileURLToPath(new URL('Splash.imageset/' + filename, assetRoot)),
  );
}
console.log('Leaf iOS icon and launch artwork generated.');
