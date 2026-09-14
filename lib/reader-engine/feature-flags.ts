const ENGINE_V2_FLAG = 'leaf-reader-engine-v2-enabled';

type ViteEnvironment = { VITE_ENGINE_BETA_BUILD?: string };
const environment = (import.meta as ImportMeta & { env?: ViteEnvironment }).env;

export const isEngineBetaBuild = environment?.VITE_ENGINE_BETA_BUILD === '1';

export function isEngineV2Enabled() {
  if (!isEngineBetaBuild || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(ENGINE_V2_FLAG) === 'true';
}

export function setEngineV2Enabled(enabled: boolean) {
  if (!isEngineBetaBuild || typeof localStorage === 'undefined') return false;
  localStorage.setItem(ENGINE_V2_FLAG, String(enabled));
  return enabled;
}
