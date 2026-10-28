# Exploration: mutator × rule fairness

Session topic: `mutators` (branch `claude/gridlab-explore-mutators`). Code: `gridlab/explore/mutators/`.

**Shared modules edited: none.** Every proposal below is a *preset* in
`gridlab/explore/mutators/variants.py` (cost-knob overrides plus optional variants). A variant swaps
`Mutator` objects in `gridlab.mutators` at runtime, or patches `Program.ratchet_bits` for the
`composite` variant. `install_preset(name)` reverses everything. The coordinator can adopt each piece
on its own (see §6).

<!-- RESULTS-BELOW -->
