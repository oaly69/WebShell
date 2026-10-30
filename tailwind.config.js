/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fs: {
          bg: 'rgb(var(--fs-bg) / <alpha-value>)',
          surface: 'rgb(var(--fs-surface) / <alpha-value>)',
          border: 'rgb(var(--fs-border) / <alpha-value>)',
          hover: 'rgb(var(--fs-hover) / <alpha-value>)',
          active: 'rgb(var(--fs-active) / <alpha-value>)',
          text: 'rgb(var(--fs-text) / <alpha-value>)',
          textMuted: 'rgb(var(--fs-text-muted) / <alpha-value>)',
          primary: 'rgb(var(--fs-primary) / <alpha-value>)',
          primaryHover: 'rgb(var(--fs-primary-hover) / <alpha-value>)',
          accent: 'rgb(var(--fs-accent) / <alpha-value>)',
          danger: 'rgb(var(--fs-danger) / <alpha-value>)',
          warning: 'rgb(var(--fs-warning) / <alpha-value>)',
          info: 'rgb(var(--fs-info) / <alpha-value>)',
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
