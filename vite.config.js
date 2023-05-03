// vite.config.js
import string from "vite-plugin-string";

export default {
  plugins: [
    string({
      include: "**/*.glsl", // You can specify any pattern to match your .glsl files
    }),
  ],
};
