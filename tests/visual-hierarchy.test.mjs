import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

for (const marker of [
  "--type-title: #17242B",
  "--type-muted: #5E6A71",
  "--type-muted-dark: #C8D1D5",
  "font-size: 18px",
  "font-size: 20px",
  "font-size: 28px",
  "font-size: 12px"
]) {
  assert.ok(html.includes(marker), `Visual hierarchy marker missing: ${marker}`);
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const normalTextPairs = [
  ["title on light", "#17242B", "#FFFFFF"],
  ["description on light", "#5E6A71", "#FFFFFF"],
  ["description on anthracite", "#C8D1D5", "#20262B"],
  ["description on colorful dashboard", "#F1ECF8", "#351978"],
  ["task action", "#FFFFFF", "#1976D2"],
  ["finance action", "#FFFFFF", "#6D4C41"],
  ["command action", "#FFFFFF", "#2E7D32"],
  ["stock action", "#FFFFFF", "#8E24AA"],
  ["orange statistic", "#2A2112", "#FFC23D"]
];

for (const [name, foreground, background] of normalTextPairs) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)} must meet WCAG AA 4.5:1`);
}

console.log("Visual hierarchy and WCAG AA contrast checks passed");
