// Debugging logs stay available in development and are silenced in production.
// EXPO_PUBLIC_APP_ENV wins; without it, Metro's __DEV__ decides (debug → development, release → production).
export type AppEnv = 'development' | 'production';
const configured = process.env.EXPO_PUBLIC_APP_ENV;
export const APP_ENV: AppEnv = configured === 'development' || configured === 'production' ? configured
  : typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
export const DEBUG_LOGS = APP_ENV === 'development';

export const logger = {
  log: (...args: unknown[]) => { if (DEBUG_LOGS) console.log(...args); },
  info: (...args: unknown[]) => { if (DEBUG_LOGS) console.info(...args); },
  warn: (...args: unknown[]) => { if (DEBUG_LOGS) console.warn(...args); },
};
