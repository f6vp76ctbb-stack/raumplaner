import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Link } from 'expo-router';

import { listProjects, loadProject, type ProjectSummary } from '../src/db/database';
import { useProjectStore } from '../src/store/projectStore';
import { useTheme } from '../src/theme/useTheme';
import { fontFamily, fontSize, radius, spacing } from '../src/theme/tokens';
import { formatArea } from '../src/engine/units';

/**
 * Projektliste.
 *
 * Zeigt für jedes Projekt bereits die harten Zahlen — Raumanzahl und
 * Gesamtfläche — statt einer Vorschaugrafik. Das ist Absicht: in einem
 * Messwerkzeug identifiziert man ein Projekt schneller über seine Maße als
 * über ein briefmarkengroßes Bild.
 *
 * Die Flächenangabe stammt hier noch aus einer groben Bounding-Box-Rechnung.
 * Sobald die Engine in Phase 2 steht, wird das durch die echte Polygonfläche
 * ersetzt — der Aufrufpunkt bleibt derselbe.
 */
export default function ProjectListScreen() {
  const theme = useTheme();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [stats, setStats] = useState<Record<string, { rooms: number; areaMm2: number }>>({});
  const [refreshing, setRefreshing] = useState(false);
  const loadIntoStore = useProjectStore((state) => state.loadProject);
  const activeProjectId = useProjectStore((state) => state.project?.id ?? null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const summaries = await listProjects();
      setProjects(summaries);

      const next: Record<string, { rooms: number; areaMm2: number }> = {};
      for (const summary of summaries) {
        const project = await loadProject(summary.id);
        if (!project) continue;

        let rooms = 0;
        let areaMm2 = 0;
        for (const floor of project.floors) {
          for (const room of floor.rooms) {
            rooms += 1;
            areaMm2 += boundingBoxArea(room.walls.map((wall) => wall.start));
          }
        }
        next[summary.id] = { rooms, areaMm2 };
      }
      setStats(next);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (id: string) => {
      const project = await loadProject(id);
      if (project) loadIntoStore(project);
    },
    [loadIntoStore],
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={projects}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.textMuted} />
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.textMuted }]}>
          Noch kein Projekt vorhanden.
        </Text>
      }
      ListFooterComponent={
        // Zugang zum Phase-0-Spike, hart an __DEV__ gekoppelt. Damit kann der
        // Wegwerf-Bildschirm nicht versehentlich in einer Store-Veröffentlichung
        // erreichbar sein — ein erreichbarer Debug-Screen ist bei Google ein
        // Qualitätsmangel und bei Apple ein Ablehnungsgrund unter 2.3.1.
        __DEV__ ? (
          <Link href="/spike" asChild>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.devLink,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.devLinkText, { color: theme.textMuted }]}>
                Phase-0-Spike öffnen (nur Entwicklung)
              </Text>
            </Pressable>
          </Link>
        ) : null
      }
      renderItem={({ item }) => {
        const stat = stats[item.id];
        const isOpen = item.id === activeProjectId;

        return (
          <Pressable
            onPress={() => void open(item.id)}
            accessibilityRole="button"
            accessibilityLabel={
              stat
                ? `${item.name}, ${stat.rooms} Räume, ${formatArea(stat.areaMm2)} Quadratmeter`
                : item.name
            }
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: isOpen ? theme.selection : theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>

            <View style={styles.metrics}>
              <Metric
                label="Räume"
                value={stat ? String(stat.rooms) : '—'}
                color={theme.textNumeric}
                muted={theme.textMuted}
              />
              <Metric
                label="Fläche"
                value={stat ? `${formatArea(stat.areaMm2)} m²` : '—'}
                color={theme.textNumeric}
                muted={theme.textMuted}
              />
              <Metric
                label="Geändert"
                value={formatDate(item.updatedAt)}
                color={theme.textNumeric}
                muted={theme.textMuted}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function Metric({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

/**
 * Grobe Fläche über die Bounding Box der Wandanfangspunkte.
 *
 * Platzhalter bis Phase 2. Bewusst als eigene Funktion mit diesem Kommentar,
 * damit sie beim Einbau der echten Polygonfläche nicht übersehen wird.
 */
function boundingBoxArea(points: { x: number; y: number }[]): number {
  if (points.length === 0) return 0;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xxl,
    fontSize: fontSize.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  metrics: { flexDirection: 'row', gap: spacing.xl },
  metric: { gap: 2 },
  metricLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  devLink: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  devLinkText: { fontSize: fontSize.sm },
  metricValue: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.md,
  },
});

