// RECIPE: per-path field-mode subscriptions. Copy with fieldMode.recipe.ts.
//
// A driver change must re-render only the field roots whose hidden / required /
// readOnly bit flipped. Three rules make that hold:
//
//   1. Subscribe to a boolean, not the snapshot: `useFieldMode(s => s.hidden.has(path))`.
//      Selecting `s.isHidden` (a new function per snapshot) wakes every field.
//   2. `useWatch` lives in `RhfFieldModeRuntime`, never on the component that
//      mounts `SchemaFields`. Pass a stable `<SchemaFields />` element as children.
//   3. The store notifies only when set membership changes.
//
// A plain `useSyncExternalStore` store, not a selector-context library:
// use-context-selector notifies every listener whenever the provider value is a
// new object, even when the selected boolean did not change.
//
// `FieldModeProvider` is form-library agnostic. `RhfFieldModeRuntime` is the RHF
// binding (watch condition paths, apply hide-and-clear `setValues`).
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import {
  isBlank,
  type FieldMode,
  type FieldModeSnapshot,
} from './fieldMode.recipe'

export type FieldModeBits = Pick<
  FieldModeSnapshot,
  'hidden' | 'required' | 'readOnly'
>

const EMPTY_BITS: FieldModeBits = {
  hidden: new Set(),
  required: new Set(),
  readOnly: new Set(),
}

type FieldModeStore = {
  bits: FieldModeBits
  subscribe: (listener: () => void) => () => void
  notify: () => void
}

function createFieldModeStore(bits: FieldModeBits): FieldModeStore {
  const listeners = new Set<() => void>()
  return {
    bits,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify() {
      listeners.forEach((listener) => listener())
    },
  }
}

const FieldModeStoreContext = createContext<FieldModeStore | null>(null)

const noopSubscribe = () => () => {}

function PassThrough({ children }: { children: ReactNode }) {
  return children
}

// The provider re-renders on every watched change; its children must not.
const FrozenTree = memo(PassThrough)

/** Select one primitive per call. Outside a provider, every bit is empty. */
export function useFieldMode<T>(selector: (bits: FieldModeBits) => T): T {
  const store = useContext(FieldModeStoreContext)
  const getSnapshot = () => selector(store ? store.bits : EMPTY_BITS)
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    getSnapshot,
    getSnapshot
  )
}

function membershipKey(bits: FieldModeBits): string {
  return [bits.hidden, bits.required, bits.readOnly]
    .map((set) => [...set].sort().join())
    .join('|')
}

export function FieldModeProvider({
  mode,
  children,
}: {
  mode: FieldModeBits
  children: ReactNode
}) {
  const [store] = useState(() => createFieldModeStore(mode))
  const key = membershipKey(mode)

  useLayoutEffect(() => {
    if (store.bits === mode) return
    store.bits = mode
    store.notify()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- membership, not snapshot identity
  }, [key, store])

  return (
    <FieldModeStoreContext.Provider value={store}>
      <FrozenTree>{children}</FrozenTree>
    </FieldModeStoreContext.Provider>
  )
}

/** Watches rule condition paths and applies hide-and-clear `setValues`. */
export function RhfFieldModeRuntime({
  fieldMode,
  children,
}: {
  fieldMode: FieldMode
  children: ReactNode
}) {
  const { control, getValues, setValue, clearErrors } = useFormContext()
  // An empty `name` would widen the watch to the whole form.
  useWatch({
    control,
    name: fieldMode.paths.length > 0 ? [...fieldMode.paths] : ['__no_watch__'],
  })
  const mode = fieldMode(getValues())
  const hiddenKey = [...mode.hidden].sort().join()
  const setValuesKey = JSON.stringify(mode.setValues)

  useEffect(() => {
    const snapshot = fieldMode(getValues())
    for (const [path, value] of Object.entries(snapshot.setValues)) {
      const current = getValues(path)
      if (current === value) continue
      if (isBlank(current) && value == null) continue
      setValue(path, value as never, { shouldDirty: true })
    }
    for (const path of snapshot.hidden) clearErrors(path)
    // Keyed on membership, not snapshot identity: a new snapshot every render must not re-run this.
  }, [hiddenKey, setValuesKey, fieldMode, getValues, setValue, clearErrors])

  return <FieldModeProvider mode={mode}>{children}</FieldModeProvider>
}
