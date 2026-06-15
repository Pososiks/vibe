import { expect, test } from 'bun:test'

import { apiErrorSchema } from './index'

test('validates stable API error response shape', () => {
  expect(
    apiErrorSchema.parse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [{ path: ['email'], message: 'Invalid email address' }],
      },
    }),
  ).toEqual({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      details: [{ path: ['email'], message: 'Invalid email address' }],
    },
  })
})

test('rejects unknown API error codes', () => {
  expect(() =>
    apiErrorSchema.parse({
      error: {
        code: 'SOMETHING_ELSE',
        message: 'Nope',
      },
    }),
  ).toThrow()
})
