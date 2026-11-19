// A stylesheet, an image, or a Markdown file the tool imports as a file: the import gives its path, which `assets.ts` checks.
declare module "*.svg" {
  const path: unknown;
  export default path;
}
declare module "*.css" {
  const path: unknown;
  export default path;
}
declare module "*.md" {
  const path: unknown;
  export default path;
}
