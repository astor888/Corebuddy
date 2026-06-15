import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // WorkBuddy color system
        primary: '#165DFF',
        'primary-light': '#E8F3FF',
        'bg-primary': '#FFFFFF',
        'bg-secondary': '#FAFBFC',
        'bg-tertiary': '#F7F8FA',
        'bg-hover': '#F2F3F5',
        'text-primary': '#1D2129',
        'text-secondary': '#4E5969',
        'text-tertiary': '#86909C',
        'text-disabled': '#C9CDD4',
        'border-light': '#E5E6EB',
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '1.5' }],
        'sm': ['12px', { lineHeight: '1.6' }],
        'base': ['13px', { lineHeight: '1.7' }],
        'lg': ['14px', { lineHeight: '1.7' }],
        'xl': ['15px', { lineHeight: '1.6' }],
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
      },
    },
  },
  plugins: [],
} satisfies Config
