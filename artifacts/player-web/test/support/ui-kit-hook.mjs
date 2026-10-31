// A module resolve hook for node tests: `@workspace/ui-kit` → its JSX-free modules (see ./ui-kit.ts).
export async function resolve(specifier, context, next) {
  if (specifier === "@workspace/ui-kit") return { url: new URL("./ui-kit.ts", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
