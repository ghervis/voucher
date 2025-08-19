import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    paths: {
      base: process.env.NODE_ENV === "production" ? "/sveltekit-gh-pages" : "",
    },
    typescript: {
      config: (config) => {
        return {
          ...config,
          compilerOptions: {
            ...config.compilerOptions,
            allowJs: true,
            checkJs: true,
          },
        };
      },
    },
  },
};

export default config;
