// scripts/generate-og-image.mjs
// Run once: node scripts/generate-og-image.mjs
// Requires: npm install --save-dev @resvg/resvg-js
// Then this script can be deleted.

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'fs';

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#070A0F"/>
  <!-- Grid lines -->
  <line x1="0" y1="0" x2="1200" y2="630" stroke="#1a2030" stroke-width="1" opacity="0.5"/>
  <line x1="1200" y1="0" x2="0" y2="630" stroke="#1a2030" stroke-width="1" opacity="0.5"/>
  <!-- Corner brackets -->
  <path d="M40 40 L40 80 M40 40 L80 40" stroke="#E8C547" stroke-width="2" fill="none"/>
  <path d="M1160 40 L1160 80 M1160 40 L1120 40" stroke="#E8C547" stroke-width="2" fill="none"/>
  <path d="M40 590 L40 550 M40 590 L80 590" stroke="#E8C547" stroke-width="2" fill="none"/>
  <path d="M1160 590 L1160 550 M1160 590 L1120 590" stroke="#E8C547" stroke-width="2" fill="none"/>
  <!-- Diamond mark -->
  <text x="600" y="220" font-family="monospace" font-size="24" fill="#E8C547" text-anchor="middle" letter-spacing="8">◆ MENA INTEL DESK</text>
  <!-- Main title -->
  <text x="600" y="310" font-family="monospace" font-size="52" font-weight="bold" fill="#F0F0F0" text-anchor="middle" letter-spacing="6">INTELLIGENCE</text>
  <text x="600" y="370" font-family="monospace" font-size="52" font-weight="bold" fill="#F0F0F0" text-anchor="middle" letter-spacing="6">PLATFORM</text>
  <!-- Subtitle -->
  <text x="600" y="430" font-family="monospace" font-size="14" fill="#666E82" text-anchor="middle" letter-spacing="3">US-IRAN CONFLICT · 29 COUNTRIES · REAL-TIME OSINT</text>
  <!-- Bottom tag -->
  <text x="600" y="570" font-family="monospace" font-size="11" fill="#444B5C" text-anchor="middle" letter-spacing="4">OPEN SOURCE · NEUTRAL · FULLY SOURCED</text>
</svg>`;

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
const pngData = resvg.render();
writeFileSync('public/og-image.png', pngData.asPng());
console.log('OG image written to public/og-image.png');
