import type { ArcheonApi } from '../../../preload/index.d'

/** Access the preload-exposed Archeon API. Throws if the bridge is missing. */
export function getArcheonApi(): ArcheonApi {
  const api = window.archeon
  if (!api) {
    throw new Error('Archeon IPC bridge is not available (preload not loaded)')
  }
  return api
}
