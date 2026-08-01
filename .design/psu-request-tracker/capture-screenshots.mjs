import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots");
const BASE = "http://localhost:5173";

const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const tabs = [
  { key: "dash", label: "dash", clickText: "Dashboard" },
  { key: "submit", label: "submit", clickText: "Submit a request" },
  { key: "admin", label: "admin", clickText: "Admin" },
];

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload({ waitUntil: "networkidle" });
    }
    for (const tab of tabs) {
      await page.getByRole("button", { name: tab.clickText }).click();
      await page.waitForTimeout(150);
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(100);
        const file = path.join(OUT, `review-${tab.label}-${theme === "dark" ? "dark-mode-" : ""}${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log("saved", file);
      }
    }
  }

  // Admin: open a detail drawer for a component-state screenshot (light + dark)
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.reload({ waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Admin" }).click();
    await page.waitForTimeout(150);
    await page.getByText("MAY 2026 SURVEILLANCE TECHNICAL REVIEW MEETING").first().click();
    await page.waitForTimeout(200);
    const suffix = theme === "dark" ? "-dark-mode" : "";
    await page.screenshot({ path: path.join(OUT, `review-admin-detail-drawer${suffix}.png`), fullPage: true });
  }

  await browser.close();
}

run().catch(err => { console.error(err); process.exit(1); });
