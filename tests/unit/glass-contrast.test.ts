import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Liquid Glass is translucent, so axe cannot judge text on it: what shows through depends on
 * what is behind. This test reads the theme values from globals.css and checks every text colour
 * that sits on glass at 7:1 (principle 8) against the worst backdrop the glass can float over,
 * with the specular sheen at full strength where it can reach the text.
 */

const css = readFileSync(path.join(__dirname, "../../src/app/globals.css"), "utf8");

type Vars = Record<string, string>;
type Rgb = [number, number, number];

function blockAfter(marker: string): Vars {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}" && --depth === 0) break;
  }
  const vars: Vars = {};
  for (const match of css.slice(open + 1, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[match[1]!] = match[2]!.trim();
  return vars;
}

const light = { ...blockAfter("@theme {"), ...blockAfter("\n:root {") };
const darkOverrides = blockAfter(':root[data-theme="dark"] {');
const THEMES: Record<string, Vars> = {
  light,
  dark: { ...light, ...darkOverrides },
  "black and yellow": { ...light, ...blockAfter(':root[data-theme="contrast"] {') },
};

function color(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  const triple = value.split(/\s+/).map(Number);
  if (triple.length === 3 && triple.every((n) => Number.isFinite(n))) return triple as Rgb;
  throw new Error(`not a colour: ${value}`);
}

/** A layer of colour `top` at opacity `alpha` over `under`, composited in sRGB like browsers do. */
function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return top.map((c, i) => c * alpha + under[i]! * (1 - alpha)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

for (const [name, v] of Object.entries(THEMES)) {
  const c = (key: string) => color(v[`--color-${key}`]!);
  const n = (key: string) => Number(v[`--glass-${key}`]);
  const tint = (key: string) => color(v[`--glass-${key}`]!);
  const wallpaper = ["--wall-base", "--wall-1", "--wall-2", "--wall-3"].map((key) => color(v[key]!));
  /** The glass colour over a backdrop, without and with its sheen. */
  const glassOver = (tintKey: string, alphaKey: string, sheenKey: string, backdrop: Rgb): Rgb[] => {
    const plain = over(tint(tintKey), n(alphaKey), backdrop);
    return [plain, over(WHITE, n(sheenKey), plain)];
  };
  const expectReadable = (text: Rgb, backgrounds: Rgb[], what: string) => {
    for (const bg of backgrounds) {
      expect(contrast(text, bg), `${what} on rgb(${bg.map(Math.round).join(" ")})`).toBeGreaterThanOrEqual(7);
    }
  };

  describe(`Liquid Glass text contrast, ${name}`, () => {
    it("bars: the text colour over anything that can scroll underneath", () => {
      const bars = [BLACK, WHITE].flatMap((backdrop) => glassOver("tint", "alpha", "sheen", backdrop));
      expectReadable(c("text"), bars, "text on a glass bar");
    });

    it("glass cards on the first-launch background, and the background itself", () => {
      const cards = wallpaper.flatMap((backdrop) => glassOver("tint", "alpha", "sheen", backdrop));
      for (const key of ["text", "muted", "accent"]) expectReadable(c(key), cards, `${key} on a glass card`);
      for (const key of ["text", "muted"]) expectReadable(c(key), wallpaper, `${key} on the background`);
    });

    it("glass buttons on the screens' own backgrounds", () => {
      const onContent = (backdrops: Rgb[]) =>
        backdrops.flatMap((backdrop) => {
          const plain = over(tint("fill"), n("fill-alpha"), backdrop);
          return [plain, over(WHITE, n("button-sheen"), plain)];
        });
      expectReadable(c("text"), onContent([c("ink"), c("grouped"), c("surface")]), "text on a glass button");
      // Destructive buttons (New document) sit only on the plain background.
      expectReadable(c("danger"), onContent([c("ink")]), "danger on a glass button");
    });

    it("tinted glass: the label below the sheen, which fades out by 40% of the height", () => {
      // A label's top sits at least 30% down a button, where a quarter of the sheen is left.
      const behindLabel = over(WHITE, n("prominent-sheen") * 0.25, c("accent"));
      expectReadable(c("on-accent"), [c("accent"), behindLabel], "on-accent on tinted glass");
    });

    it("camera glass over the live picture, whatever the camera sees", () => {
      const capsules = [BLACK, WHITE].flatMap((backdrop) => glassOver("dark-tint", "dark-alpha", "dark-sheen", backdrop));
      expectReadable(c("on-scrim"), capsules, "status and buttons on camera glass");
      expectReadable(c("highlight"), capsules, "an error on camera glass");
      // The mode strip floats over the black panel under the picture.
      const strip = glassOver("dark-tint", "dark-alpha", "dark-sheen", BLACK);
      expectReadable(c("mode-idle"), strip, "an idle mode");
      expectReadable(c("mode-selected"), strip.map((bg) => over(WHITE, 0.16, bg)), "the selected mode on its lens");
    });
  });
}

describe("theme blocks", () => {
  it("Automatic in dark mode uses exactly the Dark values", () => {
    const auto = blockAfter(":root:not([data-theme]) {");
    expect(auto).toEqual(darkOverrides);
  });
});
