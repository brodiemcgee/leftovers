import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111315',
        canvas: '#FAF8F4',
        accent: '#0F766E',
      },
      fontFamily: {
        display: ['"Söhne"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
