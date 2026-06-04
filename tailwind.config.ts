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
  				DEFAULT: 'var(--muted-bg)',
  				foreground: 'var(--muted)'
  			},
  			'muted-soft': 'var(--muted-soft)',
  			accent: {
  				primary: 'var(--accent-primary)',
  				'primary-foreground': 'var(--accent-primary-foreground)',
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
  			success: {
  				DEFAULT: 'var(--success)',
  				foreground: 'var(--success-foreground)'
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
  			muted: 'var(--muted-bg)'
  		},
  		textColor: {
  			muted: 'var(--muted)'
  		},
  		maxWidth: {
  			content: 'var(--content-max-width)'
  		},
  		fontFamily: {
  			cinzel: ['var(--font-cinzel)', 'serif'],
  		},
  		borderColor: {
  			subtle: 'var(--border-subtle)',
  			separator: 'var(--separator)',
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
  					height: '0',
  					opacity: '0'
  				},
  				to: {
  					height: 'var(--radix-collapsible-content-height)',
  					opacity: '1'
  				}
  			},
  			'collapsible-up': {
  				from: {
  					height: 'var(--radix-collapsible-content-height)',
  					opacity: '1'
  				},
  				to: {
  					height: '0',
  					opacity: '0'
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
  			}
  		},
  		animation: {
  			'doxa-letter': 'doxa-letter 1.2s ease-out forwards',
  			'panel-fade-in': 'panel-fade-in 2.5s ease-out forwards',
  			'accordion-down': 'accordion-down 0.3s ease-out',
  			'accordion-up': 'accordion-up 0.3s ease-out',
  			'collapsible-down': 'collapsible-down 0.3s ease-out',
  			'collapsible-up': 'collapsible-up 0.3s ease-out',
  			'skeleton-pulse': 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'advocate-marquee': 'advocate-marquee 12s linear infinite',
  			'advocate-marquee-x': 'advocate-marquee-x 18s linear infinite'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}
export default config
