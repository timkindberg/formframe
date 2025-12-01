import React, { useState, createContext, useContext } from 'react'
import type { ArrayNode, ArrayItemNode, WalkHandlers } from '@jsonschema-form/core'

// ============================================================================
// Context
// ============================================================================

export const ArrayItemContext = createContext<{
  removeItem: () => void
  canRemove: boolean
} | null>(null)

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for managing dynamic array fields with add/remove functionality
 */
export function useArrayField(arrayNode: ArrayNode) {
  // Start with initial children (respects minItems)
  const [items, setItems] = useState<ArrayItemNode[]>(
    arrayNode.children as ArrayItemNode[]
  )

  const addItem = () => {
    const newIndex = items.length
    const newItem = arrayNode.getItem(newIndex)
    setItems([...items, newItem])
  }

  const removeItem = (index: number) => {
    // Check minItems constraint
    const minItems = arrayNode.validation.minItems ?? 0
    if (items.length <= minItems) {
      return // Cannot remove below minItems
    }

    setItems((currentItems) => currentItems.filter((_, i) => i !== index))
  }

  const minItems = arrayNode.validation.minItems ?? 0
  const canRemove = items.length > minItems

  return {
    items,
    addItem,
    removeItem,
    canRemove,
  }
}

/**
 * Hook to access ArrayContext from within an array item component
 */
export function useArrayItem() {
  const context = useContext(ArrayItemContext)
  if (!context) {
    throw new Error('useArrayItem must be used within an ArrayItemContext.Provider')
  }
  return context
}

// ============================================================================
// Components
// ============================================================================

/**
 * Default array renderer using the .parts API from core
 * Renders dynamic arrays with add/remove functionality
 */
export function DefaultArrayTemplate({
  node,
  handlers,
}: {
  node: ArrayNode
  handlers: WalkHandlers<JSX.Element>
}) {
  const { items, addItem, removeItem, canRemove } = useArrayField(node)
  const { container, label, description, itemsContainer, addButton } = node.parts

  return (
    <div
      key={container.key}
      style={{
        marginBottom: '1rem',
        padding: '1rem',
        border: '1px solid #666',
      }}
    >
      {label && (
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{label.text}</h3>
      )}
      {description && (
        <small
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: '#666',
          }}
        >
          {description.text}
        </small>
      )}

      <div key={itemsContainer.key}>
        {items.map((item, index) => (
          <ArrayItemContext.Provider
            key={item.path}
            value={{ removeItem: () => removeItem(index), canRemove }}
          >
            {handlers.arrayItem
              ? handlers.arrayItem(item, handlers)
              : item.walk(handlers)}
          </ArrayItemContext.Provider>
        ))}
      </div>

      <button
        type={addButton.attrs.type}
        onClick={addItem}
        style={{ marginTop: '0.5rem' }}
      >
        {addButton.label}
      </button>
    </div>
  )
}

/**
 * Default array item renderer using the .parts API from core
 * Renders individual array items with remove button
 */
export function DefaultArrayItemTemplate({
  node,
  children,
}: {
  node: ArrayItemNode
  children: React.ReactNode
}) {
  const { removeItem, canRemove } = useArrayItem()
  const { container, removeButton } = node.parts

  return (
    <div
      key={container.key}
      style={{
        marginBottom: '0.5rem',
        padding: '0.5rem',
        border: '1px solid #ccc',
      }}
    >
      <div style={{ marginBottom: '0.5rem', backgroundColor: 'white' }}>
        {children}
      </div>
      <button
        type={removeButton.attrs.type}
        onClick={removeItem}
        disabled={!canRemove}
      >
        {removeButton.label}
      </button>
    </div>
  )
}
