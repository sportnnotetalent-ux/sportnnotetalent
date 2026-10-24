/** The slice of `qrcode` (a dependency of react-native-qrcode-svg) core/qrSvg.ts uses. */
declare module 'qrcode' {
  const QRCode: {
    create(text: string, opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): {
      modules: { size: number; get(x: number, y: number): boolean | number };
    };
  };
  export default QRCode;
}
