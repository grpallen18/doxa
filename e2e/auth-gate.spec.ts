import { test, expect } from '@playwright/test'

/**
 * Every route outside the landing page and the auth flow requires a session.
 * These run unauthenticated, so they assert the gate rather than app content.
 */
test.describe('unauthenticated visitors', () => {
  test('landing page shows the brand and both entry points', async ({ page }) => {
    await page.goto('/welcome')

    await expect(page.getByAltText('DOXA')).toBeVisible()
    await expect(page.getByRole('link', { name: /^sign up$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
  })

  test('home redirects to the landing page', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/welcome$/)
  })

  test('deep link is preserved as the post-login destination', async ({ page }) => {
    await page.goto('/search?q=test')

    await expect(page).toHaveURL(/\/welcome\?redirect=%2Fsearch%3Fq%3Dtest$/)
    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fsearch%3Fq%3Dtest'
    )
    await expect(page.getByRole('link', { name: /^sign up$/i })).toHaveAttribute(
      'href',
      '/auth/sign-up?redirect=%2Fsearch%3Fq%3Dtest'
    )
  })

  test('admin area is not reachable', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/welcome\?redirect=%2Fadmin$/)
  })

  test('api requests get a 401 instead of landing-page html', async ({ request }) => {
    const response = await request.get('/api/admin/health')

    expect(response.status()).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { message: 'Authentication required' },
    })
  })

  test('off-site redirect targets are discarded', async ({ page }) => {
    await page.goto('/welcome?redirect=https://example.com/phish')

    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login')
  })

  test('protocol-relative redirect targets are discarded', async ({ page }) => {
    await page.goto('/welcome?redirect=//example.com/phish')

    await expect(page.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login')
  })
})
