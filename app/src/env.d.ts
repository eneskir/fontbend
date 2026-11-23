// Vite bundles imported stylesheets; TypeScript only needs to know the import is allowed.
declare module "*.css";

// Vite reads these files as text.
declare module "*?raw" {
  const text: string;
  export default text;
}
