import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { bootstrap } from '../src/db/bootstrap';
import { useTheme } from '../src/theme/useTheme';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';

/**
 * Wurzel-Layout.
 *
 * `GestureHandlerRootView` muss die äußerste View sein, sonst erreichen
 * Gesten den Editor nicht. Sie umschließt hier bereits alles, obwohl der
 * Canvas erst in Phase 3 kommt — nachträglich eingezogen ist das eine
 * schwer auffindbare Fehlerquelle.
 */
export default function RootLayout() {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    bootstrap()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((cause: unknown) => {
        // Beim Start darf nichts stumm scheitern: wenn die Datenbank nicht
        // aufgeht, ist jede weitere Anzeige gelogen.
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorTitle, { color: theme.conflict }]}>
          Start fehlgeschlagen
        </Text>
        <Text style={[styles.errorBody, { color: theme.textMuted }]}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textMuted} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            headerTitleStyle: { fontSize: fontSize.lg },
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Projekte' }} />
          <Stack.Screen name="spike" options={{ title: 'Phase-0-Spike' }} />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    marginBottom: spacing.sm,
  },
  errorBody: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
