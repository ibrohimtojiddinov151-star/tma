/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: 'var(--tg-theme-bg-color, #ffffff)',
          secondary: 'var(--tg-theme-secondary-bg-color, #f4f4f5)',
          text: 'var(--tg-theme-text-color, #0a0a0a)',
          hint: 'var(--tg-theme-hint-color, #8b8b8f)',
          link: 'var(--tg-theme-link-color, #2b6cb0)',
          accent: 'var(--tg-theme-button-color, #2b6cb0)',
          accentText: 'var(--tg-theme-button-text-color, #ffffff)',
        },
      },
      fontFamily: {
        sys: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      transitionDuration: { DEFAULT: '160ms' },
    },
  },
  plugins: [],
};
