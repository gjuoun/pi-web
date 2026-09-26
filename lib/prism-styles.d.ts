// @types/react-syntax-highlighter declares these style modules without the `.js` suffix, but
// Node's plain ESM loader (used by `node --experimental-strip-types --test`) requires the
// explicit extension for these extensionless CJS files. These ambient re-exports let tsc treat
// the `.js`-suffixed specifiers the same as the ones already typed upstream.
declare module "react-syntax-highlighter/dist/cjs/styles/prism/one-light.js" {
  export { default } from "react-syntax-highlighter/dist/cjs/styles/prism/one-light";
}
declare module "react-syntax-highlighter/dist/cjs/styles/prism/one-dark.js" {
  export { default } from "react-syntax-highlighter/dist/cjs/styles/prism/one-dark";
}
declare module "react-syntax-highlighter/dist/cjs/styles/prism/ghcolors.js" {
  export { default } from "react-syntax-highlighter/dist/cjs/styles/prism/ghcolors";
}
declare module "react-syntax-highlighter/dist/cjs/styles/prism/dracula.js" {
  export { default } from "react-syntax-highlighter/dist/cjs/styles/prism/dracula";
}
