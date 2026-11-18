import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// ESLint en ligne de commande (`next lint` n'existe plus en Next.js 16) : règles Next.js, React, React Hooks et
// TypeScript ; Prettier se charge de la mise en forme (eslint-config-prettier coupe les règles de forme).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      // Une variable préfixée par « _ » est volontairement ignorée (déstructuration pour retirer un champ).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/pdf.worker.min.mjs",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "imports-local/**",
    ".netlify/**",
  ]),
]);

export default eslintConfig;
