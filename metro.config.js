const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs wa-sqlite (WebAssembly) in a worker.
config.resolver.assetExts.push('wasm');

module.exports = config;
