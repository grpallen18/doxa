import { Manrope } from 'next/font/google'

/**
 * App-wide typeface — change only this file to try another Google Font.
 *
 * 1. Swap the import + constructor (e.g. `Lora` → `Merriweather`, `Source_Serif_4`, `Libre_Baskerville`)
 * 2. Adjust `weight` / `subsets` if that family needs it
 * 3. Keep `variable: '--font-app'` so the rest of the system stays wired
 *
 * Catalog: https://fonts.google.com
 */
export const appFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-app',
  display: 'swap',
})
