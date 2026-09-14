import { openDB, type DBSchema } from 'idb';
import type { EnginePosition } from './types';

interface EnginePositionDB extends DBSchema {
  positions: { key: string; value: EnginePosition };
}

// This database is only opened by EngineBetaReader after the V2 feature flag
// has been enabled. The legacy reader never imports or calls this module.
const engineDB = () =>
  openDB<EnginePositionDB>('leaf-reader-engine-v2', 1, {
    upgrade(database) {
      database.createObjectStore('positions', { keyPath: 'bookId' });
    },
  });

export async function getEnginePosition(bookId: string) {
  return (await engineDB()).get('positions', bookId);
}

export async function putEnginePosition(position: EnginePosition) {
  await (await engineDB()).put('positions', position);
}
