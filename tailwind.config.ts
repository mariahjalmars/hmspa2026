import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        grass: "#3bb273",
        sun: "#ffd166",
        berry: "#ef476f",
        ocean: "#118ab2",
        ink: "#17202a"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 32, 42, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
