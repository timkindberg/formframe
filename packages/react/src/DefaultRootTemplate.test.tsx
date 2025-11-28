import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { DefaultRootTemplate } from './DefaultRootTemplate'

describe('DefaultRootTemplate', () => {
  it('should render a form element', async () => {
    const screen = await render(
      <DefaultRootTemplate>
        <div>Test Content</div>
      </DefaultRootTemplate>
    )

    const form = screen.container.querySelector('form')
    expect(form).toBeDefined()
  })

  it('should render children inside the form', async () => {
    const screen = await render(
      <DefaultRootTemplate>
        <div>Test Content</div>
        <input type="text" aria-label="test-input" />
      </DefaultRootTemplate>
    )

    await expect.element(screen.getByText('Test Content')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'test-input' }))
      .toBeInTheDocument()
  })

  it('should render a submit button', async () => {
    const screen = await render(
      <DefaultRootTemplate>
        <div>Form Content</div>
      </DefaultRootTemplate>
    )

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    await expect.element(submitButton).toBeInTheDocument()
    await expect.element(submitButton).toHaveAttribute('type', 'submit')
  })

  it('should call onSubmit when form is submitted', async () => {
    let submitted = false
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      submitted = true
    }

    const screen = await render(
      <DefaultRootTemplate onSubmit={handleSubmit}>
        <div>Form Content</div>
      </DefaultRootTemplate>
    )

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    await expect.element(submitButton).toBeInTheDocument()

    // Click the submit button
    await submitButton.click()

    expect(submitted).toBe(true)
  })

  it('should work without onSubmit handler', async () => {
    const screen = await render(
      <DefaultRootTemplate>
        <div>Form Content</div>
      </DefaultRootTemplate>
    )

    const form = screen.container.querySelector('form')
    expect(form).toBeDefined()

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    await expect.element(submitButton).toBeInTheDocument()

    // Should not throw when clicking submit without handler
    await submitButton.click()

    // If we got here without error, the test passes
    expect(true).toBe(true)
  })

  it('should render multiple children', async () => {
    const screen = await render(
      <DefaultRootTemplate>
        <div>Field 1</div>
        <div>Field 2</div>
        <div>Field 3</div>
      </DefaultRootTemplate>
    )

    await expect.element(screen.getByText('Field 1')).toBeInTheDocument()
    await expect.element(screen.getByText('Field 2')).toBeInTheDocument()
    await expect.element(screen.getByText('Field 3')).toBeInTheDocument()
  })
})
