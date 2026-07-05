// Minimal type declaration for docusign-esign v9. The upstream package
// ships no TypeScript definitions; we type it as `any` and rely on the
// wrapper in lib/docusign.ts to keep unsafe surface area contained.
declare module 'docusign-esign' {
  // Everything is `any` — only the wrapper touches this module.
  const anything: any;
  export = anything;
}
