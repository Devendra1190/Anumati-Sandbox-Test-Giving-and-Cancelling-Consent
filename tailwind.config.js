/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172d3a",
        muted: "#74838d",
        canvas: "#f5f8fa",
        teal: {
          50: "#eaf8f6",
          100: "#d1f0eb",
          500: "#24a696",
          600: "#168a7d",
          700: "#126f66"
        }
      },
      boxShadow: {
        card: "0 2px 12px rgba(29, 59, 73, .045)"
      }
    }
  },
  plugins: []
};
