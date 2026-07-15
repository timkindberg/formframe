/**
 * The front-end-agnostic **type surface** a front-end brands its tree with, plus
 * the neutral widget → control → parts *composition* that used to live per
 * front-end (ADR 048). React reads a {@link FormShape} off the tree and types its
 * customize registrar generically — importing no front-end.
 *
 * Split of responsibility (ADR 048 §2): the front-end projects only the
 * schema-specific facts per path (`value` / `widget` / `description` state),
 * eagerly mapped over its own field paths. Everything below — deriving the
 * pre-narrowed `FieldControl` member and the present parts bag — is neutral and
 * keyed on {@link WidgetName} + {@link DescriptionState}, instantiated lazily only
 * for the paths a handler actually touches.
 */

import type {
  FieldControl,
  FieldPartsBase,
  GroupNode,
  WidgetName,
} from '../parser/nodeTypes'
import type { ValidationError } from '../validation'
import type { WidgetToControlKind } from './present'

/**
 * Whether a path's description part is statically **present**, statically
 * **absent**, or **optional** (unknowable at the type level). A front-end that
 * can prove presence from the schema literal (JSON Schema) reports
 * `'present' | 'absent'`; one that stores descriptions in a runtime registry
 * (Zod) reports `'optional'` — the slot is always placeable but may render
 * nothing (ADR 047 follow-up / ADR 048).
 */
export type DescriptionState = 'present' | 'absent' | 'optional'

// The narrowed DATA payload each present part hands its render prop — Core owns
// these shapes (a React binding wraps each as a `PartComponent<data>`).
type LabelData = FieldPartsBase['label']
type TextData = NonNullable<FieldPartsBase['description']>

/** The pre-narrowed `FieldControl` union member for a widget (neutral Stage B) —
 * so `control.attrs` is the right shape with no runtime `kind` guard. */
export type ControlForWidget<W extends WidgetName> = Extract<
  FieldControl,
  { kind: WidgetToControlKind<W> }
>

/** The `Description` slot contributed by a {@link DescriptionState}: present →
 * required, optional → optional, absent → omitted. */
type DescriptionSlot<D extends DescriptionState> = D extends 'present'
  ? { Description: TextData }
  : D extends 'optional'
    ? { Description?: TextData }
    : object

/**
 * The parts DATA bag for a field, composed from its widget + description state.
 * Neutral (no schema concepts): `Control` is the pre-narrowed member for `W`;
 * `Errors` is runtime validation state; `Description` follows `D`.
 */
export type FieldPartsData<W extends WidgetName, D extends DescriptionState> = {
  Label: LabelData
  Control: ControlForWidget<W>
  Errors: ValidationError[]
} & DescriptionSlot<D>

/** The parts DATA bag for a group/array path (captions only). */
export type GroupPartsData<D extends DescriptionState> = {
  Label: TextData
} & DescriptionSlot<D>

/**
 * The neutral type surface a front-end resolves from its schema and brands onto
 * its tree (ADR 048 §1). Expressed purely in Core vocabulary so React can index
 * it generically. A concrete front-end `FormShapeOf<S>` is a subtype of this.
 */
export interface FormShape {
  fields: Record<
    string,
    { value: unknown; widget: WidgetName; description: DescriptionState }
  >
  groups: Record<string, { description: DescriptionState }>
  arrays: Record<string, { description: DescriptionState }>
}

declare const FORM_SHAPE: unique symbol

/**
 * A `GroupNode` carrying a phantom {@link FormShape} brand (ADR 048 §3). The
 * brand is a compile-time-only property (never present at runtime; asserted by
 * the front-end's return cast), so a `TypedTree` is an ordinary tree everywhere
 * the runtime looks, and only the type layer sees the resolved surface.
 *
 * The brand is **required**, not optional: a plain `GroupNode` (or a tree widened
 * back to `GroupNode`) is therefore NOT assignable to `TypedTree`, so a consumer
 * that hands an unbranded tree to `useRenderNodeRules` gets a loud type error
 * instead of a silent collapse to the permissive base surface (the alternative —
 * an optional phantom — defeats the whole point by accepting anything). It is
 * still never present at runtime; the front-end asserts it through an
 * `as unknown as TypedTree<…>` cast.
 *
 * The second parameter `Origin` threads the front-end's schema origin type
 * through the tree (ADR 033 §4 / bd wo8) exactly as `GroupNode<S>` did, so
 * `getField`/`walk` still surface `facts.origin.schema` at the front-end's type.
 */
export interface TypedTree<TS extends FormShape = FormShape, Origin = unknown>
  extends GroupNode<Origin> {
  readonly [FORM_SHAPE]: TS
}

/** Extract the branded {@link FormShape} from a tree (falls back to the permissive
 * base surface for an unbranded `GroupNode`). Named `TreeShapeOf` — not `ShapeOf`
 * — to avoid colliding with a front-end's own schema-shape helper (e.g. Zod's
 * internal `ShapeOf`). */
export type TreeShapeOf<T> =
  T extends TypedTree<infer TS, infer _Origin> ? TS : FormShape
