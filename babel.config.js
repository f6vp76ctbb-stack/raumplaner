/**
 * Babel-Konfiguration.
 *
 * `babel-preset-expo` bringt für SDK 57 bereits die Transformation für
 * expo-router und Reanimated mit. Das Worklets-Plugin MUSS als letztes
 * Plugin stehen — es schreibt Funktionen um, die auf dem UI-Thread laufen,
 * und muss dafür alle anderen Transformationen bereits sehen.
 *
 * Reanimated 4 liefert das Plugin nicht mehr selbst mit, sondern über das
 * eigenständige Paket `react-native-worklets`.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
