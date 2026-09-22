import sharp from 'sharp';
import fs from 'fs';

const svgPath = 'frontend/public/hazardnet-logo.svg';

async function generateIcons() {
  console.log('Generating PWA icons...');
  try {
    const svgBuffer = fs.readFileSync(svgPath);

    // 192x192
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile('frontend/public/pwa-192x192.png');
    
    // 512x512
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile('frontend/public/pwa-512x512.png');

    // Apple Touch Icon (180x180 with solid white background, since iOS doesn't do transparency well)
    // Actually iOS supports transparent PNGs but typically they are on solid background.
    // Let's just create a transparent 180x180, iOS handles it or adds black bg. Better to add white bg.
    await sharp(svgBuffer)
      .resize(180, 180)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile('frontend/public/apple-touch-icon.png');

    // Maskable icon 512x512
    // Pad the image by 20%
    await sharp(svgBuffer)
      .resize(360, 360) // 70% of 512
      .extend({
        top: 76,
        bottom: 76,
        left: 76,
        right: 76,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile('frontend/public/pwa-maskable-512x512.png');
      
    console.log('Icons generated successfully.');
  } catch (err) {
    console.error('Failed to generate icons:', err);
  }
}

generateIcons();
