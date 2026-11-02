# Offloading heavy compute from Convex: provider research

Researched 2026-11-02. Prices are list prices from the vendors' own pages fetched that day unless marked
**(unverified)**. Nothing here was benchmarked: latencies are from geography and typical cloud figures, not
measurements. Re-check before committing money.

## Executive summary

**Where Convex runs.** Convex runs on **AWS**, not on Cloudflare Workers. The region docs list four regions, all
`aws-` prefixed: `aws-us-east-1`, `aws-eu-west-1` (Ireland), `aws-ap-southeast-2` (Sydney) and `aws-ca-central-1`.
The region is fixed for the life of a deployment, and non-US regions are billed at 1.3x. Cloudflare only fronts
the public endpoints. Both `*.convex.cloud` and `*.convex.site` resolve to Cloudflare anycast IPs (104.18.x), and
`*.convex.site` answers with `cf-cache-status` and `via: Caddy` headers. The function origin is AWS.

**Our deployments.**
- Dev (`quixotic-gopher-395`) is in `aws-ap-southeast-2`, per the `.convex.site` URL the owner saw.
- Prod (`original-bear-509`) **cannot be determined without credentials.** DNS gives the same Cloudflare IPs as
  dev, and nothing in the repo records it. Check the dashboard (Settings, then Deployment region) or ask the
  owner. If prod is not Sydney, the dev and prod co-location answers differ, so decide this first.

**Latency.**
- Co-location in the same AWS region gives about 1 to 3 ms round trip (same region, possibly cross-AZ).
- Crossing from Sydney to us-east-1 costs about 200 ms round trip, and Sydney to Europe about 250 to 280 ms.
  These are typical figures, not measured.
- So "a few ms per tick" is only achievable for an external service in the same region as the deployment,
  with one batched call per tick. No other placement meets it.
- Providers with a documented Sydney region: AWS Fargate and Lambda, Fly.io, Vercel Sandbox (`syd1`), and Modal
  (`au`/`ap-southeast`, finer placement via sales). Cloudflare Containers do not let you pin a region.
  E2B and Daytona region lists were not found, so Sydney there is unverified.

**Recommendations.**
1. *Agent execution and compilation:* first confirm that a network hop beats running in the Convex action.
   Every external call adds 1 to 3 ms at best, and one batched call per tick is mandatory. If we do offload, use
   **Fly Machines** (2 warm machines in the deployment's region; about $18 to $84 per month, depending on size)
   or **AWS Fargate ARM** in the deployment's region (about $53 to $65 per month plus a load balancer, if we want
   guaranteed same-region AWS). **AWS Lambda with provisioned concurrency** is the cheapest warm option
   (about $22 per month) but gives no process-level state. The sandbox vendors (E2B, Daytona, Modal Sandboxes,
   Vercel Sandbox) are the wrong tool here: per-second sandbox premiums, 24 h session caps, and no region control.
2. *Assistant code runner:* use a **sandbox vendor**. **E2B** is the recommendation: Firecracker isolation,
   per-second billing, real numpy/pandas templates, pause/resume for per-session state, and about $0.19 per month at
   our volume (covered by the one-time $100 Hobby credit). Alternates are **Vercel Sandbox** (has `syd1`, persistent
   sandboxes and snapshots, fits the Hobby free quota, but Hobby is non-commercial) and **Modal** (best if the
   analytics get heavy). Latency does not matter, so region is irrelevant.

## Comparison table

