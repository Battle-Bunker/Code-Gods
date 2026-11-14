// Example 1 (spec §6.6): Prime Gradient, the direct lens, ported from prime-gradient.py call for call.
function isPrime(p: number): boolean {
  for (let d = 2; d <= Math.floor(Math.sqrt(p)); d++) if (p % d === 0) return false;
  return true;
}

function agent(offer: Offer): Call[] | null {
  const v = offer.view("si").m as Q;
  if (v.d !== 1n) return null;                  // this agent only handles whole gradients
  const m = Number(v.n);
  let p = -1;
  for (let c = 2; c < Math.abs(m) + 30; c++) if (isPrime(c) && (p < 0 || Math.abs(c - m) < Math.abs(p - m))) p = c;
  return p === m ? null : [call("si.tilt", { k: p - m })];
}
