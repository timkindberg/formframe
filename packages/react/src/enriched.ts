// React instantiations of Core's enriched handles (R = ReactNode).
// One declaration each — a second `type EField = …` in another file makes
// Quick Info print `EField$1`.

import type { ReactNode } from 'react'
import type {
  EArray as CoreEArray,
  EArrayItem as CoreEArrayItem,
  EField as CoreEField,
  EGroup as CoreEGroup,
  ENode as CoreENode,
} from '@formframe/core'

export type ENode<S = unknown> = CoreENode<ReactNode, S>
export type EField<S = unknown> = CoreEField<ReactNode, S>
export type EGroup<S = unknown> = CoreEGroup<ReactNode, S>
export type EArray<S = unknown> = CoreEArray<ReactNode, S>
export type EArrayItem<S = unknown> = CoreEArrayItem<ReactNode, S>