| Provider | Regions near us | Pricing model | Cold start | Memory/limits | Isolation* | Workload 1 | Workload 2 | Ops burden |
|---|---|---|---|---|---|---|---|---|
| Fly Machines | `syd` exists (1.269x iad price) | Per second while running; stopped = $0.15/GB rootfs | Start from stopped: sub-second to a few seconds (unverified) | Up to dedicated 8+ vCPU; we need 1 vCPU/1 GB | Firecracker microVM | **Good**: warm pair, public anycast, cheap | Fine (start-on-demand), no sandbox SDK | Low-medium: we write Dockerfile, auth, deploy |
| Fly Sprites | Unverified | Active time only: $0.0385/CPU-h, $0.021875/GB-h (one source says $0.07 and $0.04375) | Wake time unverified | Per-Sprite persistent VM | Firecracker microVM | Poor: billed active time, not a warm pool | **Good**: persistent per-session state | Low |
| Cloudflare Containers | No region pinning; "nearest free" location | $0.000020/vCPU-s active, $0.0000025/GiB-s provisioned, $5/mo plan | 1 to 3 s documented | Max 4 vCPU/12 GiB; basic = 1/4 vCPU, 1 GiB | Per-instance VM (unverified) | Poor: Worker+DO in path, no Sydney guarantee, scales to zero | OK: fits cold bursts | Medium: Workers/DO model |
| AWS Fargate (ECS) | `ap-southeast-2`, same region as dev | $/vCPU-h + $/GB-h, 1 min minimum, Spot -70% | Tens of seconds (unverified) | Up to 16 vCPU/120 GB | Firecracker per task | **Good** if co-located; needs ALB (about $16/mo, unverified) | Poor: slow cold start, no per-run sandbox SDK | High: VPC, ALB, IAM, deploys |
| AWS Lambda | `ap-southeast-2` | $0.0000166667/GB-s (us-east-1 x86), provisioned concurrency $0.0000041667/GB-s | Hundreds of ms to ~1 s; zero if provisioned | 128 MB to 10 GB, 15 min | Firecracker | OK: provisioned concurrency is cheap, but no persistent process state | OK for stateless; numpy/pandas via layers/image | Medium |
| Google Cloud Run | Sydney exists; tier unverified | Per vCPU-s + GiB-s; request-based or instance-based | ~1 to 3 s (unverified) | Up to 8 vCPU/32 GiB | gVisor / microVM (gen2) | OK: min-instances; cross-cloud to AWS, not co-located | OK | Medium |
| E2B | Region list not found; Sydney unverified | $0.000014/vCPU-s + $0.0000045/GiB-s; Pro $150/mo | Sub-second (vendor claim, not fetched) | 1 to 8 vCPU/1 to 8 GiB; Hobby 1 h sessions, Pro 24 h | Firecracker | Poor: 24 h cap, premium price, no region | **Best**: sandbox SDK, templates, pause/resume | Lowest |
| Modal Sandboxes | `au`, `ap-southeast`, `ap-melbourne`; 1.15x to 1.75x multiplier | $0.00003942/core-s + $0.00000667/GiB-s (sandbox 3x function rate) | No figure published | Min 0.125 core; 1 core = 2 vCPU | gVisor (unverified) | Poor as Sandbox; plausible as Function with `min_containers` | Good: strong Python, image building | Low-medium |
| Daytona | Reported US/EU/India; Sydney unverified | $0.0504/vCPU-h + $0.0162/GiB-h; $200 one-time credit | "Sub 90 ms" (vendor claim) | Defaults not stated | Containers by default (unverified) | Poor | OK; licensing/self-host status is in flux (sources conflict) | Low |
| Vercel Sandbox | **`syd1` (ap-southeast-2)** among 19 | Active CPU $0.128/h, memory $0.0212/GB-h (iad1; rates vary by region), $0.60/1M creations | Not published | Pro 8 vCPU/16 GB; session 45 min Hobby / 24 h Pro | Firecracker | Poor: 24 h cap, active-CPU model hides memory floor | **Good**: syd1, persistent sandboxes, snapshots | Low |

\* Isolation column is background knowledge unless the row says otherwise; it was not re-verified this session.

## Cost estimates

Month = 730 h. Scenario (a): 2 instances at about 1 vCPU/1 GB, 24/7 (1,460 instance-hours). Scenario (b): 2,000 runs
x 5 s = 10,000 s (2.78 h) at 1 vCPU/1 GB.

