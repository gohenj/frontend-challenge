import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";

const port = 4174;
const base = "http://localhost:" + port;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "inherit" },
);
const dir = "reports/lighthouse";
const summary = {};
let browser;
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (attempt === 39) throw new Error("Servidor de preview indisponível");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await mkdir(dir, { recursive: true });
  browser = await chromium.launch({
    channel: "chromium",
    args: ["--remote-debugging-port=9223"],
  });
  const median = (values) => [...values].sort((a, b) => a - b)[1];
  for (const [name, path] of [
    ["inicio", "/"],
    ["detalhe", "/nft/1"],
  ]) {
    for (const profile of ["mobile", "desktop"]) {
      const results = [];
      for (let run = 1; run <= 3; run++) {
        const desktop = profile === "desktop";
        const result = await lighthouse(base + path, {
          port: 9223,
          output: ["html", "json"],
          logLevel: "error",
          formFactor: profile,
          ...(desktop
            ? {
                screenEmulation: {
                  mobile: false,
                  width: 1440,
                  height: 900,
                  deviceScaleFactor: 1,
                  disabled: false,
                },
                throttling: {
                  rttMs: 40,
                  throughputKbps: 10240,
                  cpuSlowdownMultiplier: 1,
                },
              }
            : {}),
          onlyCategories: [
            "performance",
            "accessibility",
            "best-practices",
            "seo",
          ],
        });
        if (!result || result.lhr.runtimeError)
          throw new Error(
            result?.lhr.runtimeError?.message ??
              "Lighthouse não retornou relatório",
          );
        await writeFile(
          dir + "/" + name + "-" + profile + "-" + run + ".html",
          result.report[0],
        );
        await writeFile(
          dir + "/" + name + "-" + profile + "-" + run + ".json",
          result.report[1],
        );
        const { categories, audits } = result.lhr;
        results.push({
          ...Object.fromEntries(
            Object.entries(categories).map(([key, value]) => [
              key,
              Math.round(value.score * 100),
            ]),
          ),
          lcp: audits["largest-contentful-paint"].numericValue,
          cls: audits["cumulative-layout-shift"].numericValue,
          tbt: audits["total-blocking-time"].numericValue,
        });
        console.log(name, profile, run, results.at(-1));
      }
      summary[name + "-" + profile] = Object.fromEntries(
        Object.keys(results[0]).map((key) => [
          key,
          median(results.map((r) => r[key])),
        ]),
      );
    }
  }
  await writeFile(
    dir + "/medianas.json",
    JSON.stringify(
      {
        environment: {
          os: platform(),
          release: release(),
          arch: arch(),
          node: process.version,
          chromium: browser.version(),
        },
        summary,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
