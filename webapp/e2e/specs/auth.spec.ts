import { expect, injectSession, readSeededSession, test } from '../helpers/test'

test('unauthenticated visitor sees the Google sign-in card', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /sign in to open your account/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('an authenticated session lands straight in the app and signs out', async ({ page }) => {
  const seeded = readSeededSession()
  test.skip(
    seeded === null,
    'No seeded Supabase session (set SUPABASE_SERVICE_ROLE_KEY to run the authenticated flow).',
  )

  await injectSession(page, seeded!)

  // Signed-in users land directly on the account view — no intermediate screen.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: seeded!.displayName })).toBeVisible()
  await expect(page.getByText(seeded!.email)).toBeVisible()

  // Session survives a reload (supabase-js reads it back from localStorage).
  await page.reload()
  await expect(page.getByRole('heading', { name: seeded!.displayName })).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})
