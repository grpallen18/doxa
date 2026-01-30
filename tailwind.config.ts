import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        'muted-soft': 'var(--muted-soft)',
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
        },
      },
      borderRadius: {
        bevel: 'var(--radius-lg)',
        md: 'var(--radius-md)',
      },
      boxShadow: {
        'panel-soft': 'var(--shadow-panel-soft)',
        'panel-hover': 'var(--shadow-panel-hover)',
        'button-primary': 'var(--shadow-button-primary)',
        'button-secondary': 'var(--shadow-button-secondary)',
        'inset-strong': 'var(--shadow-inset-strong)',
        'inset-soft': 'var(--shadow-inset-soft)',
      },
      backgroundColor: {
        surface: 'var(--surface)',
        'surface-soft': 'var(--surface-soft)',
        'surface-section': 'var(--surface-section)',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
      },
    },
  },
  plugins: [],
}
export default config
