import { defineConfig } from "astro/config";

// Set `site` to your production URL before deploying (for canonical URLs / sitemap).
export default defineConfig({
  output: "static",
  trailingSlash: "never",
});
