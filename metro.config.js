const { getDefaultConfig } = require('expo/metro-config');

/**
 * Standardkonfiguration von Expo, unverändert.
 *
 * Die Datei existiert trotzdem explizit: sobald der 3D-Spike eigene
 * Assetendungen braucht (Shader, GLB), gehört die Erweiterung hierher, und
 * eine vorhandene Datei macht sichtbar, wo das passiert.
 */
module.exports = getDefaultConfig(__dirname);
