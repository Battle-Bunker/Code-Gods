# Images for the repository README

`hero.webp`, `goal-card.webp`, `agent.webp` and `replay.webp` are screenshots of a real game on the local engine,
taken by [`artifacts/player-web/e2e/readme-shots.ts`](../../artifacts/player-web/e2e/readme-shots.ts). The script's
header explains the game it plays. The goals are dealt at random, so every run shows different cards and boards.

To retake them:

```sh
pnpm --filter @workspace/engine dev            # wait for "[dev] READY"
pnpm --filter @workspace/engine deploy-static  # in a second terminal
cd artifacts/player-web && node --experimental-transform-types e2e/readme-shots.ts /tmp/readme-shots
```

Then shrink them to WebP (Python with Pillow), from the repository root:

```sh
python3 - <<'EOF'
from PIL import Image
sizes = {"hero": (1600, None), "goal-card": (1200, 960), "agent": (1100, None), "replay": (1600, None)}
for name, (width, crop_height) in sizes.items():
    image = Image.open(f"/tmp/readme-shots/{name}.png").convert("RGB")
    if crop_height:
        image = image.crop((0, 0, image.width, crop_height))
    image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(f"docs/readme/{name}.webp", "WEBP", quality=88, method=6)
EOF
```

Look at each image before committing it, and keep the set small (about 350 KB in all).
