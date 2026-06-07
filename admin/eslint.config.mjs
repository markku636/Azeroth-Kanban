// ESLint 9 flat config — 取代已於 Next 16 失效的 `next lint`（legacy .eslintrc.json）。
// 匯入 eslint-config-next 內建的 flat config，並移植本專案既有自訂規則。
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  // 不需 lint 的產物與相依
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'],
  },
  // Next.js 官方推薦（含 React Hooks、a11y、Core Web Vitals）
  ...nextCoreWebVitals,
  // 本專案自訂規則（自 admin/.eslintrc.json 移植）
  {
    rules: {
      // ─── 關閉的規則（與本專案風格不符）───
      'react/no-unescaped-entities': 'off',
      '@next/next/no-page-custom-font': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      // ─── 變數與宣告 ───
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'any', ignoreReadBeforeAssign: false }],

      // ─── 比較與控制流 ───
      // smart：強制值比較用 === / !==，但允許安全的 `== null` / `!= null` 空值守衛
      // （同時涵蓋 null 與 undefined，是本專案慣用且正確的寫法）
      eqeqeq: ['error', 'smart'],
      curly: 'error',
      'dot-notation': 'error',
      'block-scoped-var': 'error',

      // ─── 類別 ───
      'max-classes-per-file': 'error',
      'no-class-assign': 'error',
      'no-const-assign': 'error',
      'no-dupe-class-members': 'error',

      // ─── 可能錯誤（Possible Errors）───
      'getter-return': ['error', { allowImplicit: true }],
      'no-control-regex': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-empty-character-class': 'error',
      'no-ex-assign': 'error',
      'no-func-assign': 'error',
      'no-inner-declarations': 'error',
      'no-obj-calls': 'error',
      'no-unsafe-negation': 'error',
      'require-atomic-updates': 'error',
      'use-isnan': 'error',
      'valid-typeof': ['error', { requireStringLiterals: true }],

      // ─── 最佳實踐（Best Practices）───
      'no-case-declarations': 'error',
      'no-else-return': 'error',
      'no-empty-function': 'error',
      'no-empty-pattern': 'error',
      'no-fallthrough': ['error', { commentPattern: 'break[\\s\\w]*omitted' }],
      'no-global-assign': 'error',
      'no-octal': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-with': 'error',
      'require-await': 'error',
      'no-shadow-restricted-names': 'error',
      'no-lonely-if': 'error',
      // 顯示用全形空白（U+3000）為中文排版刻意使用；仍攔截程式碼間的雜散空白
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipTemplates: true, skipJSXText: true },
      ],

      // ─── ES6+ ───
      'no-duplicate-imports': 'error',
      'require-yield': 'error',

      // ─── React 19 plugin 新增的嚴格規則（命中大量合法樣式，降為 warn 不阻擋）───
      // setState 同步呼叫於 effect（如 setMounted(true) hydration 樣式）
      'react-hooks/set-state-in-effect': 'warn',
      // render 期間呼叫不純函式（如 Date.now() 算相對時間）
      'react-hooks/purity': 'warn',
    },
  },
];

export default eslintConfig;
