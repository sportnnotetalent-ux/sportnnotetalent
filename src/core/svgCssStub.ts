/**
 * Perf F-27 — what `react-native-svg/css` resolves to in the PHONE APP bundle
 * (metro.config.js). react-native-qrcode-svg imports it only to draw a logo
 * given as a local SVG asset (`logoSVG`); the app's QR codes have no logo
 * (components/InviteQrShare.tsx), so the CSS parser it pulls in (css-tree and
 * friends, ~125 modules) never ran — now it isn't shipped either.
 */
export function LocalSvg(): never {
  throw new Error('[SportnNote] react-native-svg/css is not bundled in the app: QR codes take no local SVG logo.');
}
