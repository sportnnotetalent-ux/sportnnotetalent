// Learn more: https://docs.expo.dev/versions/v56.0.0/config/metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Perf F-28 (docs/perf/audit.md) — inline requires on the PHONE APP: a module is
// evaluated the first time something uses it, not all at start-up (the APK is
// one bundle, so without this the whole static import graph runs before the
// first screen). Side-effect imports (`import './x'`) still run in place.
// The web build keeps it off: it splits into on-demand chunks instead (F-15),
// and its start-up order stays exactly as it was.
const baseTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (entryPoints, options, getDependenciesOf) => {
  const base = await baseTransformOptions(entryPoints, options, getDependenciesOf);
  return {
    ...base,
    transform: {
      ...base.transform,
      inlineRequires: options.platform !== 'web',
    },
  };
};

// Perf F-27 — react-native-qrcode-svg imports `react-native-svg/css` (and with
// it the css-tree CSS parser, ~125 modules) only to draw a logo from a local SVG
// asset, which the app never passes. The phone app resolves that one import to
// a stub (src/core/svgCssStub.ts); every other import resolves as before.
const svgCssStub = path.resolve(__dirname, 'src/core/svgCssStub.ts');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && moduleName === 'react-native-svg/css' && /[\\/]react-native-qrcode-svg[\\/]/.test(context.originModulePath)) {
    return { type: 'sourceFile', filePath: svgCssStub };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
