import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEEDF9',
          100: '#DDDCF3',
          200: '#BCBAE7',
          300: '#9A97DC',
          400: '#6965C5',
          500: '#3E3A99',
          600: '#1A1035',
          700: '#140D29',
          800: '#0D081C',
          900: '#070512',
          950: '#030209',
        },
        'morado-flow': '#7F77DD',
        'noche-urbana': '#1A1035',
        'coral-fuego': '#D85A30',
        'blanco-violeta': '#F5F3FF',
        'lavanda-suave': '#EEEDFE',
        'gris-humo': '#6B6880',
        'violeta-oscuro': '#534AB7',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
