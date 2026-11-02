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
        plum: { DEFAULT: '#6B2D5C', dark: '#4F1F44', soft: '#F3E8F0' },
        gold: '#B8893B',
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
