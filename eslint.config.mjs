import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

const compat = new FlatCompat({
  baseDirectory: currentDirectory
});

const config = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript")
];

export default config;