| Provider | (a) warm pool of 2, per month | (b) runner at 2,000 runs, per month |
|---|---|---|
| Fly Machines | shared-cpu-4x 1GB: 2 x $8.78 = $17.56 (iad); about $22 in syd (assumes the 1.269x). performance-1x 2GB: 2 x $41.89 = **$83.78** (syd) | performance-1x: 2.78 h x $0.058 = $0.16 plus rootfs; shared-cpu-4x: $0.03 |
| Fly Sprites | Not suited (active-time billing) | 2.78 h x ($0.0385 + $0.021875) = **$0.17** (or $0.31 at the higher quoted rates) |
| Cloudflare Containers | `basic` (1/4 vCPU, 1 GiB), always-on: memory 2 x $6.57 + disk 2 x $0.74 + CPU about 10% of 1 vCPU (2 x $5.26) = about $25, plus $5 plan = **about $30** | `standard-2` (1 vCPU, 6 GiB): about $0.35 compute + $5 plan = **about $5.35** |
| AWS Fargate (x86 / ARM, us-east-1 rates) | 1,460 h x $0.0449 = **$65.6** (x86); 1,460 h x $0.036 = **$52.6** (ARM). Sydney unverified, roughly +10 to 25% | 2,000 tasks x 60 s min = 33.3 h x $0.0449 = **$1.50** (x86). Not interactive: slow start |
| AWS Lambda (us-east-1) | Provisioned concurrency 2 x 1 GB: 2 x 2,628,000 s x $0.0000041667 = **$21.9**, plus $0.0000097222/GB-s while executing and $0.20/M requests | 10,000 GB-s x $0.0000166667 = $0.17, inside the free tier = **$0** |
| Google Cloud Run | Unverified. Instance-based, always-on, about $0.000018/vCPU-s + $0.000002/GiB-s (tier 1, from memory) = about $105; tier 2 higher | Inside the free tier = **about $0** (unverified) |
| E2B | 1,460 h x $0.0666 = **$97** + $150 Pro plan = **$247** (and 24 h session cap forces recycling) | 10,000 s x $0.0000185 = **$0.19**, covered by the one-time $100 Hobby credit; Hobby limits (1 h sessions, 20 concurrent) are enough |
| Modal Sandboxes | 2 x 2,628,000 s x ($0.0000197 + $0.00000667) = **$138.7**, less $30 free credit = about $109 (+15% for a broad region pin). As Functions with min containers: about $46 | 10,000 s x $0.0000264 = **$0.26**, covered by $30/month Starter credit = **$0** |
| Daytona | 1,460 h x $0.0666 = **$97** | **$0.19**, covered by the $200 credit |
| Vercel Sandbox (iad1 rates; syd1 differs, unverified) | Memory 1,460 GB-h x $0.0212 = $30.95 + active CPU (assume 10% utilisation) 146 h x $0.128 = $18.7 = **about $50** (+ Pro plan; sessions cap at 24 h) | 2.78 h x $0.0212 + 2.78 h x $0.128 = **$0.42**; fits Hobby free quota (non-commercial) |

Not counted: load balancers, egress, logs, engineer time. Fargate in particular needs a public endpoint reachable
from Convex, so add an ALB. Fly and Cloudflare include a public ingress.

## Uncertain or unverifiable

- **Prod region.** Not discoverable without credentials. Everything region-specific for production is therefore
  conditional. Convex regions are immutable, so a mismatch means a new deployment plus data migration.
- **Sprites rates.** One fetch of fly.io/pricing.md gave $0.0385 per CPU-hour and $0.021875 per GB-hour, while a
  search summary quoted $0.07 and $0.04375. Third-party text suggests a 2026 price cut. The table uses the lower
  figure and the range is noted. Sprites regions and wake time were not found (the billing docs URL returned 404).
- **Sydney prices** for Fargate, Lambda, Cloud Run and Vercel Sandbox were not retrievable. Figures are us-east-1
  (or iad1) with an estimated uplift. Cloud Run tier assignment for Sydney and its current rates are unverified.
- **Region lists** for E2B and Daytona, and any Sydney availability, were not found. Daytona's open-source/closed
  status is reported inconsistently.
- **Cold starts** were published only for Cloudflare Containers (1 to 3 s) and Daytona ("sub 90 ms", vendor claim).
  Others are general knowledge, flagged above. Modal and Vercel Sandbox publish no figures on the pages fetched.
- **Latency numbers** are typical values, not measurements. Before choosing, run a 1,000-call ping from a
  Convex Node action to the candidate endpoint in the deployment's region.
- **Isolation column** and Lambda's ~0.57 vCPU at 1 GB are background knowledge, not re-verified.
- **Pricing changes quickly** in this market (Fly raised RAM prices in 2026 and changed Sprites pricing).

## Sources

All fetched 2026-11-02.

- Convex regions: https://docs.convex.dev/production/regions
- Convex EU region launch (6 Feb 2026): https://ship.convex.dev/changelog/eu-region-hosting-dublin
- DNS and HTTP headers: `curl -I` on `original-bear-509` and `quixotic-gopher-395` `.convex.cloud` / `.convex.site`
  (Cloudflare IPs, `convex-usher`, `via: Caddy`)
- Fly pricing: https://fly.io/pricing.md and https://docs.fly.io/about/pricing
- Fly Sprites billing: https://docs.fly.io/sprites/reference/billing (404 on fetch); search snippet via
  https://fly.io/changelog/new-sprites-plans/
- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Cloudflare Containers limits: https://developers.cloudflare.com/containers/platform-details/limits/
- Cloudflare Containers FAQ (cold starts, placement): https://developers.cloudflare.com/containers/faq/
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- Google Cloud Run pricing: https://cloud.google.com/run/pricing (page content did not load; figures unverified)
- E2B pricing: https://e2b.dev/pricing
- Modal pricing: https://modal.com/pricing and region selection: https://modal.com/docs/guide/region-selection
- Daytona pricing: https://www.daytona.io/pricing
- Vercel Sandbox pricing: https://vercel.com/docs/sandbox/pricing (page dated 2026-09-10) and regions:
  https://vercel.com/docs/sandbox/concepts/regions (2026-09-22)
