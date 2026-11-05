import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FBF7F2',
        sand: '#F1E9DF',
        line: '#E6DACB',
        ink: '#2B1B2E',
        night: '#1E1020',
        plum: { DEFAULT: '#6B2D5C', dark: '#4F1F44', soft: '#F3E8F0' },
        // DEFAULT and light are for lines and for text on dark; deep is the only gold that passes AA as text on ivory.
        gold: { DEFAULT: '#B8893B', light: '#E2C07A', deep: '#80591A' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        urdu: ['var(--font-urdu)', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
