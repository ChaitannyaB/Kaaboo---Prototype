/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        panel: '#161b22',
        panelAlt: '#1f2630',
        border: '#30363d',
        ink: '#c9d1d9',
        inkDim: '#8b949e',
        accent: '#d4af37',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  important: true,
  plugins: [],
};
