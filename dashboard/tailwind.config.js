/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#080b12',
        panel: '#101622',
        borderline: '#202938'
      }
    }
  },
  plugins: []
};

export default config;
