/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gemini: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a4bcfd',
          400: '#7c98fb',
          500: '#526ef5',
          600: '#3b52ea',
          700: '#2c3dd4',
          800: '#2734ab',
          900: '#253086',
        },
        dark: {
          bg: '#131314',
          surface: '#1e1f20',
          hover: '#282a2c',
          border: '#333538',
          text: '#e3e3e3',
          muted: '#8e9196'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      }
    },
  },
  plugins: [],
}

