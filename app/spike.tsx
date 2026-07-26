/**
 * PHASE-0-RISIKO-SPIKE — WEGWERF-CODE.
 *
 * ⚠️ Diese Datei wird vor dem ersten Store-Upload GELÖSCHT. Sie ist bewusst
 * kein Baustein der App, sondern ein Messinstrument. Siehe PHASE0.md.
 *
 * Zu beweisen sind fünf Dinge:
 *   1. expo-gl rendert einen extrudierten Wandkörper mit Fensteraussparung
 *   2. Orbit-Kamera per Geste, flüssig auf einem echten Gerät
 *   3. Tap trifft ein Objekt zuverlässig (Raycasting)
 *   4. Skia-Canvas und GL-Canvas koexistieren im selben Bildschirm
 *   5. Beides zusammen läuft im Development Build
 *
 * Punkt 2 ist der einzige, der sich nicht am Quelltext ablesen lässt — deshalb
 * blendet der Spike Bilder pro Sekunde ein. "Läuft" ist keine Messung; 58 fps
 * ist eine.
 *
 * Bewusst OHNE @react-three/fiber und ohne expo-three:
 * Wenn dieser Spike scheitert, muss unterscheidbar sein, ob expo-gl, die New
 * Architecture oder ein Reconciler schuld ist. Je weniger Schichten, desto
 * diagnostizierbarer das Ergebnis. R3F kommt erst drauf, wenn die Basis steht.
 *
 * KOORDINATEN: Diese Szene nutzt die three.js-Konvention (y = oben). Das
 * Datenmodell nutzt y = unten (siehe src/model/types.ts). Die Abbildung ist
 * (x_modell, y_modell) -> (x_szene, -z_szene); Höhen liegen auf y_szene.
 */

import { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import * as THREE from 'three';

import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { palettes } from '../src/theme/tokens';

const theme = palettes.dark;

/* -------------------------------------------------------------------------
 * Testraum: 3400 x 2600 mm, Deckenhöhe 2500, Fenster in der Nordwand
 * ---------------------------------------------------------------------- */

const ROOM = {
  width: 3400,
  depth: 2600,
  height: 2500,
  wallThickness: 115,
  window: { offset: 1200, width: 1000, sillHeight: 900, height: 1200 },
  door: { offset: 400, width: 900, height: 2010 },
} as const;

/** Millimeter -> Szeneneinheiten. 1 Einheit = 1 Meter. */
const MM = 0.001;

/* -------------------------------------------------------------------------
 * Geometrie
 * ---------------------------------------------------------------------- */

/**
 * Erzeugt einen Wandkörper mit echten Aussparungen.
 *
 * Der Ansatz ist der eigentliche Gegenstand des Spikes: Die Wand wird als
 * 2D-Umriss in der XY-Ebene aufgebaut, Öffnungen als `THREE.Path`-Löcher
 * eingesetzt, und das Ganze anschließend um die Wandstärke extrudiert.
 *
 * Das ist die Methode, die auch die echte 3D-Ansicht verwenden würde — eine
 * Aussparung ist damit ein Loch im Körper und keine dunkel eingefärbte Fläche.
 * Wenn das hier nicht trägt, trägt die spätere Ansicht auch nicht.
 */
function createWallWithOpenings(
  lengthMm: number,
  heightMm: number,
  thicknessMm: number,
  openings: { offset: number; width: number; sillHeight: number; height: number }[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(lengthMm * MM, 0);
  shape.lineTo(lengthMm * MM, heightMm * MM);
  shape.lineTo(0, heightMm * MM);
  shape.closePath();

  for (const opening of openings) {
    const hole = new THREE.Path();
    const x0 = opening.offset * MM;
    const x1 = (opening.offset + opening.width) * MM;
    const y0 = opening.sillHeight * MM;
    const y1 = (opening.sillHeight + opening.height) * MM;

    hole.moveTo(x0, y0);
    hole.lineTo(x1, y0);
    hole.lineTo(x1, y1);
    hole.lineTo(x0, y1);
    hole.closePath();
    shape.holes.push(hole);
  }

  return new THREE.ExtrudeGeometry(shape, {
    depth: thicknessMm * MM,
    bevelEnabled: false,
  });
}

interface SceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Nur diese Objekte sind antippbar. */
  pickable: THREE.Mesh[];
  triangles: number;
}

function buildScene(width: number, height: number): Omit<SceneHandles, 'renderer'> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.canvas);

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.05, 100);

  // Boden
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width * MM, ROOM.depth * MM),
    new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.width * MM) / 2, 0, (ROOM.depth * MM) / 2);
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: '#c9cdd4',
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  // Nordwand mit Fenster (entlang +x, bei z = 0)
  const north = new THREE.Mesh(
    createWallWithOpenings(ROOM.width, ROOM.height, ROOM.wallThickness, [ROOM.window]),
    wallMaterial,
  );
  north.position.set(0, 0, -ROOM.wallThickness * MM);
  scene.add(north);

  // Westwand mit Tür (entlang +z, bei x = 0)
  const west = new THREE.Mesh(
    createWallWithOpenings(ROOM.depth, ROOM.height, ROOM.wallThickness, [
      { ...ROOM.door, sillHeight: 0 },
    ]),
    wallMaterial,
  );
  west.rotation.y = Math.PI / 2;
  west.position.set(0, 0, 0);
  scene.add(west);

  // Drei Objekte als Boxen — Ziele für das Raycasting.
  const pickable: THREE.Mesh[] = [];
  const boxes: { name: string; size: [number, number, number]; at: [number, number]; lift: number }[] =
    [
      { name: 'Waschbecken', size: [600, 200, 480], at: [900, 300], lift: 850 },
      { name: 'Dusche', size: [900, 2000, 900], at: [2700, 1900], lift: 0 },
      { name: 'Unterschrank', size: [400, 800, 350], at: [400, 2200], lift: 0 },
    ];

  for (const box of boxes) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.size[0] * MM, box.size[1] * MM, box.size[2] * MM),
      new THREE.MeshStandardMaterial({ color: '#5d6675', roughness: 0.8 }),
    );
    mesh.position.set(
      box.at[0] * MM,
      (box.lift + box.size[1] / 2) * MM,
      box.at[1] * MM,
    );
    mesh.name = box.name;
    scene.add(mesh);
    pickable.push(mesh);
  }

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 6, 2);
  scene.add(sun);

  let triangles = 0;
  scene.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry?.attributes?.position) {
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position.count / 3;
    }
  });

  return { scene, camera, pickable, triangles: Math.round(triangles) };
}

