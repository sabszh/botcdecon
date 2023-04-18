/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      blur: {
        DEFAULT: '0.02em'
      }
    },
  },
  plugins: [],
}
