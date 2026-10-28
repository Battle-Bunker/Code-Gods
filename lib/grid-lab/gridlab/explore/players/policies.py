"""Stronger, more human-like simulated gods.

Everything here is one configurable class, `SmartPolicy`, that extends the engine's greedy value model
(gridlab/policy.py) along five independent axes. Named presets (PRESETS) are registered into
`gridlab.policy.POLICIES` on import, so any GameConfig can use them by name:

    import gridlab.explore.players            # registers the presets
    GameConfig(policies=["ridge", "copycat", "saver", "talker"], ...)

Axes (constructor keywords; the defaults reproduce greedy_private exactly):

1. peer model: how a god predicts the peer surprisal S_-i(y) of a candidate result y. The engine's
   greedy_private holds it fixed at S_-i(x). Disclosure is respected: a god only uses its own table,
   the public grids, its own agents' programs and the per-object aggregate S_-i.
     peer="fixed"   S_-i(y) := S_-i(x)                                          (greedy_private)
     peer="ridge"   online ridge regression of S_-i on generic grid features φ, fitted to every
                    object it can see; predicts S_-i(x) + g·w·(φ(y) − φ(x)), with g ∈ [0, 1] its own
                    measured out-of-sample skill on observed object changes
     peer="bandit"  Thompson-sampled mean ΔS_-i per commit of each mutator type, learned from its OWN
                    agents' commits; predicts S_-i(x) + Σ_m∈P θ_m and biases candidate sampling
     peer="copy"    social learning (copycat): infers the mutator types behind every public object
                    change from a diff signature, credits them with the observed ΔS_-i, and both
                    predicts with and samples toward the mutators that raised others' surprisal
2. search: K library candidates (as greedy), then optional hill climbing (`climb` neighbours per
   round, `rounds` rounds, via program.neighbour) and `lookahead=2`, which also scores P(P(x)) and the
   interaction with one of the god's own existing agents Q: π(Q(P(x))) − π(Q(x)).
3. timing: `save_fraction` (wait until energy ≥ f · starting energy), `q` (accept only yields at or
   above the q-quantile of its own past best yields), `burst` (summon up to n of the best candidates
   in one decision).
4. candidate filter: `bij_only=True` (parasite) restricts candidates to unguarded bijective programs,
   which only redistribute structure other gods built ("steal").
5. cheap talk (`chat`): a public channel on the world (every message is public; there is no private
   chat). `announce=True` posts the god's goal at its first decision ("goal": its family and params,
   which others can evaluate because the utility catalogue is public; "colour": its favourite colour
   only, which listeners model as a colour-count rarity). `announce="lie"` posts a false goal/colour.
   `listen=True` adds announced gods' (predicted) surprisal change to its peer prediction;
   `trust="skeptic"` drops announcers whose claims are inconsistent with the observed aggregate
   (claimed s_j(x) > S_-i(x), or claimed changes uncorrelated with ΔS_-i). `coalition=α` also adds α ×
   the announced partners' payoff change to its objective.

Policies record diagnostics in `self.stats`; `world._players[god]` points at each SmartPolicy so a
`run_game` hook can collect them at the end of a game.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

import numpy as np

from ...core import Grid, spawn_batch
from ...family import Draw
from ...policy import GreedyPolicy, POLICIES
from ... import calibrate as cal
from .features import diff_signature, grid_features


# ------------------------------------------------------------------------------------------------
# per-library helpers (computed once per process per library)
# ------------------------------------------------------------------------------------------------
_LIBINFO: dict = {}


def library_info(lib, gtype):
    """For a (programs, costs) library: mutator id list, membership matrix (P, M), bijective mask."""
    k = (id(lib[0]), gtype.key)
    if k not in _LIBINFO:
        progs = lib[0]
        mids = sorted({m for p in progs for m in p.mutator_ids})
        ix = {m: j for j, m in enumerate(mids)}
        mem = np.zeros((len(progs), len(mids)), np.float32)
        for a, p in enumerate(progs):
            for m in p.mutator_ids:
                mem[a, ix[m]] += 1.0 / len(p.mutator_ids)
        bij = np.array([bool(p.bijective) for p in progs])
        _LIBINFO[k] = {"mids": mids, "ix": ix, "mem": mem, "bij": bij}
    return _LIBINFO[k]


_SIGTAB: dict = {}


def signature_table(lib, gtype, n: int = 3000, seed: int = 12345) -> dict:
    """signature -> {mutator id: probability}: which mutator types produce which visible changes,
    learned by applying library programs to fresh spawns (what a player learns in practice games)."""
    k = (id(lib[0]), gtype.key)
    if k not in _SIGTAB:
        rng = np.random.default_rng(seed)
        progs = lib[0]
        sym, col = spawn_batch(gtype, rng, n)
        acc: dict = defaultdict(Counter)
        for b in range(n):
            p = progs[int(rng.integers(len(progs)))]
            y = p.apply(Grid(sym[b], col[b]), gtype)
            if y is None:
                continue
            sig = diff_signature(sym[b], col[b], y.sym, y.col)
            for m in p.mutator_ids:
                acc[sig][m] += 1.0 / len(p.mutator_ids)
        _SIGTAB[k] = {s: {m: v / sum(c.values()) for m, v in c.items()} for s, c in acc.items()}
    return _SIGTAB[k]


def colour_proxy_bits(gtype) -> np.ndarray:
    """bits[k] = -log2 P(Binomial(N², 1/C) >= k): the rarity of k cells of one announced colour."""
    n, p = gtype.N ** 2, 1.0 / gtype.C
    pmf = np.array([math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(n + 1)])
    tail = np.cumsum(pmf[::-1])[::-1]
    return -np.log2(np.clip(tail, 1e-300, 1.0))


def fake_draw(seed: int, god: int, gtype, own_family_id: str, pool=None) -> Draw:
    """The false goal a liar announces: deterministic in (game seed, god) so tables can be prebuilt."""
    from ...sim import default_families
    pool = pool or default_families()
    fams = [f for f in pool if f.available(gtype) and f.id != own_family_id]
    r = np.random.default_rng([int(seed), int(god), 99])
    f = fams[int(r.integers(len(fams)))]
    return Draw(f, f.sample(r, gtype))


# ------------------------------------------------------------------------------------------------
# the configurable policy
# ------------------------------------------------------------------------------------------------
class SmartPolicy(GreedyPolicy):
    preset: dict = {}

    def __init__(self, god, world, rng, factory, program_kwargs=None, **kw):
        kw = {**self.preset, **kw}
        own = {k: kw.pop(k) for k in list(kw) if k in _SMART_KEYS}
        super().__init__(god, world, rng, factory, program_kwargs, **kw)
        o = {**_SMART_DEFAULTS, **own}
        self.o = o
        self.peer, self.climb, self.rounds, self.lookahead = o["peer"], o["climb"], o["rounds"], o["lookahead"]
        self.save_fraction, self.q, self.burst = o["save_fraction"], o["q"], o["burst"]
        self.afford = o["afford"]
        self.bij_only, self.chat, self.announce, self.listen = o["bij_only"], o["chat"], o["announce"], o["listen"]
        self.trust, self.coalition = o["trust"], o["coalition"]
        self.stats: dict = Counter()
        self.diag: dict = {}
        world.__dict__.setdefault("_players", {})[god] = self
        # peer-model state
        self._feat_cache: dict = {}
        self.A = self.b = self.w = None
        self.skill_num = self.skill_den = 0.0
        self.forget = o["forget"]
        self.ridge_lambda = o["ridge_lambda"]
        self.prev: dict = {}                   # obj id -> (key, sym, col, own s, peer s)
        self.mut_sum: dict = defaultdict(float)
        self.mut_sq: dict = defaultdict(float)
        self.mut_n: dict = defaultdict(float)
        self.agent_mids: dict = {}
        self.own_keys: set = set()
        # chat state
        self.announced = False
        self.partners: dict = {}              # god j -> dict(kind, table/draw or colour, trust stats)

    # --- feature cache ---------------------------------------------------------------------------
    def feats(self, grids) -> np.ndarray:
        gt = self.world.gtype
        out, miss = [None] * len(grids), []
        for a, g in enumerate(grids):
            f = self._feat_cache.get(g.key)
            if f is None:
                miss.append(a)
            else:
                out[a] = f
        if miss:
            F = grid_features(np.stack([grids[a].sym for a in miss]), np.stack([grids[a].col for a in miss]), gt)
            if len(self._feat_cache) > 20000:
                self._feat_cache.clear()
            for a, f in zip(miss, F):
                self._feat_cache[grids[a].key] = f
                out[a] = f
        return np.stack(out)

    # --- observation of the public world (every decision) ----------------------------------------
    def observe(self):
        w, i = self.world, self.god
        M = w.M
        if M == 0:
            return
        S = w.S[:M]
        own, peer = S[:, i], S.sum(1) - S[:, i]
        ids = w.obj_ids
        trans = []                               # (x grid, y grid, Δpeer, x peer, y peer, oi)
        for oi in range(M):
            g = w.objects[oi]
            p = self.prev.get(ids[oi])
            if p is not None and p[0] != g.key:
                trans.append((p[1], g, peer[oi] - p[3], p[3], peer[oi], oi))
            self.prev[ids[oi]] = (g.key, g, own[oi], peer[oi])
        self.stats["transitions_seen"] += len(trans)
        if self.peer == "ridge":
            self._ridge_update(w.objects[:M], peer, trans)
        if self.peer == "copy" and trans:
            self._copy_update(trans)
        if self.listen and self.partners and trans:
            self._trust_update(trans, peer)

    # ridge -----------------------------------------------------------------------------------------
    def _ridge_update(self, objs, peer, trans):
        F = self.feats(objs)
        nf = F.shape[1]
        if self.A is None:
            self.A, self.b = np.zeros((nf, nf)), np.zeros(nf)
        if trans and self.w is not None:     # out-of-sample skill on the changes it just observed
            fx = self.feats([t[0] for t in trans])
            fy = self.feats([t[1] for t in trans])
            dp = np.array([t[2] for t in trans])
            pred = (fy - fx) @ self.w
            self.skill_num = 0.98 * self.skill_num + float(((dp - pred) ** 2).sum())
            self.skill_den = 0.98 * self.skill_den + float((dp ** 2).sum())
        lam = self.forget
        self.A = lam * self.A + F.T @ F
        self.b = lam * self.b + F.T @ peer
        reg = self.ridge_lambda * np.eye(nf)
        reg[-1, -1] = 1e-6
        try:
            self.w = np.linalg.solve(self.A + reg, self.b)
        except np.linalg.LinAlgError:
            pass

    def ridge_gain(self) -> float:
        if self.w is None or self.skill_den <= 1e-9:
            return 0.0
        return float(np.clip(1.0 - self.skill_num / self.skill_den, 0.0, 1.0))

    # mutator credit (bandit: own commits; copy: inferred from public changes) ---------------------
    def _credit(self, mids_probs: dict, dpeer: float):
        for m, pr in mids_probs.items():
            self.mut_sum[m] += pr * dpeer
            self.mut_sq[m] += pr * dpeer * dpeer
            self.mut_n[m] += pr

    def _copy_update(self, trans):
        tab = signature_table(self.world.library, self.world.gtype)
        for x, y, dp, *_ in trans:
            if y.key in self.own_keys:
                continue
            post = tab.get(diff_signature(x.sym, x.col, y.sym, y.col))
            if post:
                self._credit(post, dp)
                self.stats["copy_credited"] += 1

    def theta(self, thompson: bool = True) -> dict:
        n0 = self.o["prior_n"]
        out = {}
        for m, n in self.mut_n.items():
            mean = self.mut_sum[m] / (n + n0)
            if thompson:
                var = max(self.mut_sq[m] / max(n, 1e-9) - (self.mut_sum[m] / max(n, 1e-9)) ** 2, 1.0)
                mean += float(self.rng.normal()) * math.sqrt(var / (n + n0))
            out[m] = mean
        return out

    # chat ------------------------------------------------------------------------------------------
    def channel(self) -> list:
        return self.world.__dict__.setdefault("_players_chat", [])

    def favourite_colour(self) -> int:
        w, gt, d, tb = self.world, self.world.gtype, self.world.draws[self.god], self.world.tables[self.god]
        r = np.random.default_rng(0)
        sym, col = spawn_batch(gt, r, 64)
        best, bc = -1.0, 0
        for c in range(gt.C):
            cc = col.copy()
            cc[r.random(cc.shape) < 0.5] = c
            v = float(np.mean(tb.surprisal(d.family.evaluate_batch(sym, cc, d.params, gt))))
            if v > best:
                best, bc = v, c
        return bc

    def post(self):
        self.announced = True
        if not self.announce:
            return
        w, gt = self.world, self.world.gtype
        msg = {"t": float(w.t), "god": self.god, "kind": self.chat, "true": self.announce != "lie"}
        if self.chat == "goal":
            if self.announce == "lie":
                seed = int(w.cfg.seed)
                msg["draw"] = fake_draw(seed, self.god, gt, w.draws[self.god].family.id, w.cfg.families)
            else:
                msg["draw"] = w.draws[self.god]
            msg["text"] = f"My goal: {msg['draw'].summary(gt)}"
        else:
            c = self.favourite_colour()
            if self.announce == "lie":
                c = (c + 1 + int(self.rng.integers(gt.C - 1))) % gt.C
            msg["colour"] = c
            msg["text"] = f"I like {gt.colour_names[c]}"
        self.channel().append(msg)
        self.stats["posted"] += 1

    def read_chat(self):
        gt = self.world.gtype
        for msg in self.channel():
            j = msg["god"]
            if j == self.god or j in self.partners:
                continue
            p = {"kind": msg["kind"], "viol": 0, "n": 0, "sxy": 0.0, "sxx": 0.0, "syy": 0.0, "trusted": True}
            if msg["kind"] == "goal":
                p["draw"] = msg["draw"]
                p["table"] = cal.survival(msg["draw"], gt)
            else:
                p["colour"] = msg["colour"]
                p["bits"] = colour_proxy_bits(gt)
            self.partners[j] = p

    def partner_s(self, p: dict, sym: np.ndarray, col: np.ndarray) -> np.ndarray:
        gt = self.world.gtype
        if p["kind"] == "goal":
            d = p["draw"]
            return np.asarray(p["table"].surprisal(d.family.evaluate_batch(sym, col, d.params, gt)), float)
        k = (col == p["colour"]).reshape(len(col), -1).sum(1)
        return p["bits"][k]

    def _trust_update(self, trans, peer):
        if self.trust != "skeptic":
            return
        xs = np.stack([t[0].sym for t in trans]); xc = np.stack([t[0].col for t in trans])
        ys = np.stack([t[1].sym for t in trans]); yc = np.stack([t[1].col for t in trans])
        dpeer = np.array([t[2] for t in trans])
        ypeer = np.array([t[4] for t in trans])
        for j, p in self.partners.items():
            if p["kind"] != "goal":
                continue
            sx, sy = self.partner_s(p, xs, xc), self.partner_s(p, ys, yc)
            p["viol"] += int((sy > ypeer + 1.0).sum())
            ds = sy - sx
            p["n"] += len(ds)
            p["sxy"] += float((ds * dpeer).sum()); p["sxx"] += float((ds * ds).sum()); p["syy"] += float((dpeer ** 2).sum())
            corr = p["sxy"] / math.sqrt(max(p["sxx"] * p["syy"], 1e-12))
            was = p["trusted"]
            p["trusted"] = (p["viol"] <= 0.02 * p["n"] + 1) and (p["n"] < 40 or corr > 0.1)
            if was and not p["trusted"]:
                self.stats["distrusted"] += 1

    # --- the value model ---------------------------------------------------------------------------
    def peer_prediction(self, sym, col, ygrids, obj, who, progs, own_x, peer_x, theta=None):
        w = self.world
        if self.peer == "ridge" and self.w is not None:
            g = self.ridge_gain()
            if g > 0:
                fx = self.feats([w.objects[o] for o in obj])
                fy = self.feats(ygrids)
                peer_y = peer_x + g * ((fy - fx) @ self.w)
            else:
                peer_y = peer_x.copy()
        elif self.peer in ("bandit", "copy") and theta:
            bonus = np.array([sum(theta.get(m, 0.0) for m in progs[k].mutator_ids) / len(progs[k].mutator_ids)
                              for k in range(len(progs))])
            peer_y = peer_x + bonus[who]
        else:
            peer_y = peer_x.copy()
        if self.listen and self.partners:
            for j, p in self.partners.items():
                if not p["trusted"]:
                    continue
                sjy = self.partner_s(p, sym, col)
                sjx = self.partner_s(p, np.stack([w.objects[o].sym for o in obj]),
                                     np.stack([w.objects[o].col for o in obj]))
                peer_y = peer_y + (sjy - sjx)
                if self.coalition:
                    p["_sjy"], p["_sjx"] = sjy, sjx
        return np.maximum(peer_y, 0.0)

    def _payoff_delta(self, sym, col, ygrids, obj, who, progs, theta):
        """Δπ_i (and coalition terms) for results y of candidate who[k] on object obj[k]."""
        w, i, gt = self.world, self.god, self.world.gtype
        d, tb = w.draws[i], w.tables[i]
        own_y = np.asarray(tb.surprisal(d.family.evaluate_batch(sym, col, d.params, gt)), float)
        Sx = w.S[:w.M][obj]
        own_x = Sx[:, i]
        peer_x = Sx.sum(1) - own_x
        peer_y = self.peer_prediction(sym, col, ygrids, obj, who, progs, own_x, peer_x, theta)
        delta = own_y * peer_y - own_x * peer_x
        if self.coalition and self.partners:
            for j, p in self.partners.items():
                if not p["trusted"] or "_sjy" not in p:
                    continue
                sjy, sjx = p.pop("_sjy"), p.pop("_sjx")
                # partner j's payoff: s_j × (everyone else's surprisal) = s_j × (own_i + peer_i − s_j)
                pj_y = sjy * (own_y + peer_y - sjy)
                pj_x = sjx * (own_x + peer_x - sjx)
                delta = delta + self.coalition * (pj_y - pj_x)
        return delta

    def _results(self, progs, idx, src=None):
        """Apply each candidate to each sampled object. src: optional list of grids replacing objects."""
        w, gt = self.world, self.world.gtype
        sym, col, who, obj, ys = [], [], [], [], []
        for p_i, prog in enumerate(progs):
            for oi in idx:
                x = w.objects[oi] if src is None else src[oi]
                if x is None:
                    continue
                y = prog.apply(x, gt, self.rng)
                if y is None or y.key in w.keys:
                    continue
                sym.append(y.sym); col.append(y.col); who.append(p_i); obj.append(oi); ys.append(y)
        return sym, col, who, obj, ys

    def mean_delta(self, progs: list) -> np.ndarray:
        w = self.world
        M = w.M
        idx = np.arange(M) if M <= self.M_eval else self.rng.choice(M, self.M_eval, replace=False)
        out = np.zeros(len(progs))
        theta = self.theta() if self.peer in ("bandit", "copy") else None
        sym, col, who, obj, ys = self._results(progs, idx)
        if who:
            delta = self._payoff_delta(np.stack(sym), np.stack(col), ys, np.array(obj), np.array(who), progs, theta)
            np.add.at(out, np.array(who), delta)
        if self.lookahead >= 2 and who:
            out += self._lookahead(progs, idx, ys, who, obj, theta)
        return out / len(idx)

    def _lookahead(self, progs, idx, ys, who, obj, theta):
        """Second ply: value of re-application P(P(x)) beyond P(x), and the interaction with one of
        the god's own agents Q applied next: [π(Q(P(x))) − π(P(x))] − [π(Q(x)) − π(x)]."""
        w, gt, i = self.world, self.world.gtype, self.god
        extra = np.zeros(len(progs))
        mine = [a for a in w.agents if w.agent_owner[a] == i]
        sym, col, who2, obj2, ys2, base = [], [], [], [], [], []
        for k, (p_i, oi, y) in enumerate(zip(who, obj, ys)):
            if mine and self.rng.random() < 0.5:
                q = w.agent_prog[mine[int(self.rng.integers(len(mine)))]]
                z = q.apply(y, gt)
                zx = q.apply(w.objects[oi], gt)
            else:
                q, z, zx = progs[p_i], progs[p_i].apply(y, gt), None
            if z is None or z.key in w.keys:
                continue
            sym.append(z.sym); col.append(z.col); who2.append(p_i); obj2.append(oi); ys2.append(z)
            base.append((y, zx))
        if not who2:
            return extra
        # value of z relative to x, minus value of y relative to x, minus the Q-alone gain
        obj2a, who2a = np.array(obj2), np.array(who2)
        dz = self._payoff_delta(np.stack(sym), np.stack(col), ys2, obj2a, who2a, progs, theta)
        yy = [b[0] for b in base]
        dy = self._payoff_delta(np.stack([g.sym for g in yy]), np.stack([g.col for g in yy]), yy, obj2a, who2a,
                                progs, theta)
        gain = dz - dy
        qx = [(k, b[1]) for k, b in enumerate(base) if b[1] is not None and b[1].key not in w.keys]
        if qx:
            ks = np.array([k for k, _ in qx])
            g2 = [g for _, g in qx]
            dq = self._payoff_delta(np.stack([g.sym for g in g2]), np.stack([g.col for g in g2]), g2, obj2a[ks],
                                    who2a[ks], progs, theta)
            gain[ks] -= dq
        np.add.at(extra, who2a, self.o["gamma"] * gain)
        return extra

    # --- candidates ------------------------------------------------------------------------------
    def sample_programs(self, k: int):
        lib = self.world.library
        if lib is None or self.program_kwargs or not (self.bij_only or self.afford or self.peer in ("bandit", "copy")):
            return super().sample_programs(k)
        info = library_info(lib, self.world.gtype)
        progs, costs = lib
        cs = self.world.cfg.cost_scale
        p = np.ones(len(progs))
        if self.bij_only:
            p = p * info["bij"]
        if self.afford:
            ok = costs * cs <= self.energy()
            if not (p * ok).any():
                return [], np.zeros(0)
            p = p * ok
        if self.peer in ("bandit", "copy") and self.mut_n:
            th = self.theta(thompson=False)
            v = np.array([th.get(m, 0.0) for m in info["mids"]])
            sc = np.abs(v).max() or 1.0
            p = p * np.exp(self.o["tilt"] * (info["mem"] @ (v / sc)))
        p = p / p.sum()
        idx = self.rng.choice(len(progs), k, p=p)
        return [progs[i] for i in idx], costs[idx] * cs

    def evaluate_all(self, K: int):
        e = self.energy()
        cands, costs = self.sample_programs(K)
        ok = costs <= e
        if not len(costs) or not ok.any():
            return None
        cands = [p for p, o in zip(cands, ok) if o]
        costs = costs[ok]
        hz = self.horizon_apps() * self.discount * self.scale()
        d = self.mean_delta(cands)
        y = d * hz / np.maximum(costs, 1e-9)
        if self.climb:
            from ...program import neighbour
            gt, cs = self.world.gtype, self.world.cfg.cost_scale
            for _ in range(self.rounds):
                b = int(np.argmax(y))
                nb, seen = [], {p.key for p in cands}
                for _ in range(self.climb):
                    q = neighbour(self.rng, gt, cands[b])
                    if q.key not in seen:
                        seen.add(q.key)
                        nb.append(q)
                if not nb:
                    break
                nc = np.array([q.cost(gt) * cs for q in nb])
                keep = nc <= e
                nb = [q for q, kk in zip(nb, keep) if kk]
                if not nb:
                    continue
                nc = nc[keep]
                nd = self.mean_delta(nb)
                ny = nd * hz / np.maximum(nc, 1e-9)
                self.stats["climb_evals"] += len(nb)
                if ny.max() > y.max():
                    self.stats["climb_improved"] += 1
                cands += nb
                costs = np.concatenate([costs, nc])
                d = np.concatenate([d, nd])
                y = np.concatenate([y, ny])
        return cands, costs, y, d

    def decide(self):
        w = self.world
        if self.chat:
            if not self.announced:
                self.post()
            if self.listen:
                self.read_chat()
        self.observe()
        if self.skip > 0:
            self.skip -= 1
            return []
        if self.save_fraction and self.energy() < self.save_fraction * w.cfg.starting_energy:
            return []
        r = self.evaluate_all(self.K)
        if r is None:
            return []
        cands, costs, y, d = r
        order = np.argsort(-y)
        best = float(y[order[0]])
        self.best_yields.append(best)
        if not self.accept(best):
            self.fails += 1
            if self.backoff:
                self.skip = min(self.fails, 4)
            return []
        self.fails = 0
        out, e = [], self.energy()
        for b in order[: self.burst]:
            if y[b] <= self.min_yield or costs[b] > e:
                continue
            out.append(cands[b])
            e -= costs[b]
        self.last_best = (out[0], float(d[order[0]])) if out else None
        self.stats["summon_decisions"] += 1
        return out

    def accept(self, yield_: float) -> bool:
        if self.q is None:
            return yield_ > self.min_yield
        hist = self.best_yields[:-1]
        bar = max(self.min_yield, float(np.quantile(hist, self.q))) if len(hist) >= 4 else self.min_yield
        return yield_ > bar

    # --- hooks -------------------------------------------------------------------------------------
    def on_summon(self, aid, prog, cost):
        super().on_summon(aid, prog, cost)
        self.agent_mids[aid] = prog.mutator_ids

    def on_commit(self, aid, oi, before, after):
        super().on_commit(aid, oi, before, after)
        i = self.god
        self.own_keys.add(self.world.objects[oi].key)
        if len(self.own_keys) > 50000:
            self.own_keys.clear()
        if self.peer == "bandit" and aid in self.agent_mids:
            dp = float((after.sum() - after[i]) - (before.sum() - before[i]))
            ms = self.agent_mids[aid]
            self._credit({m: 1.0 / len(ms) for m in ms}, dp)

    def summary(self) -> dict:
        out = dict(self.stats)
        if self.peer == "ridge":
            out["ridge_skill"] = self.ridge_gain()
        if self.partners:
            out["partners"] = len(self.partners)
            out["partners_trusted"] = sum(p["trusted"] for p in self.partners.values())
        return out


