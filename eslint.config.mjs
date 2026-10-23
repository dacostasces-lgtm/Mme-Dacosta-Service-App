import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Les traces et rapports Playwright. Elles embarquent le JavaScript
    // minifié des pages capturées : sans cette ligne, `npm run lint` passait
    // de 1 avertissement à 2243 problèmes selon qu'un test avait échoué
    // depuis — un linter dont le verdict dépend de l'exécution précédente ne
    // sert plus à rien. `.gitignore` les écarte déjà de git, mais la
    // configuration à plat d'ESLint ne le lit pas.
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
