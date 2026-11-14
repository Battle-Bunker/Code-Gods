// The guest library for TypeScript and JavaScript agents (QuickJS), run as the act's trusted prelude.
// Transport and a rational helper only, no rule logic (spec §0, §6.4). The sandbox installs `__host` (one JSON
// request in, one JSON reply out, synchronously; spec §6.5) before this runs; the sandbox calls `__decode(offer)`
// to make the Offer handed to `agent`, and `__encode_calls(result)` on what `agent` returns.
//
// Globals for agents: Q, call, HostError. Values: Q = {n: bigint, d: bigint}; a point {x: Q, y: Q}; a segment
// {from, to}; a symbol is a string; undefined is {undefined: "why"}.
"use strict";
var Q, call, HostError, __decode, __encode_calls;
(() => {
  const host = globalThis.__host, stringify = JSON.stringify, parse = JSON.parse, freeze = Object.freeze;
  HostError = class HostError extends Error { constructor(message) { super(message); this.name = "HostError"; } };

  // --- Q: exact rationals in lowest terms, denominator > 0.
  const abs = x => (x < 0n ? -x : x);
  const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const make = (n, d) => {
    if (d === 0n) throw new RangeError("division by zero");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    return freeze({ n: n / g, d: d / g });
  };
  const RAT = /^(-?\d{1,40})(?:\/(\d{1,40}))?$/;
  const parseQ = text => {
    const m = RAT.exec(text);
    if (!m) throw new TypeError("not a rational: " + stringify(text));
    return make(BigInt(m[1]), BigInt(m[2] === undefined ? "1" : m[2]));
  };
  const isQ = x => x !== null && typeof x === "object" && typeof x.n === "bigint" && typeof x.d === "bigint";
  const toQ = x => {
    if (isQ(x)) return make(x.n, x.d);
    if (typeof x === "bigint") return make(x, 1n);
    if (typeof x === "number") {
      if (!Number.isSafeInteger(x)) throw new TypeError("a number must be a safe integer; use Q for fractions: " + x);
      return make(BigInt(x), 1n);
    }
    if (typeof x === "string") return parseQ(x);
    throw new TypeError("not a number or Q: " + String(x));
  };
  const wire = x => { const v = toQ(x); return v.d === 1n ? String(v.n) : v.n + "/" + v.d; };
  Q = freeze({
    of: (n, d = 1) => make(BigInt(n), BigInt(d)), parse: parseQ, from: toQ, isQ,
    add: (a, b) => { a = toQ(a); b = toQ(b); return make(a.n * b.d + b.n * a.d, a.d * b.d); },
    sub: (a, b) => { a = toQ(a); b = toQ(b); return make(a.n * b.d - b.n * a.d, a.d * b.d); },
    mul: (a, b) => { a = toQ(a); b = toQ(b); return make(a.n * b.n, a.d * b.d); },
    div: (a, b) => { a = toQ(a); b = toQ(b); return make(a.n * b.d, a.d * b.n); },
    neg: a => { a = toQ(a); return make(-a.n, a.d); },
    abs: a => { a = toQ(a); return make(abs(a.n), a.d); },
    cmp: (a, b) => { a = toQ(a); b = toQ(b); const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; },
    eq: (a, b) => Q.cmp(a, b) === 0,
    isZero: a => toQ(a).n === 0n,
    isInteger: a => toQ(a).d === 1n,
    toNumber: a => { a = toQ(a); return Number(a.n) / Number(a.d); },
    toString: wire,
  });

  // --- Values and calls on the wire (rationals as "p/q" strings).
  const value = v => {
    switch (v.kind) {
      case "number": return parseQ(v.q);
      case "point": return freeze({ x: parseQ(v.x), y: parseQ(v.y) });
      case "segment": return freeze({ from: freeze({ x: parseQ(v.from.x), y: parseQ(v.from.y) }), to: freeze({ x: parseQ(v.to.x), y: parseQ(v.to.y) }) });
      case "symbol": return v.text;
      default: return freeze({ undefined: String(v.reason) });
    }
  };
  const encodeArg = (x, name) => {
    if (typeof x === "string") return x;
    try { return wire(x); } catch (e) { throw new TypeError("argument " + name + ": " + e.message); }
  };
  const encodeArgs = args => {
    if (args === undefined) return {};
    if (args === null || typeof args !== "object" || Array.isArray(args)) throw new TypeError("a call's arguments are an object");
    const out = {};
    for (const k of Object.keys(args)) out[k] = encodeArg(args[k], k);
    return out;
  };
  const site = s => {
    if (s === undefined) return 0;
    if (!Number.isSafeInteger(s) || s < 0) throw new TypeError("site must be a line number from 0");
    return s;
  };
  call = (mutator, args, where) => {
    if (typeof mutator !== "string") throw new TypeError("call(mutator, args, site?): mutator is a string such as \"si.tilt\"");
    return freeze({ mutator, site: site(where), args: freeze(encodeArgs(args)) });
  };
  const normal = c => {
    if (c === null || typeof c !== "object") throw new TypeError("a call is made with call(mutator, args, site?)");
    return { mutator: String(c.mutator), site: site(c.site), args: encodeArgs(c.args) };
  };

  // --- The channel.
  const ask = request => {
    const reply = parse(host(stringify(request)));
    if (!reply.ok) throw new HostError(String(reply.error));
    return reply.result;
  };
  const elements = values => { const out = {}; for (const k of Object.keys(values)) out[k] = value(values[k]); return freeze(out); };
  class Offer {
    constructor(object) { this.object = object; freeze(this); }
    view(rep, where) { return elements(ask(where === undefined ? { op: "view", rep } : { op: "view", rep, site: site(where) }).elements); }
    element(rep, name, args, where) {
      const ref = { rep, name };
      if (where !== undefined) ref.site = site(where);
      if (args !== undefined) ref.args = encodeArgs(args);
      return value(ask({ op: "element", ref }).value);
    }
    myRule() { const r = ask({ op: "myRule" }); return freeze({ family: r.family, params: freeze(r.params), card: r.card }); }
    myScore() {
      const s = ask({ op: "myScore" });
      return freeze({
        score: s.score === null ? null : freeze(s.score.map(x => x === null ? null : parseQ(x))), level: s.level, top: s.top,
        terms: freeze(s.terms.map(t => freeze({ id: t.id, value: t.value === null ? null : parseQ(t.value) }))),
      });
    }
    quote(calls) {
      if (!Array.isArray(calls)) throw new TypeError("quote takes a list of calls");
      return freeze(ask({ op: "quote", calls: calls.map(normal) }));
    }
    budget() { return freeze(ask({ op: "budget" })); }
  }
  freeze(Offer.prototype);

  __decode = text => { const o = parse(text); return new Offer(o.object); };
  __encode_calls = result => {
    if (result === null || result === undefined) return "null";
    if (!Array.isArray(result)) throw new TypeError("agent must return a list of calls, or null to skip");
    return stringify(result.map(normal));
  };
})();
