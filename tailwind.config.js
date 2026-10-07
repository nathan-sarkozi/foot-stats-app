/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: '#f4f6f8',
          100: '#e3e8ee',
          200: '#cbd4e1',
          300: '#a5b7c9',
          400: '#7994ac',
          500: '#587792',
          600: '#435e76', 
          700: '#374c61',
          800: '#304151',
          900: '#2b3846',
          950: '#1d2630',
        },
        slate: {
          50: '#fafafa', 
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
        }
      }
    },
  },
  plugins: [],
};