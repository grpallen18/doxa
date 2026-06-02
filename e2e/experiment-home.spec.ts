import { test, expect } from '@playwright/test'

test.describe('home', () => {
  test('renders the topic dashboard with wiki position sections', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Immigration', level: 1 })).toBeVisible()
    await expect(page.getByTestId('position-wiki-sections')).toBeVisible()
    await expect(page.getByTestId('position-wiki-section')).toHaveCount(5)
    await expect(page.getByText('On this page')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Border enforcement must come first' })
    ).toBeVisible()
  })

  test('table of contents scrolls to a position section', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Expand legal pathways for migrants' }).click()

    await expect(page.locator('#position-pos-2')).toBeInViewport()
  })

  test('collapse all hides position section bodies', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Collapse all sections' }).click()

    await expect(page.getByText('Secure the border and expand enforcement')).not.toBeVisible()
  })
})
