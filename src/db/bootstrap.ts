/**
 * Erststart-Einrichtung.
 *
 * Legt beim allerersten Start das Beispielprojekt und den mitgelieferten
 * Katalog an. Das ist nicht nur Bequemlichkeit: eine leere App wirkt im
 * App-Review funktionsarm, und das ist ein häufiger Auslöser für Richtlinie
 * 4.2. Der Prüfer soll beim Öffnen sofort einen bemaßten Grundriss sehen.
 *
 * Der Schlüssel in `meta` sorgt dafür, dass ein Nutzer, der das Beispiel
 * löscht, es nicht beim nächsten Start wieder vorfindet.
 */

import { createSampleProject, BUILTIN_CATALOG } from '../model/sample';
import { getMeta, listProjects, saveProject, setMeta, upsertCatalogItem } from './database';

const SEEDED_KEY = 'seeded_v1';

export interface BootstrapResult {
  /** Wurde in diesem Lauf erstmalig befüllt? */
  seeded: boolean;
  /** Projekt, das der Startbildschirm vorschlagen kann. */
  suggestedProjectId: string | null;
}

export async function bootstrap(): Promise<BootstrapResult> {
  const alreadySeeded = await getMeta(SEEDED_KEY);

  if (alreadySeeded === 'true') {
    const projects = await listProjects();
    return { seeded: false, suggestedProjectId: projects[0]?.id ?? null };
  }

  const sample = createSampleProject();
  await saveProject(sample);

  for (const item of BUILTIN_CATALOG) {
    await upsertCatalogItem(item);
  }

  await setMeta(SEEDED_KEY, 'true');

  return { seeded: true, suggestedProjectId: sample.id };
}
