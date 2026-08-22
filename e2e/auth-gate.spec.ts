import { test, expect } from '@playwright/test'

/**
 * Every route outside the landing page and the auth flow requires a session.
 * These run unauthenticated, so they assert the gate rather than app content.
 * Explore home lives at `/home`; `/` is marketing-only.
 */
test.describe('unauthenticated visitors', () => {
  test('root shows the brand and both entry points', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByAltText('DOXA')).toBeVisible()
    await expect(page.getByRole('link', { name: /^sign up$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
  })

  test('the old /welcome URL redirects to the root', async ({ page }) => {
    await page.goto('/welcome')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
  })

  test('deep link is preserved as the post-login destination', async ({ page }) => {
    await page.goto('/search?q=test')

    await expect(page).toHaveURL(/\/\?redirect=%2Fsearch%3Fq%3Dtest$/)
    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fsearch%3Fq%3Dtest'
    )
    await expect(page.getByRole('link', { name: /^sign up$/i })).toHaveAttribute(
      'href',
      '/auth/sign-up?redirect=%2Fsearch%3Fq%3Dtest'
    )
  })

  test('explore home requires a session', async ({ page }) => {
    await page.goto('/home')

    await expect(page).toHaveURL(/\/\?redirect=%2Fhome$/)
    await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
  })

  test('admin area is not reachable', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/\?redirect=%2Fadmin$/)
  })

  test('api requests get a 401 instead of landing-page html', async ({ request }) => {
    const response = await request.get('/api/admin/observability/pipeline-counts')

    expect(response.status()).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { message: 'Authentication required' },
    })
  })

  test('off-site redirect targets are discarded', async ({ page }) => {
    await page.goto('/?redirect=https://example.com/phish')

    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login')
  })

  test('protocol-relative redirect targets are discarded', async ({ page }) => {
    await page.goto('/?redirect=//example.com/phish')

    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login')
  })
})
