import React from 'react'

export interface DefaultRootProps {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  children: React.ReactNode
}

/**
 * Default root renderer for the form wrapper
 * Renders a <form> element with children and submit button
 */
export function DefaultRootTemplate({
  onSubmit,
  children,
}: DefaultRootProps) {
  return (
    <form onSubmit={onSubmit}>
      {children}
      <button type="submit">Submit</button>
    </form>
  )
}
