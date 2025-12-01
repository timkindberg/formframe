import React from 'react'

/**
 * Default root renderer for the form wrapper
 * Renders a <form> element with children and submit button
 */
export function DefaultRootTemplate({
  onSubmit,
  children,
}: {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  children: React.ReactNode
}) {
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
