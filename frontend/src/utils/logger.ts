// Tiny debug logger for the game.
//
// Logging is off by default, including in production builds. Set
// VITE_DEBUG_LOGS=true at build time to turn debug/info/warn output on; errors
// are always reported. The flag is read from import.meta.env, so Vite inlines
// it at build time and the flag name is absent from the shipped bundle unless
// it was explicitly enabled.

const debugEnabled = import.meta.env.VITE_DEBUG_LOGS === 'true'

type LogArgs = unknown[]

export const logger = {
  debug: (...args: LogArgs): void => {
    if (debugEnabled) console.log(...args)
  },
  info: (...args: LogArgs): void => {
    if (debugEnabled) console.info(...args)
  },
  warn: (...args: LogArgs): void => {
    if (debugEnabled) console.warn(...args)
  },
  error: (...args: LogArgs): void => {
    console.error(...args)
  }
}

export default logger