/* -------------------------------------------------------------------------
 * Bildschirm
 * ---------------------------------------------------------------------- */

export default function SpikeScreen() {
  const handles = useRef<SceneHandles | null>(null);

  /**
   * Viewport in Punkten (nicht Pixeln), für die Raycasting-Umrechnung.
   *
   * Muss vor den Gesten stehen: Gestenkoordinaten kommen in Punkten, der
   * GL-Puffer zählt Pixel. Ohne diese Umrechnung liegt der Treffer auf jedem
   * Gerät mit Pixelverhältnis > 1 systematisch daneben — der klassische
   * Raycasting-Fehler in React Native.
   */
  const viewportPoints = useRef({ width: 1, height: 1 });

  /** Orbit-Zustand. Als Ref, nicht als State: 60-mal pro Sekunde neu rendern
   *  würde React bei jedem Frame durch den Reconciler schicken. */
  const orbit = useRef({ theta: -0.9, phi: 1.05, radius: 7.5 });
  const orbitStart = useRef({ theta: 0, phi: 0, radius: 0 });

  const [fps, setFps] = useState(0);
  const [hit, setHit] = useState<string | null>(null);
  const [taps, setTaps] = useState({ total: 0, hits: 0 });
  const [triangles, setTriangles] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const applyCamera = useCallback(() => {
    const current = handles.current;
    if (!current) return;

    const { theta, phi, radius } = orbit.current;
    const target = new THREE.Vector3((ROOM.width * MM) / 2, 0.9, (ROOM.depth * MM) / 2);

    current.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.cos(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.sin(theta),
    );
    current.camera.lookAt(target);
  }, []);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      try {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        // expo-gl liefert einen GL-Kontext ohne DOM-Canvas. three.js erwartet
        // ein canvas-artiges Objekt; diese Attrappe reicht ihm vollständig.
        const renderer = new THREE.WebGLRenderer({
          context: gl as unknown as WebGLRenderingContext,
          canvas: {
            width,
            height,
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
            clientWidth: width,
            clientHeight: height,
            getContext: () => gl,
          } as unknown as HTMLCanvasElement,
          antialias: true,
        });
        renderer.setSize(width, height);

        const built = buildScene(width, height);
        handles.current = { ...built, renderer };
        setTriangles(built.triangles);
        applyCamera();

        let frames = 0;
        let lastSample = Date.now();

        const loop = () => {
          const current = handles.current;
          if (!current) return;

          requestAnimationFrame(loop);
          current.renderer.render(current.scene, current.camera);
          // Ohne endFrameEXP wird nichts sichtbar — expo-gl reicht den Puffer
          // erst damit an die native Ansicht weiter.
          gl.endFrameEXP();

          frames += 1;
          const now = Date.now();
          if (now - lastSample >= 1000) {
            setFps(Math.round((frames * 1000) / (now - lastSample)));
            frames = 0;
            lastSample = now;
          }
        };

        loop();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [applyCamera],
  );

  /* --- Gesten -----------------------------------------------------------
   * `runOnJS(true)` ist hier richtig und kein Kompromiss: die three.js-Szene
   * und der Renderer leben ohnehin auf dem JS-Thread. Die Gesten auf den
   * UI-Thread zu legen, würde nur bedeuten, dass jeder Frame über die Grenze
   * zurückspringen muss. Die Vorgabe "Gesten auf dem UI-Thread" gilt für den
   * 2D-Skia-Editor, wo sie tatsächlich etwas bringt.
   * -------------------------------------------------------------------- */

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      orbitStart.current = { ...orbit.current };
    })
    .onUpdate((event) => {
      orbit.current.theta = orbitStart.current.theta + event.translationX * 0.005;
      orbit.current.phi = Math.min(
        Math.PI / 2.05,
        Math.max(0.15, orbitStart.current.phi - event.translationY * 0.005),
      );
      applyCamera();
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      orbitStart.current = { ...orbit.current };
    })
    .onUpdate((event) => {
      orbit.current.radius = Math.min(
        22,
        Math.max(1.5, orbitStart.current.radius / event.scale),
      );
      applyCamera();
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      const current = handles.current;
      if (!current) return;

      const ndc = new THREE.Vector2(
        (event.x / viewportPoints.current.width) * 2 - 1,
        -((event.y / viewportPoints.current.height) * 2 - 1),
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, current.camera);
      const intersections = raycaster.intersectObjects(current.pickable, false);

      const name = intersections[0]?.object.name ?? null;
      setHit(name);
      setTaps((previous) => ({
        total: previous.total + 1,
        hits: previous.hits + (name ? 1 : 0),
      }));

      for (const mesh of current.pickable) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.set(mesh.name === name ? theme.selection : '#5d6675');
      }
    });


  if (error) {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorTitle}>Spike gescheitert</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Text style={styles.errorHint}>
          Das ist ein verwertbares Ergebnis: melde diesen Text zurück, bevor
          weitergebaut wird.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        viewportPoints.current = { width, height };
      }}
    >
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, tap)}>
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      </GestureDetector>

      {/* Kriterium 4: Skia im selben Bildschirm wie GL. Bewusst überlappend
          und nicht nebeneinander — genau dort träte ein Konflikt zutage. */}
      <View style={styles.miniplan} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={miniplanPath()} color={theme.wall} style="stroke" strokeWidth={2} />
        </Canvas>
      </View>

      <View style={styles.readout} pointerEvents="none">
        <Row label="fps" value={String(fps)} warn={fps > 0 && fps < 50} />
        <Row label="Dreiecke" value={String(triangles)} />
        <Row label="Treffer" value={hit ?? '—'} />
        <Row label="Taps" value={`${taps.hits}/${taps.total}`} />
        <Row label="Plattform" value={`${Platform.OS} ${Platform.Version}`} />
      </View>

      <Text style={styles.hint} pointerEvents="none">
        Ziehen = drehen · Zwei Finger = zoomen · Tippen = Objekt wählen
      </Text>
    </View>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, warn ? { color: theme.conflict } : null]}>{value}</Text>
    </View>
  );
}

/** Grundriss des Testraums als Skia-Pfad, damit der Skia-Canvas echte Arbeit tut. */
function miniplanPath() {
  const path = Skia.Path.Make();
  const scale = 0.03;
  path.addRect({
    x: 8,
    y: 8,
    width: ROOM.width * scale,
    height: ROOM.depth * scale,
  });
  return path;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  miniplan: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 120,
    height: 100,
    backgroundColor: theme.surface,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  readout: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(15,17,21,0.82)',
    padding: spacing.md,
    borderRadius: 4,
    gap: 2,
    minWidth: 168,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: theme.textMuted, fontSize: fontSize.xs },
  rowValue: {
    color: theme.textNumeric,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  hint: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    color: theme.textMuted,
    fontSize: fontSize.xs,
  },
  errorRoot: {
    flex: 1,
    backgroundColor: theme.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: { color: theme.conflict, fontSize: fontSize.lg },
  errorBody: {
    color: theme.text,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  errorHint: { color: theme.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});
