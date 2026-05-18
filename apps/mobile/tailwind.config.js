/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
          950: '#4a044e',
        },
        'morado-flow': '#7F77DD',
        'noche-urbana': '#1A1035',
        'coral-fuego': '#D85A30',
        'blanco-violeta': '#F5F3FF',
        'lavanda-suave': '#EEEDFE',
        'gris-humo': '#6B6880',
      },
    },
  },
  plugins: [],
}
