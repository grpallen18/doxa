import type { Config } from 'tailwindcss'

const config: Config = {
    darkMode: ['class'],
    content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			inverted: 'var(--inverted)',
  		muted: {
  				DEFAULT: 'var(--muted-bg)',
  				foreground: 'var(--muted)'
  			},
  			accent: {
  				primary: 'var(--accent-primary)',
  				'primary-foreground': 'var(--accent-primary-foreground)',
  				secondary: 'var(--accent-secondary)',
  				'secondary-foreground': 'var(--accent-secondary-foreground)',
  				tertiary: 'var(--accent-tertiary)',
  				'tertiary-foreground': 'var(--accent-tertiary-foreground)',
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
  			success: {
  				DEFAULT: 'var(--success)',
  				foreground: 'var(--success-foreground)'
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			'link-default-blue': 'var(--link-default-blue)',
  			'link-default-blue-hover': 'var(--link-default-blue-hover)',
  			'link-default-green': 'var(--link-default-green)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
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
  			'surface-section': 'var(--surface-section)',
  			'surface-canvas': 'var(--surface-canvas)',
  			muted: 'var(--muted-bg)'
  		},
  		textColor: {
  			muted: 'var(--muted)',
  			inverted: 'var(--inverted)',
  		},
  		maxWidth: {
  			content: 'var(--content-max-width)'
  		},
  		fontFamily: {
  			sans: ['var(--font-app)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			serif: ['var(--font-app)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-app)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  		},
  		borderColor: {
  			subtle: 'var(--border-subtle)',
  			muted: 'var(--border-muted)',
  		},
  		transitionDuration: {
  			'400': '400ms',
  			'1400': '1400ms',
  		},
  		keyframes: {
  			'doxa-letter': {
  				'0%': {
  					opacity: '0'
  				},
  				'100%': {
  					opacity: '1'
  				}
  			},
  			'doxa-logo-ltr': {
  				'0%': {
  					opacity: '0',
  					maskPosition: '100% 0',
  					WebkitMaskPosition: '100% 0',
  				},
  				'100%': {
  					opacity: '1',
  					maskPosition: '0% 0',
  					WebkitMaskPosition: '0% 0',
  				},
  			},
  			/*
  			  Bottom-to-top reveal of the statue. Positions are not evenly spaced
  			  on purpose: the figure's ink varies hugely down its height (a hem
  			  dissolving into the marble, a wide robe, a narrow head), so a
  			  constant-speed sweep delivers 2% of it in the first sixth of the
  			  travel and then surges — a faint ghost followed by an abrupt fill
  			  that reads as two separate fades. These stops come from inverting
  			  the measured ink-vs-position curve, so the edge moves fast where the
  			  figure is sparse and slow where it is dense, materializing it at an
  			  even rate. Pair with linear timing; the ease is in the spacing.

  			  Regenerate with the alpha profile printed by
  			  scripts/build-landing-statue.mjs if the artwork or its fade changes.
  			*/
  			'statue-btt': {
  				'0%': { maskPosition: '0 0%', WebkitMaskPosition: '0 0%' },
  				'4.1667%': { maskPosition: '0 12.294%', WebkitMaskPosition: '0 12.294%' },
  				'8.3333%': { maskPosition: '0 18.091%', WebkitMaskPosition: '0 18.091%' },
  				'12.5%': { maskPosition: '0 22.928%', WebkitMaskPosition: '0 22.928%' },
  				'16.6667%': { maskPosition: '0 27.353%', WebkitMaskPosition: '0 27.353%' },
  				'20.8333%': { maskPosition: '0 31.44%', WebkitMaskPosition: '0 31.44%' },
  				'25%': { maskPosition: '0 35.3%', WebkitMaskPosition: '0 35.3%' },
  				'29.1667%': { maskPosition: '0 38.968%', WebkitMaskPosition: '0 38.968%' },
  				'33.3333%': { maskPosition: '0 42.434%', WebkitMaskPosition: '0 42.434%' },
  				'37.5%': { maskPosition: '0 45.723%', WebkitMaskPosition: '0 45.723%' },
  				'41.6667%': { maskPosition: '0 48.903%', WebkitMaskPosition: '0 48.903%' },
  				'45.8333%': { maskPosition: '0 52.032%', WebkitMaskPosition: '0 52.032%' },
  				'50%': { maskPosition: '0 55.146%', WebkitMaskPosition: '0 55.146%' },
  				'54.1667%': { maskPosition: '0 58.262%', WebkitMaskPosition: '0 58.262%' },
  				'58.3333%': { maskPosition: '0 61.398%', WebkitMaskPosition: '0 61.398%' },
  				'62.5%': { maskPosition: '0 64.607%', WebkitMaskPosition: '0 64.607%' },
  				'66.6667%': { maskPosition: '0 68.016%', WebkitMaskPosition: '0 68.016%' },
  				'70.8333%': { maskPosition: '0 72.012%', WebkitMaskPosition: '0 72.012%' },
  				'75%': { maskPosition: '0 77.188%', WebkitMaskPosition: '0 77.188%' },
  				'79.1667%': { maskPosition: '0 82.355%', WebkitMaskPosition: '0 82.355%' },
  				'83.3333%': { maskPosition: '0 86.441%', WebkitMaskPosition: '0 86.441%' },
  				'87.5%': { maskPosition: '0 89.745%', WebkitMaskPosition: '0 89.745%' },
  				'91.6667%': { maskPosition: '0 92.722%', WebkitMaskPosition: '0 92.722%' },
  				'95.8333%': { maskPosition: '0 95.848%', WebkitMaskPosition: '0 95.848%' },
  				'100%': { maskPosition: '0 100%', WebkitMaskPosition: '0 100%' },
  			},
  			'panel-fade-in': {
  				'0%': {
  					opacity: '0'
  				},
  				'100%': {
  					opacity: '1'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'collapsible-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-collapsible-content-height)'
  				}
  			},
  			'collapsible-up': {
  				from: {
  					height: 'var(--radix-collapsible-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'skeleton-pulse': {
  				'0%, 100%': { opacity: '0.4' },
  				'50%': { opacity: '0.8' }
  			},
  			'advocate-marquee': {
  				'0%': { transform: 'translateY(0)' },
  				'100%': { transform: 'translateY(-50%)' }
  			},
  			'advocate-marquee-x': {
  				'0%': { transform: 'translateX(0)' },
  				'100%': { transform: 'translateX(-50%)' }
  			},
			'stats-marquee-x': {
				'0%': { transform: 'translateX(0)' },
				'100%': { transform: 'translateX(-50%)' }
			},
			'metric-swap-out': {
				'0%': { opacity: '1' },
				'100%': { opacity: '0' },
			},
			'metric-swap-in': {
				'0%': { opacity: '0' },
				'100%': { opacity: '1' },
			},
		},
		animation: {
			'doxa-letter': 'doxa-letter 1.2s ease-out forwards',
			'doxa-logo-ltr': 'doxa-logo-ltr 1.8s ease-out both',
			'statue-btt': 'statue-btt 2.4s linear both',
			'panel-fade-in': 'panel-fade-in 2.5s ease-out forwards',
			'accordion-down': 'accordion-down 0.3s ease-out',
			'accordion-up': 'accordion-up 0.3s ease-out',
			'collapsible-down': 'collapsible-down 0.3s ease-out',
			'collapsible-up': 'collapsible-up 0.3s ease-out',
			'skeleton-pulse': 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
			'advocate-marquee': 'advocate-marquee 12s linear infinite',
			'advocate-marquee-x': 'advocate-marquee-x 18s linear infinite',
			'stats-marquee-x': 'stats-marquee-x 45s linear infinite',
			'metric-swap-out': 'metric-swap-out 1200ms ease-in-out forwards',
			'metric-swap-in': 'metric-swap-in 1200ms ease-in-out forwards',
			'metric-swap-out-fast': 'metric-swap-out 400ms ease-in-out forwards',
		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}
export default config