_SMART_DEFAULTS = dict(peer="fixed", afford=False, climb=0, rounds=1, lookahead=1, gamma=1.0, save_fraction=0.0, q=None, burst=1,
                       bij_only=False, chat=None, announce=False, listen=False, trust="naive", coalition=0.0,
                       forget=0.995, ridge_lambda=1.0, prior_n=20.0, tilt=1.5)
_SMART_KEYS = set(_SMART_DEFAULTS)


# ------------------------------------------------------------------------------------------------
# presets
# ------------------------------------------------------------------------------------------------
PRESETS: dict[str, dict] = {
    # attribution of the engine's saver (K = 32, save to 60%, 75th-percentile bar)
    "smart_greedy": dict(),                                 # == greedy_private (sanity check)
    "k32": dict(K=32),
    "k32_bar": dict(K=32, q=0.75),
    "k32_save": dict(K=32, save_fraction=0.6),
    "burst": dict(K=32, save_fraction=0.9, burst=4),
    # budget-aware candidate search: K candidates among the programs it can afford now
    "afford": dict(afford=True),
    "afford_bar": dict(afford=True, q=0.75),
    # learners (on top of afford, so the value model has a real choice to make)
    "ridge": dict(afford=True, peer="ridge"),
    "bandit": dict(afford=True, peer="bandit"),
    "copycat": dict(afford=True, peer="copy"),
    # planners
    "climber": dict(afford=True, climb=6, rounds=2),
    "planner": dict(afford=True, climb=6, rounds=2, lookahead=2),
    # parasites
    "parasite": dict(afford=True, bij_only=True),
    "parasite_ridge": dict(afford=True, bij_only=True, peer="ridge"),
    # cheap talk
    "talker": dict(afford=True, chat="goal", announce=True, listen=True),
    "listener": dict(afford=True, chat="goal", announce=False, listen=True),
    "liar": dict(afford=True, chat="goal", announce="lie", listen=True),
    "skeptic": dict(afford=True, chat="goal", announce=True, listen=True, trust="skeptic"),
    "colour_talker": dict(afford=True, chat="colour", announce=True, listen=True),
    "colour_liar": dict(afford=True, chat="colour", announce="lie", listen=True),
    "coalition": dict(afford=True, chat="goal", announce=True, listen=True, coalition=0.5),
}


def register(presets: dict | None = None) -> list[str]:
    """Add the presets to gridlab.policy.POLICIES (idempotent). Returns the registered names."""
    names = []
    for name, cfg in (presets or PRESETS).items():
        if name in POLICIES and not (isinstance(POLICIES[name], type) and issubclass(POLICIES[name], SmartPolicy)):
            raise ValueError(f"policy name {name} already used by the engine")
        POLICIES[name] = type(f"Smart_{name}", (SmartPolicy,), {"preset": dict(cfg)})
        names.append(name)
    return names


def make_preset(name: str, **cfg) -> str:
    """Register one new named combination of SmartPolicy options (for other experiments)."""
    register({name: cfg})
    return name
