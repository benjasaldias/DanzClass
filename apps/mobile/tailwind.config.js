/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
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
        'dark-bg': '#1A1035',
        'dark-surface': '#241547',
        'dark-surface2': '#2E1B5C',
        'dark-border': '#3D2870',
        'dark-text': '#EEEDFE',
        'dark-text2': '#A39BBF',
      },
    },
  },
  plugins: [],
}
