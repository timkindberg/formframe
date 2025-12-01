import React from 'react'
import type { GroupNode } from '@jsonschema-form/core'

/**
 * Default group renderer using the .parts API from core
 * Renders nested object schemas as fieldsets
 */
export function DefaultGroupTemplate({
  node,
  children,
}: {
  node: GroupNode
  children: React.ReactNode
}) {
  const { container, label, description } = node.parts

  return (
    <fieldset
      key={container.key}
      style={{
        marginBottom: '1rem',
        padding: '1rem',
        border: '1px solid #999',
      }}
    >
      {label && <legend>{label.text}</legend>}
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
      {children}
    </fieldset>
  )
}
