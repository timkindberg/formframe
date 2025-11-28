import type { FieldNode } from '@jsonschema-form/core'
import { ReactNode } from 'react'

export interface DefaultFieldProps {
  node: FieldNode
}

/**
 * Default field renderer using the .parts API from core
 * Handles all field types (string, number, boolean, enum)
 */
export function DefaultFieldTemplate({ node }: DefaultFieldProps) {
  const { container, label, description, input, select } = node.parts

  let inputElement: ReactNode

  if (select) {
    inputElement = (
      <select
        {...select.attrs}
        style={{ display: 'block', marginTop: '0.25rem' }}
      >
        <option value="">-- Select --</option>
        {select.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  if (input) {
    inputElement = (
      <input
        {...input.attrs}
        style={{ display: 'block', marginTop: '0.25rem' }}
      />
    )
  }

  return (
    <div key={container.key} style={{ marginBottom: '1rem' }}>
      <label htmlFor={label.attrs.for}>
        {label.text}
        {label.showRequired && <span aria-hidden> *</span>}
      </label>

      {description && (
        <small style={{ display: 'block', color: '#666' }}>
          {description.text}
        </small>
      )}

      {inputElement}
    </div>
  )
}
