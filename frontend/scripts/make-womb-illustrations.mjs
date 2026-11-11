// Generates the baby-in-womb illustrations in public/assets/illustrations.
// They are stylised and shared across ranges of weeks: not medical depictions of any one week.
// Run: node scripts/make-womb-illustrations.mjs
import { writeFileSync } from "node:fs";

const OUT = new URL("../public/assets/illustrations/", import.meta.url);

const defs = `
  <defs>
    <radialGradient id="outer" cx="50%" cy="45%" r="60%">
      <stop offset="0" stop-color="#FDECEE"/>
      <stop offset="0.7" stop-color="#F7C3CE"/>
      <stop offset="1" stop-color="#EE9DB0"/>
    </radialGradient>
    <radialGradient id="sac" cx="42%" cy="38%" r="70%">
      <stop offset="0" stop-color="#F9B9C6"/>
      <stop offset="0.65" stop-color="#E67D96"/>
      <stop offset="1" stop-color="#C9536F"/>
    </radialGradient>
    <radialGradient id="skin" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#FFE3DA"/>
      <stop offset="0.6" stop-color="#F7B9AE"/>
      <stop offset="1" stop-color="#E8907F"/>
    </radialGradient>
  </defs>`;

const womb = `
  <circle cx="100" cy="100" r="98" fill="url(#outer)"/>
  <circle cx="100" cy="100" r="80" fill="url(#sac)"/>
  <path d="M38 82c10-30 40-50 70-48" fill="none" stroke="#FFF" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 120c6 10 4 22-4 30M170 70c-8 4-12 14-10 24" fill="none" stroke="#C9536F" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`;

// A curled fetus facing left, drawn around (100, 100).
const fetus = `
    <path d="M108 146c12 14 22 22 30 40" fill="none" stroke="#F3A7B5" stroke-width="5" stroke-linecap="round"/>
    <g stroke="#E0897A" stroke-opacity=".55" stroke-width="1.5">
      <path d="M94 82c38-16 70 14 60 54-6 26-34 40-56 26-12-8-14-26-10-42 2-12 0-26 6-38z" fill="url(#skin)"/>
      <circle cx="80" cy="82" r="32" fill="url(#skin)"/>
      <ellipse cx="114" cy="142" rx="30" ry="14" transform="rotate(-24 114 142)" fill="url(#skin)"/>
      <ellipse cx="86" cy="154" rx="11" ry="7" transform="rotate(-10 86 154)" fill="url(#skin)"/>
    </g>
    <path d="M104 104c-6 10-16 14-24 14" fill="none" stroke="#EBA090" stroke-width="9" stroke-linecap="round"/>
    <circle cx="78" cy="117" r="6" fill="#F7B9AE"/>
    <path d="M64 84q6 4 12 0" fill="none" stroke="#9C4B4B" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M94 74q7 4 6 12" fill="none" stroke="#D97F70" stroke-width="2" stroke-linecap="round"/>
    <circle cx="68" cy="96" r="5" fill="#F28C9C" opacity=".45"/>`;

const embryo = `
    <path d="M122 132c10 6 16 16 16 26" fill="none" stroke="#F3A7B5" stroke-width="4" stroke-linecap="round"/>
    <path d="M96 78c20-4 36 12 34 32-2 18-16 30-30 32-10 2-16-2-18-8 8 2 16-2 18-10 2-10-6-16-14-14-14 4-22-10-14-22 2-4 2-8 4-10z" fill="url(#skin)"/>
    <circle cx="94" cy="86" r="14" fill="url(#skin)"/>
    <circle cx="88" cy="86" r="2.5" fill="#9C4B4B" opacity=".7"/>`;

const stages = {
  "womb-early": `<g transform="translate(100 100) scale(.42) translate(-100 -100)">${embryo}</g>`,
  "womb-first": `<g transform="translate(100 104) scale(.62) translate(-100 -100)">${fetus}</g>`,
  "womb-second": `<g transform="translate(100 102) scale(.86) translate(-100 -100)">${fetus}</g>`,
  "womb-third": `<g transform="translate(100 100) rotate(200) scale(.98) translate(-110 -120)">${fetus}</g>`,
};

for (const [name, inner] of Object.entries(stages)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img">${defs}${womb}${inner}</svg>\n`;
  writeFileSync(new URL(`${name}.svg`, OUT), svg);
}
console.log("wrote", Object.keys(stages).join(", "));
