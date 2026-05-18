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
          100: '#DDDAF2',
          200: '#BDB7E4',
          300: '#9D94D6',
          400: '#7268C5',
          500: '#4D41AA',
          600: '#2D1B69',
          700: '#221452',
          800: '#160D38',
          900: '#0D0821',
          950: '#070410',
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
