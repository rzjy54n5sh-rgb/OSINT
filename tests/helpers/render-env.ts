/**
 * Unit-test helper for react-dom/server render checks under plain Node (tsx, CommonJS). Import it FIRST:
 *  - `*.module.css` resolves to a proxy mapping each class name to itself (`s.card` -> "card");
 *  - tsconfig's `jsx: preserve` makes tsx emit classic `React.createElement`, so React is made global.
 */
import * as React from 'react';

type Loader = (m: { exports: unknown }, filename: string) => void;
const exts = (require as unknown as { extensions: Record<string, Loader> }).extensions;
exts['.css'] = (m) => {
  m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : String(k)) });
};
(globalThis as unknown as { React: typeof React }).React = React;
export {};
