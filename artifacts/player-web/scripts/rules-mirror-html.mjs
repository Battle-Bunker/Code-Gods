// Writes rules-mirror.html beside the Line Rules Mirror's built script and stylesheet (vite.rules-mirror.config.ts).
// The file is page content only: its host wraps it in the document skeleton, so it has no doctype, html, head or body.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "..", process.env.RULES_MIRROR_OUT || "dist-rules-mirror");
for (const f of ["rules-mirror.js", "rules-mirror.css"]) if (!existsSync(path.join(out, f))) throw new Error(`${f} is missing from ${out}: run the build first`);
writeFileSync(path.join(out, "rules-mirror.html"), `<title>Line Rules Mirror</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="rules-mirror.css">
<div id="root"></div>
<script type="module" src="rules-mirror.js"></script>
`);
console.log(`rules-mirror.html written to ${out}`);
