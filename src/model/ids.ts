/**
 * ID-Erzeugung. Rein — kein expo-crypto-Import, damit das Modell in Node
 * testbar bleibt.
 *
 * Nutzt `crypto.randomUUID` bzw. `crypto.getRandomValues`, wenn vorhanden
 * (Node ≥ 19 und React Native mit expo-crypto-Polyfill), und fällt sonst auf
 * `Math.random` zurück. Der Fallback ist für unsere Zwecke ausreichend: IDs
 * sind rein lokale Objektschlüssel, keine Sicherheitsgrenze und kein
 * Merge-Schlüssel über Geräte hinweg.
 */

type RandomBytes = (length: number) => Uint8Array;

const cryptoRef: Crypto | undefined =
  typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

const randomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

/** UUID v4 als Kleinbuchstaben-String mit Bindestrichen. */
export function uuid(): string {
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();

  const bytes = randomBytes(16);
  // Version 4 und Variante 1 setzen, wie RFC 4122 es verlangt.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Präfigierte ID, z. B. `wall_9f2c…`.
 *
 * Das Präfix ist reine Lesbarkeit beim Debuggen und in Diffs exportierter
 * Dateien — die Engine leitet daraus nie einen Typ ab.
 */
export function makeId(prefix: 'project' | 'floor' | 'room' | 'wall' | 'opening' | 'fixture' | 'catalog'): string {
  return `${prefix}_${uuid()}`;
}
