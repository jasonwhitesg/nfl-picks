// Lets TypeScript accept plain stylesheet imports like `import "./globals.css"`.
// Newer TypeScript versions (including the one built into VS Code) flag them otherwise.
declare module "*.css";
