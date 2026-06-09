import { readFile, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "lab-summary.html");

const IMAGES = [
  { src: "trinity-logo.svg", mime: "image/svg+xml" },
  { src: "lab-mascot.png",   mime: "image/png" },
];

async function inlineImages(html) {
  for (const { src, mime } of IMAGES) {
    try {
      const data = await readFile(join(ROOT, src));
      const b64 = data.toString("base64");
      html = html.replaceAll(`src="${src}"`, `src="data:${mime};base64,${b64}"`);
    } catch {
      // 이미지 파일 없으면 그냥 넘김
    }
  }
  return html;
}

export async function openViewer(viewerData, viewerJsonPath) {
  let template = await readFile(TEMPLATE, "utf8");
  template = await inlineImages(template);
  const inject = `<script>var __VIEWER_DATA__=${JSON.stringify(viewerData)};</script>`;
  const html = template.replace("</head>", `${inject}\n</head>`);
  const htmlPath = viewerJsonPath.replace(/\.json$/, ".html");
  await writeFile(htmlPath, html, "utf8");
  exec(`start "" "${htmlPath}"`);
  return htmlPath;
}
