"""Second-round presets (kept out of policies.py so cached results of the first round stay valid).

Learners and planners on top of the saver's timing (save to 60% of starting energy, K = 32, accept only
yields at or above the 75th percentile of its own past best yields), plus timing variants."""
from .policies import register

SAVER = dict(K=32, save_fraction=0.6, q=0.75)
EXTRA = {
    "smart_saver": dict(SAVER),                                   # == saver (sanity check)
    "saver_ridge": dict(SAVER, peer="ridge"),
    "saver_bandit": dict(SAVER, peer="bandit"),
    "saver_copycat": dict(SAVER, peer="copy"),
    "saver_planner": dict(SAVER, climb=6, rounds=2, lookahead=2),
    "saver_afford": dict(SAVER, afford=True),
    "saver_parasite": dict(SAVER, bij_only=True),
    # timing variants
    "save30": dict(K=32, save_fraction=0.3, q=0.75),
    "save90": dict(K=32, save_fraction=0.9, q=0.75),
    "bar90": dict(K=32, save_fraction=0.6, q=0.9),
    "k12_saver": dict(K=12, save_fraction=0.6, q=0.75),
    # chat on top of saver timing
    "saver_talker": dict(SAVER, chat="goal", announce=True, listen=True),
    "saver_listener": dict(SAVER, chat="goal", announce=False, listen=True),
    "saver_liar": dict(SAVER, chat="goal", announce="lie", listen=True),
    "saver_skeptic": dict(SAVER, chat="goal", announce=True, listen=True, trust="skeptic"),
}
register(EXTRA)
