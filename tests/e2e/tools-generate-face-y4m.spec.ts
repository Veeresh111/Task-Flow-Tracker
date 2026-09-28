import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Generates test-media/face_animated.y4m — the ONLY format Chromium's
 * --use-file-for-fake-video-capture reliably accepts. Frames are rendered by
 * Chromium itself from a real face photo (Unsplash, free license) with a slow
 * zoom + horizontal sway. The face NEVER blinks, opens its mouth, or turns:
 * a static-ish human face, so active-liveness challenges must honestly FAIL
 * against it (that refusal is the security evidence we want).
 */
test('generate animated face y4m for fake camera', async ({ page }) => {
  test.skip(process.env.E2E_GEN_MEDIA !== '1', 'media generator — run explicitly with E2E_GEN_MEDIA=1');
  test.setTimeout(300000);
  const W = 640, H = 480, FRAMES = 150, FPS = 30;
  const out = path.join(process.cwd(), 'test-media', 'face_animated.y4m');
  const jpgB64 = fs.readFileSync(path.join(process.cwd(), 'test-media', 'face.jpg')).toString('base64');

  await page.goto('about:blank');
  await page.evaluate(({ jpgB64, W, H }) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        (window as any).__img = img;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        (window as any).__ctx = c.getContext('2d', { willReadFrequently: true })!;
        resolve();
      };
      img.onerror = () => reject(new Error('face.jpg failed to load/decode'));
      img.src = 'data:image/jpeg;base64,' + jpgB64;
    });
  }, { jpgB64, W, H });

  const header = `YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`;
  fs.writeFileSync(out, header, 'binary');

  for (let f = 0; f < FRAMES; f++) {
    const u8: Uint8Array = await page.evaluate((f) => {
      const img = (window as any).__img as HTMLImageElement;
      const ctx = (window as any).__ctx as CanvasRenderingContext2D;
      const W = 640, H = 480;
      const t = f / 150;
      // Slow breathing zoom (1.04→1.10) + gentle horizontal sway (±8px).
      const zoom = 1.07 + 0.03 * Math.sin(t * 2 * Math.PI);
      const dx = 8 * Math.sin(t * 4 * Math.PI);
      const dw = W * zoom, dh = H * zoom;
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - dw) / 2 + dx, (H - dh) / 2, dw, dh);
      const d = ctx.getImageData(0, 0, W, H).data;

      const ySize = W * H, cSize = (W / 2) * (H / 2);
      const frame = new Uint8Array(ySize + 2 * cSize);
      const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
      // Luma plane
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          frame[y * W + x] = clamp(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        }
      }
      // Chroma planes (420, 2x2 subsampled, jpeg full-range)
      let ci = ySize;
      for (let cy = 0; cy < H / 2; cy++) {
        for (let cx = 0; cx < W / 2; cx++) {
          // average the 2x2 block
          let R = 0, G = 0, B = 0;
          for (const [oy, ox] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
            const i = ((cy * 2 + oy) * W + (cx * 2 + ox)) * 4;
            R += d[i]; G += d[i + 1]; B += d[i + 2];
          }
          R /= 4; G /= 4; B /= 4;
          frame[ci++] = clamp(128 - 0.168736 * R - 0.331264 * G + 0.5 * B);
          frame[ci++] = clamp(128 + 0.5 * R - 0.418688 * G - 0.081312 * B);
        }
      }
      return frame;
    }, f);
    fs.appendFileSync(out, Buffer.concat([Buffer.from('FRAME\n', 'binary'), Buffer.from(u8)]));
    if (f % 30 === 0) console.log(`frame ${f}/${FRAMES}`);
  }
  console.log('Y4M written:', out, fs.statSync(out).size, 'bytes');
});
