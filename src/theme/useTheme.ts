import { useColorScheme } from 'react-native';
import { palettes, type Palette } from './tokens';

/**
 * Aktive Farbpalette.
 *
 * Folgt der Systemeinstellung. Kein In-App-Umschalter in 1.0: ein eigener
 * Schalter ist ein zusätzlicher Zustand, der gespeichert und wiederhergestellt
 * werden will, und Dark Mode wird auf iOS ohnehin systemweit erwartet.
 */
export function useTheme(): Palette {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
