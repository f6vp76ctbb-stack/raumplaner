import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Reine Node-Umgebung. Engine, Modell und Store dürfen nichts aus
    // React Native ziehen — wenn ein Test hier an einem RN-Import scheitert,
    // ist das kein Testproblem, sondern eine verletzte Schichtgrenze.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
