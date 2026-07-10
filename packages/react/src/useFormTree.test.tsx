import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { z } from 'zod'
import { zodToTree } from '@jsonschema-form/input-zod'
import { createZodValidator } from '@jsonschema-form/validation-zod'
import { useFormTree, ValidationProvider } from './index'

const schema = z.object({
  name: z.string().min(2).meta({ title: 'Name' }),
})
const tree = zodToTree(schema)
const validator = createZodValidator(schema)

describe('useFormTree', () => {
  it('binds rendering, submission, and validation to a Zod-built tree', async () => {
    const onValid = vi.fn()

    function Harness() {
      const { SchemaFields, submit, errors, submitted } = useFormTree(tree, {
        validator,
      })

      return (
        <form noValidate onSubmit={submit(onValid)}>
          <ValidationProvider issues={errors} submitted={submitted}>
            <SchemaFields />
          </ValidationProvider>
          <button type="submit">Submit</button>
        </form>
      )
    }

    const screen = await render(<Harness />)
    const submit = screen.getByRole('button', { name: 'Submit' })

    await submit.click()
    await expect
      .poll(() => document.querySelectorAll('.jsf-field-errors').length)
      .toBe(1)
    expect(onValid).not.toHaveBeenCalled()

    await screen.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await submit.click()

    await expect.poll(() => onValid.mock.calls.length).toBe(1)
    expect(onValid).toHaveBeenCalledWith({ name: 'Ada' })
  })
})
