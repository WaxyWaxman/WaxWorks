import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Prototype only. Base is relative so a static build can be opened from any path.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5273, open: true },
});
