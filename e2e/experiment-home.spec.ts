import { test, expect } from '@playwright/test'

test.describe('topic and position pages', () => {
  test('topic page summarizes positions with links', async ({ page }) => {
    await page.goto('/topics/immigration')

    await expect(page.getByRole('heading', { name: 'Immigration', level: 1 })).toBeVisible()
    await expect(page.getByTestId('topic-summary')).toBeVisible()
    await expect(page.getByTestId('position-topic-list')).toBeVisible()
    await expect(page.getByTestId('position-topic-link')).toHaveCount(5)
    await expect(page.getByText('Table of Contents')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Positions' })).toBeVisible()
  })

  test('navigates from topic page to position page and back', async ({ page }) => {
    await page.goto('/topics/immigration')

    await page.getByRole('link', { name: /Border enforcement must come first/i }).click()
    await expect(page).toHaveURL('/topics/immigration/positions/pos-1')
    await expect(
      page.getByRole('heading', {
        name: 'Immigration Should Be Significantly Reduced',
        level: 1,
      })
    ).toBeVisible()
    await expect(page.getByTestId('position-narrative')).toBeVisible()
    await expect(page.getByTestId('position-popularity-snapshot')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Immigration Should Be Significantly Reduced' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Economic effects' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'See also' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Primary claims' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Counter claims' })).toBeVisible()
    await expect(page.getByTestId('position-primary-claims').getByRole('listitem')).toHaveCount(10)
    await expect(page.getByTestId('position-counter-claim-link')).toHaveCount(8)

    await page.getByTestId('position-back-link').click()
    await expect(page).toHaveURL('/topics/immigration')
    await expect(page.getByRole('heading', { name: 'Immigration', level: 1 })).toBeVisible()
  })

  test('sidebar links to position pages', async ({ page }) => {
    await page.goto('/topics/immigration')

    await page.getByRole('link', { name: 'Expand legal pathways for migrants' }).click()
    await expect(page).toHaveURL('/topics/immigration/positions/pos-2')
    await expect(page.getByText('Table of Contents')).toBeVisible()
    await expect(page.getByTestId('sidebar-back-link')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Key supporting claims' })).toBeVisible()
  })
})
