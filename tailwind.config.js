/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // FM-inspired dark palette
        bg: '#0b0f14',
        surface: '#121821',
        surface2: '#1a2330',
        border: '#243040',
        muted: '#7c8ba1',
        text: '#e6edf5',
        rating: {
          bad: '#e5484d',      // <8
          mid: '#f5a524',      // 8–13
          good: '#30c85e',     // >13
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
