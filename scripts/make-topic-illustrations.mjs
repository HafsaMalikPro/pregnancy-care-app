// Generates the topic illustrations (article thumbnails, feature art) in public/assets/illustrations.
// Run: node scripts/make-topic-illustrations.mjs
import { writeFileSync } from "node:fs";

const OUT = new URL("../public/assets/illustrations/", import.meta.url);
const leaf = (x, y, r, c = "#80A987") =>
  `<ellipse cx="${x}" cy="${y}" rx="16" ry="6" transform="rotate(${r} ${x} ${y})" fill="${c}"/>`;

const scene = (bg, accent, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img">
  <rect width="320" height="200" fill="${bg}"/>
  <circle cx="270" cy="30" r="70" fill="${accent}" opacity=".35"/>
  <circle cx="40" cy="190" r="60" fill="${accent}" opacity=".25"/>
  ${inner}
</svg>
`;

const topics = {
  nutrition: scene("#FDEDE7", "#F7C3CE", `
    <ellipse cx="160" cy="150" rx="86" ry="14" fill="#E9B7A8" opacity=".5"/>
    <path d="M78 110h164c-4 40-38 52-82 52s-78-12-82-52z" fill="#FFFFFF"/>
    <path d="M78 110h164" stroke="#D45D7A" stroke-width="4" stroke-linecap="round"/>
    <circle cx="124" cy="100" r="20" fill="#E8687F"/>
    <path d="M124 80c2-8 8-10 12-10" stroke="#4E7A57" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="164" cy="96" r="22" fill="#F2B544"/>
    <circle cx="200" cy="102" r="16" fill="#80A987"/>
    <circle cx="146" cy="108" r="10" fill="#A58BD4"/>
    ${leaf(214, 84, -40)}${leaf(100, 88, 30)}`),
  movement: scene("#EEF4EF", "#BFD8C3", `
    <rect x="70" y="146" width="180" height="14" rx="7" fill="#A58BD4" opacity=".7"/>
    <circle cx="150" cy="62" r="16" fill="#F4C9B4"/>
    <path d="M138 54c4-16 26-18 30-2-10-4-20-2-30 2z" fill="#6B3D35"/>
    <path d="M150 80c-20 10-24 40-14 66h34c10-24 10-54-20-66z" fill="#D45D7A"/>
    <ellipse cx="164" cy="116" rx="18" ry="20" fill="#E27C96"/>
    <path d="M136 92c-24 4-40-8-52-22M164 92c24 4 40-8 52-22" stroke="#F4C9B4" stroke-width="8" stroke-linecap="round" fill="none"/>
    ${leaf(240, 120, -50)}${leaf(256, 136, -20)}${leaf(78, 128, 40)}`),
  sleep: scene("#F1EBFA", "#D7C8F0", `
    <path d="M200 56a40 40 0 1 1-46-16 32 32 0 0 0 46 16z" fill="#F2C55C"/>
    <circle cx="96" cy="58" r="3" fill="#A58BD4"/><circle cx="120" cy="38" r="2" fill="#A58BD4"/><circle cx="240" cy="92" r="3" fill="#A58BD4"/>
    <rect x="60" y="130" width="200" height="34" rx="17" fill="#FFFFFF"/>
    <rect x="70" y="118" width="64" height="26" rx="13" fill="#FCE3E5"/>
    <path d="M140 130c30-18 80-18 112 0" fill="#C7B1EE"/>`),
  baby: scene("#FCE3E5", "#F4A7B9", `
    <circle cx="160" cy="100" r="66" fill="#F7C3CE"/>
    <circle cx="160" cy="100" r="54" fill="#E67D96"/>
    <circle cx="146" cy="86" r="18" fill="#FBD3C8"/>
    <path d="M150 100c22-8 40 6 36 26-4 16-24 22-36 12-8-8-8-26 0-38z" fill="#FBD3C8"/>
    <path d="M138 88q4 3 8 0" stroke="#9C4B4B" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${leaf(70, 150, 30)}${leaf(250, 150, -30)}`),
  wellbeing: scene("#FFF3EC", "#F7C3CE", `
    <g transform="translate(160 118)">
      <ellipse rx="18" ry="44" fill="#F4A7B9" transform="rotate(-50)"/>
      <ellipse rx="18" ry="44" fill="#F4A7B9" transform="rotate(50)"/>
      <ellipse rx="18" ry="46" fill="#D45D7A" transform="translate(0 -6)"/>
      <ellipse rx="16" ry="36" fill="#E27C96" transform="rotate(-25) translate(0 -4)"/>
      <ellipse rx="16" ry="36" fill="#E27C96" transform="rotate(25) translate(0 -4)"/>
    </g>
    <path d="M90 160c40 8 100 8 140 0" stroke="#80A987" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${leaf(92, 150, 20)}${leaf(230, 150, -20)}`),
  care: scene("#EEF4EF", "#F7C3CE", `
    <rect x="96" y="44" width="128" height="120" rx="18" fill="#FFFFFF"/>
    <rect x="132" y="34" width="56" height="22" rx="11" fill="#A58BD4"/>
    <path d="M160 84c-8-12-30-6-26 10 3 10 26 26 26 26s23-16 26-26c4-16-18-22-26-10z" fill="#D45D7A"/>
    <path d="M120 138h80M120 150h52" stroke="#E5D3CF" stroke-width="5" stroke-linecap="round"/>
    ${leaf(240, 140, -40)}${leaf(82, 70, 40)}`),
};

for (const [name, svg] of Object.entries(topics)) {
  writeFileSync(new URL(`topic-${name}.svg`, OUT), svg);
}

// Brand mark: a mother's curve cradling a heart.
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${bg ? `<rect width="64" height="64" rx="16" fill="${bg}"/>` : ""}
  <circle cx="30" cy="13" r="7" fill="#D45D7A"/>
  <path d="M25 25c-10 9-11 25 0 33M35 25c14 4 19 22 8 31" fill="none" stroke="#D45D7A" stroke-width="5" stroke-linecap="round"/>
  <path d="M32 37c-3-5-11-3-9 3 1 4 9 9 9 9s8-5 9-9c2-6-6-8-9-3z" fill="#512D46"/>
</svg>
`;
writeFileSync(new URL("../brand/mark.svg", OUT), mark(null));
writeFileSync(new URL("../brand/icon.svg", OUT), mark("#FCE3E5"));
console.log("wrote", Object.keys(topics).length, "topics and brand marks");
