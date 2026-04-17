/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './misc/*.html',
    '!./misc/my-weather-app/**',
    './readme/*.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        mongo: {
          bg: '#001E2B',
          bg2: '#002838',
          card: '#003345',
          cardHover: '#004058',
          accent: '#00ED64',
          accentDim: '#00c853',
          textPri: '#fafafa',
          textSec: '#b8d8e8',
          textMuted: '#7fa8bc',
        },
      },
    },
  },
  plugins: [],
};
