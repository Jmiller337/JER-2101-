/**
 * Regenerates committed test fixtures with the Playwright browser:
 * - tests/fixtures/pages/letter-photo.jpg: a letter-sized bill rendered to an image, then made to
 *   look like a phone photo (slight rotation and skew, a wooden table, uneven light, sensor noise,
 *   JPEG compression). Used by `npm run check:real-api`.
 * - public/icon-*.png and src/app/icon.png / apple-icon.png: the app icon.
 *
 * Run with `npm run fixtures`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(__dirname, "..");
const systemChromium = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const LETTER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1275px; height: 1650px; background: #fbfaf6; color: #151515;
         font-family: "Liberation Serif", "DejaVu Serif", serif; }
  .page { padding: 100px 115px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { font-family: "Liberation Sans", sans-serif; font-size: 44px; font-weight: 700; color: #1d4e89; }
  .logo small { display: block; font-size: 20px; font-weight: 400; color: #333; }
  .meta { font-family: "Liberation Sans", sans-serif; font-size: 21px; text-align: right; line-height: 1.5; }
  .address { margin-top: 60px; font-size: 24px; line-height: 1.45; }
  h1 { font-family: "Liberation Sans", sans-serif; font-size: 34px; margin: 55px 0 20px; }
  p { font-size: 24px; line-height: 1.5; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 24px; }
  th, td { border-bottom: 2px solid #999; padding: 12px 8px; text-align: left; }
  td.amt, th.amt { text-align: right; }
  .due { font-family: "Liberation Sans", sans-serif; font-size: 30px; font-weight: 700; margin: 30px 0;
         border: 3px solid #1d4e89; padding: 18px 22px; }
  .small { font-size: 17px; color: #444; margin-top: 60px; line-height: 1.4; }
</style></head><body><div class="page">
  <div class="top">
    <div class="logo">Riverside Water Utility<small>Clean water since 1952</small></div>
    <div class="meta">Account number: 40-2291-7<br>Statement date: October 6, 2026<br>Page 1 of 1</div>
  </div>
  <div class="address">Maria Alvarez<br>1148 Willow Creek Road, Apt. 3B<br>Riverside, CA 92501</div>
  <h1>Your October water bill</h1>
  <p>Dear Ms. Alvarez,</p>
  <p>Thank you for being a Riverside Water Utility customer. This statement covers service from
     September 1 to September 30, 2026. Your water use this month was 6,300 gallons, which is
     12 percent lower than the same month last year.</p>
  <table>
    <tr><th>Description</th><th class="amt">Amount</th></tr>
    <tr><td>Water service (6,300 gallons)</td><td class="amt">$61.40</td></tr>
    <tr><td>Sewer service</td><td class="amt">$22.72</td></tr>
    <tr><td>State water fee</td><td class="amt">$1.15</td></tr>
    <tr><td>Credit: paperless billing</td><td class="amt">-$1.15</td></tr>
  </table>
  <div class="due">Amount due: $84.12 &nbsp;&nbsp; Due date: October 28, 2026</div>
  <p>To pay by phone, call 1-800-555-0142, Monday to Friday, 8 a.m. to 5 p.m. A late fee of $10.00
     is added to payments received after the due date.</p>
  <p>Sincerely,<br>Customer Service Team</p>
  <div class="small">Riverside Water Utility, PO Box 9120, Riverside, CA 92502. Keep this statement for your
     records. Para ayuda en español, llame al 1-800-555-0199.</div>
</div></body></html>`;

const ICON_HTML = (size: number) => `<!doctype html><html><body style="margin:0;background:#000">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#000"/>
  <rect x="22" y="12" width="46" height="62" rx="4" fill="#fff"/>
  <rect x="29" y="22" width="32" height="4" fill="#111"/>
  <rect x="29" y="31" width="28" height="4" fill="#111"/>
  <rect x="29" y="40" width="32" height="4" fill="#111"/>
  <rect x="29" y="49" width="22" height="4" fill="#111"/>
  <path d="M60 70 l8 -6 v24 l-8 -6 h-6 v-12 z" fill="#fde047"/>
  <path d="M73 70 q5 6 0 12" stroke="#fde047" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M78 65 q10 11 0 22" stroke="#fde047" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg></body></html>`;

const LETTER_PDF_HTML = `<!doctype html><html><head><style>
  body { font: 16px/1.5 Georgia, serif; margin: 0; }
  section { padding: 72px; break-after: page; }
  h1 { font-size: 24px; }
</style></head><body>
  <section>
    <h1>Riverside Library</h1>
    <p>September 20, 2026</p>
    <p>Dear Ms. Alvarez,</p>
    <p>Thank you for returning The Long Road. The book was returned on September 3, 2026, eight days late.</p>
  </section>
  <section>
    <p>Late fee: $2.40.</p>
    <p>You can pay at the front desk or by phone at 555-0199.</p>
    <p>Sincerely, the Riverside Library circulation desk</p>
  </section>
</body></html>`;

export async function writeLetterPdf(browser: Awaited<ReturnType<typeof chromium.launch>>, file: string): Promise<void> {
  const page = await browser.newPage();
  await page.setContent(LETTER_PDF_HTML);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, await page.pdf({ format: "Letter" }));
  await page.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: existsSync(systemChromium) ? systemChromium : undefined });
  try {
    // The clean letter.
    const letter = await browser.newPage({ viewport: { width: 1275, height: 1650 } });
    await letter.setContent(LETTER_HTML);
    const letterPng = (await letter.screenshot({ type: "png" })).toString("base64");

    // Turn it into something like a phone photo.
    const photo = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const jpeg = await photo.evaluate(async (png: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1500;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d")!;
      // Wooden table.
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(0, 0, 1500, 2000);
      for (let x = 0; x < 1500; x += 3) {
        ctx.fillStyle = `rgba(40,20,5,${0.08 + 0.08 * Math.sin(x / 17)})`;
        ctx.fillRect(x, 0, 2, 2000);
      }
      // The page, slightly rotated and skewed, as if the phone were not quite level.
      ctx.save();
      ctx.translate(752, 1004);
      ctx.rotate((-2.5 * Math.PI) / 180);
      ctx.transform(1, 0.012, -0.018, 1, 0, 0);
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 30;
      ctx.drawImage(img, -img.width * 0.52, -img.height * 0.52, img.width * 1.04, img.height * 1.04);
      ctx.restore();
      // Uneven light: brighter top left, a shadow toward the bottom right.
      const light = ctx.createRadialGradient(350, 300, 100, 1000, 1500, 1700);
      light.addColorStop(0, "rgba(255,250,235,0.12)");
      light.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, 1500, 2000);
      // Sensor noise.
      const data = ctx.getImageData(0, 0, 1500, 2000);
      let seed = 7;
      for (let i = 0; i < data.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = ((seed / 0x7fffffff) - 0.5) * 16;
        data.data[i] += n;
        data.data[i + 1] += n;
        data.data[i + 2] += n;
      }
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.72).split(",")[1]!;
    }, letterPng);
    const pagesDir = path.join(root, "tests/fixtures/pages");
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(path.join(pagesDir, "letter-photo.jpg"), Buffer.from(jpeg, "base64"));
    console.log("wrote tests/fixtures/pages/letter-photo.jpg");

    // A two-page letter as a real text PDF, for the "Open a PDF" tests and a real-API check.
    await writeLetterPdf(browser, path.join(pagesDir, "letter.pdf"));
    console.log("wrote tests/fixtures/pages/letter.pdf");

    // Icons.
    const icons: Array<[string, number]> = [
      ["public/icon-192.png", 192],
      ["public/icon-512.png", 512],
      ["src/app/icon.png", 512],
      ["src/app/apple-icon.png", 180],
    ];
    for (const [file, size] of icons) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(ICON_HTML(size));
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), await page.screenshot({ type: "png", omitBackground: false }));
      console.log(`wrote ${file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
