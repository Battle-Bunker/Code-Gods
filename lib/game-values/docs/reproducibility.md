# Reproduction contract

Store `generatorId`, uint32 seed, exact domain bounds/cap, deity count and the
player-to-god mapping. The manifest includes all preference parameters and is
JSON-serializable. For an independent replay call the named registry entry with
those settings and compare the manifest. Persisting both sources and the full
report is useful for audit, but keep them server-only.

`pantheon-of-friction-v1` fixes:

1. xorshift32 shifts 13,17,5; seed zero maps to `0x6d2b79f5`.
2. Bounded integer draws use rejection above the largest multiple of the bound
   within 2^32, rather than modulo reduction alone.
3. Int draws choose period, then shared shift. Strings draw first alphabet
   offset then a nonzero second-letter offset.
4. Width two, center/prototype order and source templates.
5. Screening PRNG seed is `(seed ^ 0xa511e9b3) >>> 0`, independent of generation.
6. Candidate order, 128 samples, `1e-5` political margins and the named screen.

Changing these contracts requires a new generator or screen version as
appropriate, not silently reusing the same replay key. Seeds need not be
injective: multiple seeds can select the same finite preference family.
Distinctness is required **within** a generated roster. This is not a secret
cryptographic game-entropy implementation.

Floating-point outputs are binary64. Host and exported languages should match
within absolute `1e-12`; the algorithms and operation order are aligned.
Python rejects booleans and floating inputs for Int even though Python considers
booleans integer subclasses. TypeScript has only the number type and accepts
safe integral numbers. Both reject non-ASCII and over-cap strings, and neither
normalizes Unicode. JSON can transport every valid object, including controls.

Empty strings score `0.2` per god; zero integers score according to the selected
cycle and have no magic special case. All legal values remain finite and bounded.

The checked-in `fixtures/golden.json` is not regenerated during tests. It anchors
seed 42 independently of runtime source construction. Tests also execute sources
for zero and maximum uint32 seeds, expanded rosters, custom integer endpoints
and cap four. The test harness uses isolated Python subprocess execution of
**trusted generated source**; it is not an agent sandbox.

Malformed settings fail before sampling; failed political acceptance returns a
`GenerationError` containing the diagnostic report. Unsupported narrow domains,
small string caps or roster sizes are explicit limitations of this generator
version, not silent alterations to the engine's allowed mathematical settings.
