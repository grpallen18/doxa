import type { Config } from 'tailwindcss'

const config: Config = {
    darkMode: ['class'],
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
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			'muted-soft': 'var(--muted-soft)',
  			accent: {
  				primary: 'var(--accent-primary)',
  				secondary: 'var(--accent-secondary)',
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			}
  		},
  		borderRadius: {
  			bevel: 'var(--radius-lg)',
  			md: 'calc(var(--radius) - 2px)',
  			lg: 'var(--radius)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			'panel-soft': 'var(--shadow-panel-soft)',
  			'panel-hover': 'var(--shadow-panel-hover)',
  			'button-primary': 'var(--shadow-button-primary)',
  			'button-secondary': 'var(--shadow-button-secondary)',
  			'inset-strong': 'var(--shadow-inset-strong)',
  			'inset-soft': 'var(--shadow-inset-soft)'
  		},
  		backgroundColor: {
  			surface: 'var(--surface)',
  			'surface-soft': 'var(--surface-soft)',
  			'surface-section': 'var(--surface-section)'
  		},
  		borderColor: {
  			subtle: 'var(--border-subtle)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
