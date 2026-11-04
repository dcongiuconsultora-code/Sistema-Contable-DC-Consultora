// Genera una versión de la app en un solo HTML, con los archivos de ejemplo embebidos, para
// mostrarla como prototipo sin servidor. Uso: node scripts/prototipo.mjs [carpeta-salida]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const salida = path.resolve(process.argv[2] ?? path.join(raiz, "dist-prototipo"));

const js = await esbuild.build({
  entryPoints: [path.join(raiz, "src/prototipo/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": path.join(raiz, "src") },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.url": '"about:blank"' },
  logLevel: "warning",
});

const cssEntrada = path.join(raiz, "src/app/globals.css");
const css = await postcss([tailwind({ base: raiz, optimize: true })]).process(fs.readFileSync(cssEntrada, "utf8"), {
  from: cssEntrada,
});

const carpetaEjemplos = path.join(raiz, "public/ejemplos");
const ejemplos = Object.fromEntries(
  fs.readdirSync(carpetaEjemplos).map((f) => [f, fs.readFileSync(path.join(carpetaEjemplos, f)).toString("base64")]),
);

// El worker de pdf.js va embebido y se carga desde un blob, porque la página no puede pedir otros archivos.
const worker = fs.readFileSync(path.join(raiz, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), "utf8");
const scriptSeguro = (codigo) => codigo.replace(/<\/script/gi, "<\\/script");

const html = `<title>Sistema Contable DC</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>:root{color-scheme:light}${css.css}</style>
<div id="app"></div>
<script>window.__EJEMPLOS__=${JSON.stringify(ejemplos)}</script>
<script>window.__PDF_WORKER_SRC__=URL.createObjectURL(new Blob([${scriptSeguro(JSON.stringify(worker))}],{type:"text/javascript"}))</script>
<script>${scriptSeguro(js.outputFiles[0].text)}</script>
`;

fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "index.html"), html);
console.log(`Prototipo generado en ${salida} (${(html.length / 1024).toFixed(0)} KB)`);
