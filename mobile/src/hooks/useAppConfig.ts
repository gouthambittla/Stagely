import { useEffect, useState } from 'react';
import { api, AppConfig } from '../services/api';

/**
 * Safe default used until /api/config answers (or if it fails): payments off, so the app
 * behaves exactly as it did before payments existed.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  paymentsEnabled: false,
  platformFeePercent: 0,
  paymentWindowHours: 24,
  disputeWindowHours: 48,
  customerCancellationPolicy: [
    { minHoursBefore: 168, refundPercent: 100 },
    { minHoursBefore: 24, refundPercent: 50 },
    { minHoursBefore: 0, refundPercent: 0 }
  ]
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { config: AppConfig; fetchedAt: number } | null = null;
let inFlight: Promise<AppConfig> | null = null;

/** Fetches /api/config once and shares it (module-level cache, refreshed every 5 minutes). */
export function loadAppConfig(force = false): Promise<AppConfig> {
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.config);
  }
  if (inFlight) return inFlight;
  inFlight = api
    .getConfig()
    .then(config => {
      const merged: AppConfig = { ...DEFAULT_APP_CONFIG, ...config };
      cached = { config: merged, fetchedAt: Date.now() };
      return merged;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * React hook around loadAppConfig. `loaded` is false until the first answer arrives; on failure
 * the default (payments off) is kept so the app stays usable.
 */
export function useAppConfig(): { config: AppConfig; loaded: boolean; reload: () => Promise<void> } {
  const [config, setConfig] = useState<AppConfig>(cached?.config ?? DEFAULT_APP_CONFIG);
  const [loaded, setLoaded] = useState<boolean>(Boolean(cached));

  const load = async (force = false) => {
    try {
      const c = await loadAppConfig(force);
      setConfig(c);
    } catch (err: any) {
      if (__DEV__) console.warn('Failed to load app config', err?.message);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    let active = true;
    loadAppConfig()
      .then(c => {
        if (active) setConfig(c);
      })
      .catch(err => {
        if (__DEV__) console.warn('Failed to load app config', err?.message);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { config, loaded, reload: () => load(true) };
}
