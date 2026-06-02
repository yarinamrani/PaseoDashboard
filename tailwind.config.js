/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
      colors: {
        paseo: {
          bg: '#0f1115',
          surface: '#1a1d24',
          card: '#21252e',
          border: '#2c313c',
          muted: '#8b93a7',
          text: '#e7eaf0',
          gold: '#d4af37',
          green: '#3ecf8e',
          red: '#f87171',
          amber: '#fbbf24',
          blue: '#60a5fa',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
}
