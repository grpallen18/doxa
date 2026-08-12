import { test, expect } from '@playwright/test'

test.describe('consumer explore home', () => {
  test('shows search-first home composition', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Navigate disagreement/i })).toBeVisible()
    await expect(page.getByLabel('Search')).toBeVisible()
    await expect(page.getByText(/Trending controversies/i)).toBeVisible()
  })

  test('search page accepts query', async ({ page }) => {
    await page.goto('/search?q=test')
    await expect(page.getByRole('heading', { name: /Results for/i })).toBeVisible()
  })
})
