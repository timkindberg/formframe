// React 18: createRoot + act() is a no-op (and warns) unless this is set.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
