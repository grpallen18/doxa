import { test, expect } from '@playwright/test'

const flagEnabled = process.env.NEXT_PUBLIC_EXPERIMENT_HOME_UI === 'true'

test.describe('experiment home UI', () => {
  test.skip(!flagEnabled, 'Set NEXT_PUBLIC_EXPERIMENT_HOME_UI=true to run experiment specs.')

  test('renders the topic dashboard with five positions', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Immigration', level: 1 })).toBeVisible()
    await expect(page.getByTestId('position-carousel')).toBeVisible()
    await expect(
      page.getByTestId('position-carousel').locator('[data-testid="position-card"]:visible')
    ).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Next positions' })).toBeVisible()
  })

  test('selecting a position shows its detail', async ({ page, isMobile }) => {
    await page.goto('/')

    const headline = 'The immigration system requires balanced reform'
    await page.getByRole('button', { name: new RegExp(headline) }).first().click()

    const detail = page.getByText('Position 3 Selected')
    await expect(detail).toBeVisible()
    await expect(page.getByText('Key Supporting Claims')).toBeVisible()

    if (isMobile) {
      // Mobile renders the detail inside a sheet dialog.
      await expect(page.getByRole('dialog')).toBeVisible()
    }
  })

})
