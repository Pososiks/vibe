import { expect, test } from 'bun:test'
import { profileSchema } from './auth'

const validId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

test('profileSchema accepts a valid profile row', () => {
  const parsed = profileSchema.parse({
    id: validId,
    email: 'user@example.com',
    displayName: 'Jane',
    createdAt: '2026-06-15T00:00:00.000Z',
  })
  expect(parsed.email).toBe('user@example.com')
  expect(parsed.displayName).toBe('Jane')
})

test('profileSchema allows a null display name', () => {
  const parsed = profileSchema.parse({
    id: validId,
    email: 'user@example.com',
    displayName: null,
    createdAt: '2026-06-15T00:00:00.000Z',
  })
  expect(parsed.displayName).toBeNull()
})

test('profileSchema normalizes and rejects emails consistently', () => {
  expect(
    profileSchema.parse({
      id: validId,
      email: ' USER@Example.COM ',
      displayName: null,
      createdAt: '2026-06-15T00:00:00.000Z',
    }).email,
  ).toBe('user@example.com')

  const result = profileSchema.safeParse({
    id: validId,
    email: 'not-an-email',
    displayName: null,
    createdAt: '2026-06-15T00:00:00.000Z',
  })
  expect(result.success).toBe(false)
})
