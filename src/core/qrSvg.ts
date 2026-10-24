/** A QR code as an SVG string (for printable HTML sheets — certificates).
 *  Pure: `qrcode`'s matrix (the same library react-native-qrcode-svg uses). */
import QRCode from 'qrcode';

export function qrSvg(text: string, opts: { size?: number; dark?: string; light?: string } = {}): string {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size;
  const quiet = 2;
  const dim = n + quiet * 2;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (q.modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const size = opts.size ?? 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges">`
    + `<rect width="${dim}" height="${dim}" fill="${opts.light ?? '#fff'}"/><path d="${path}" fill="${opts.dark ?? '#000'}"/></svg>`;
}
