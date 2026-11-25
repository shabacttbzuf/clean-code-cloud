const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("http://127.0.0.1:4173/__ci/offline-sync.html", { waitUntil: "networkidle" });
    await page.locator("#run").click();
    await page.waitForFunction(
      () => document.querySelector("#log")?.textContent.includes("انتهى التشغيل."),
      { timeout: 45_000 },
    );
    const runLog = await page.locator("#log").innerText();
    assert.doesNotMatch(runLog, /✗/, "Offline queue browser harness reported a failed assertion");

    await page.locator("#prepare").click();
    await page.waitForFunction(
      () => document.querySelector("#log")?.textContent.includes("أعد تحميل الصفحة الآن"),
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#verify").click();
    await page.waitForFunction(
      () => document.querySelector("#log")?.textContent.includes("بقيت العملية في IndexedDB"),
    );

    assert.deepEqual(pageErrors, [], "Browser runtime raised uncaught errors");
    console.log("Offline sync Chromium acceptance passed: IndexedDB, retries, idempotency fixture, scope isolation, connectivity transitions and reload persistence.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
