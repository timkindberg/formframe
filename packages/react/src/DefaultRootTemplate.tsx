import React from 'react'

export interface DefaultRootProps {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  children: React.ReactNode
}

/**
 * Default root renderer for the form wrapper
 * Renders a <form> element with children and submit button
 */
export function DefaultRootTemplate({ onSubmit, children }: DefaultRootProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <form onSubmit={handleSubmit}>
      {children}
      <button type="submit">Submit</button>
    </form>
  )
}
