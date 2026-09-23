/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cap: {
          blue: '#00274D',      // CAP dress blue
          blue2: '#0B3D6E',
          skyblue: '#4A90D9',
          gold: '#C8A951',
          red: '#B0202E',
          silver: '#B7C0C7',
        },
      },
      fontFamily: {
        display: ['"Oswald"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      backgroundImage: {
        'cap-gradient': 'linear-gradient(135deg, #00274D 0%, #0B3D6E 55%, #143d63 100%)',
      },
    },
  },
  plugins: [],
};
