/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fs: {
          bg: '#181a1f',
          surface: '#21252b',
          border: '#2c313a',
          hover: '#282c34',
          active: '#313640',
          text: '#abb2bf',
          textMuted: '#5c6370',
          primary: '#4d78cc',
          primaryHover: '#5c87db',
          accent: '#98c379',
          danger: '#e06c75',
          warning: '#e5c07b',
          info: '#61afef',
        },
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'Cascadia Code',
          'Fira Code',
          'Menlo',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
