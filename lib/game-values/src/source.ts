import type { Domain, Preference, Language } from "./model.ts";

/** Complete standalone function; neither imports nor hidden host helpers. */
export function exportSource(domain: Domain, p: Preference, language: Language): string {
  if (language === "typescript") {
    const guard = domain.objectType === "Int"
      ? `typeof x !== "number" || !Number.isSafeInteger(x) || x < ${domain.intMin} || x > ${domain.intMax}`
      : `typeof x !== "string" || x.length > ${domain.stringMaxLength} || /[^\\x00-\\x7f]/u.test(x)`;
    const body = p.kind === "cyclic-well"
      ? `const r = ((x % ${p.period}) + ${p.period}) % ${p.period};
  const gap = Math.abs(r - ${p.center});
  const distance = Math.min(gap, ${p.period} - gap);`
      : `const prototype = ${JSON.stringify(p.prototype)};
  let previous = Array.from({length: prototype.length + 1}, (_, i) => i);
  for (let i = 0; i < x.length; i++) {
    const current = [i + 1];
    for (let j = 1; j <= prototype.length; j++) {
      current[j] = Math.min(current[j-1] + 1, previous[j] + 1,
        previous[j-1] + (x[i] === prototype[j-1] ? 0 : 1));
    }
    previous = current;
  }
  const distance = previous[prototype.length];`;
    return `// pantheon-of-friction-v1; authoritative source export
export function value(x: ${domain.objectType === "Int" ? "number" : "string"}): number {
  if (${guard}) throw new RangeError("Invalid game object");
  ${body}
  return 1 / (1 + (distance / ${p.width}) ** 2);
}
`;
  }
  if (language !== "python") throw new RangeError("Unsupported source language");
  const guard = domain.objectType === "Int"
    ? `type(x) is not int or x < ${domain.intMin} or x > ${domain.intMax}`
    : `type(x) is not str or len(x) > ${domain.stringMaxLength} or any(ord(c) > 127 for c in x)`;
  const body = p.kind === "cyclic-well"
    ? `r = x % ${p.period}
    gap = abs(r - ${p.center})
    distance = min(gap, ${p.period} - gap)`
    : `prototype = ${JSON.stringify(p.prototype)}
    previous = list(range(len(prototype) + 1))
    for i, char in enumerate(x):
        current = [i + 1]
        for j in range(1, len(prototype) + 1):
            current.append(min(current[j-1] + 1, previous[j] + 1,
                               previous[j-1] + (0 if char == prototype[j-1] else 1)))
        previous = current
    distance = previous[len(prototype)]`;
  return `# pantheon-of-friction-v1; authoritative source export
def value(x):
    if ${guard}:
        raise ValueError("Invalid game object")
    ${body}
    return 1 / (1 + (distance / ${p.width}) ** 2)
`;
}
