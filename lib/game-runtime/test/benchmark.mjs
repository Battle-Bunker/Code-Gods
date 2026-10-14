import { GameRuntime } from "../index.mjs";
const settings = { objectType: "Int", intMin: -2147483648, intMax: 2147483647, stringMaxLength: 256 };
for (const language of ["python", "typescript"]) {
  const r = new GameRuntime({ language });
  const source = language === "python" ? "lambda x: __import__('math').isqrt(x)" : "(x:number) => Math.floor(Math.sqrt(x))";
  try {
    const start = performance.now();
    await r.execute(source, 81, settings);
    const cold = performance.now() - start;
    const warm = performance.now();
    for (let n=0; n<10; n++) await r.execute(source, 81, settings);
    console.log(JSON.stringify({ language, coldMs: cold, warmMeanMs: (performance.now()-warm)/10 }));
  } finally { r.close(); }
}
