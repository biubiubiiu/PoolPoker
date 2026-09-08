// SphereGeometry uses an equirectangular UV map. Project the markings onto
// opposite ±Z spherical caps so their outlines stay circular on the ball.
export function createBallTextureCanvas(number: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = 256;
  const ink = stamp.getContext('2d');
  if (!ink) throw new Error('Canvas unavailable');
  ink.fillStyle = '#f2edda';
  ink.fillRect(0, 0, 256, 256);
  ink.fillStyle = '#080b09';
  ink.font = 'bold 200px Georgia, serif';
  ink.textAlign = 'center';
  ink.textBaseline = 'alphabetic';
  const label = String(number);
  const metrics = ink.measureText(label);
  ink.fillText(label, 128, 128 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
  const marking = ink.getImageData(0, 0, 256, 256).data;
  // Stripes have large ivory end caps; solids retain a small number medallion.
  const capEdge = number > 8 ? 0.62 : 0.91;
  const numberExtent = number > 8 ? 0.5 : 0.4;
  const ivory = [242, 237, 218];
  for (let row = 0; row < canvas.height; row++) {
    const theta = ((row + 0.5) / canvas.height) * Math.PI;
    const y = Math.cos(theta);
    for (let col = 0; col < canvas.width; col++) {
      const phi = ((col + 0.5) / canvas.width) * Math.PI * 2;
      const x = -Math.cos(phi) * Math.sin(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      const coverage = Math.max(0, Math.min(1, (Math.abs(z) - capEdge) * 512 + 0.5));
      if (!coverage) continue;
      const sx = Math.floor(((x * Math.sign(z)) / numberExtent + 1) * 128);
      const sy = Math.floor((1 - y / numberExtent) * 128);
      const sample = (sy * 256 + sx) * 4;
      const inside = sx >= 0 && sx < 256 && sy >= 0 && sy < 256;
      const offset = (row * canvas.width + col) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = inside ? marking[sample + channel] : ivory[channel];
        pixels.data[offset + channel] += (value - pixels.data[offset + channel]) * coverage;
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
