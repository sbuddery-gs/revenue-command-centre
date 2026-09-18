# Revenue Command Centre

A working prototype that visualises the customer revenue book from **Gainsight CS**
(pulled live over MCP), with a rotating globe of customer sites, renewal exposure,
Gainsight risk signals, a site-visit planner, and a **risk-renewal siren** that
drafts an editable Slack message.

## Run it

```bash
python3 -m http.server 8777
```

Then open <http://localhost:8777>. No build step, no dependencies, works offline.

## What's on screen

| # | Section | What it answers |
|---|---------|-----------------|
| — | KPI strip | Portfolio ARR, ARR renewing by 31 Mar 27, ARR carrying risk, risk∩renewal overlap, red-health ARR |
| 01 | Global Revenue Map | Where the customers are. Three modes: **ARR**, **Renewals**, **Risk**. Drag to rotate, scroll to zoom, click a marker or a market row to fly to it. The violet ring is your base (London). |
| 02 | Risk Renewal Near Me | The nearest account that has an open Gainsight **risk CTA** *and* enough renewal runway left to actually visit — with the real CTAs listed |
| 03 | Risk Register | All 29 accounts carrying open risk. Click any card to open the **account drawer**. Sort by exposure, renewal clock or distance |
| 04 | Sites I Can Visit Before Renewal | Ranked travel plan: renewals 14–120 days out, ordered by travel time from London, weighted up for open risk and ARR |
| 05 | Renewal Runway | ARR up for renewal by month, stacked by Gainsight health colour |

## Theming

A sun/moon switcher sits in the header. It follows your OS preference on first
visit, remembers an explicit choice in `localStorage` (`rcc-theme`), and keeps
following the OS only while you have not chosen one.

**Light mode is built on Gainsight's own interface palette**, sampled from
gainsight.com rather than guessed:

| Role | Value |
|---|---|
| Page | `#F6F4F3` — Gainsight's warm off-white, not a cool grey |
| Surface | `#FFFFFF` |
| Rules | `#EFEBE8` / `#DAD1CA` (warm greige) |
| Text | `#2F3338`, muted `#6F6C66` |
| Primary | `#146AFF` |
| Deep navy | `#0B3355` |
| Green | `#32AE88` |

Every colour is a CSS custom property declared once per theme at the top of
`styles.css` — there are no colour literals anywhere else in the stylesheet, and
none in the markup that `app.js` generates. Three implementation notes:

- **The canvas globe cannot read CSS variables**, so `readTheme()` in `app.js`
  resolves the `--globe-*` properties once per theme change and caches them for
  the render loop. The stylesheet stays the single source of truth for both.
- **Status hues carry a separate `-ink` variant** for text. Gainsight's `#146AFF`
  measures 4.2:1 on white — right for their large link text, short of AA for
  9–10px labels — so `--cyan-ink` (`#0B52D4`) is used wherever blue is text and
  `--cyan` stays on fills, borders and the globe. Same split for red/amber/green.
- **The swap is deliberately instant.** Transitioning `background-color` from a
  `var()` that has just changed leaves Chromium's computed value stuck at the old
  colour — `body` stayed dark under light tokens — and animating a full-page
  background reads as jank anyway.

Both themes were audited for contrast with alpha-composited backgrounds across 32
text/background pairs: all pass WCAG AA (minimum 4.56:1 dark, 4.57:1 light).

## The account drawer

Clicking an account anywhere — a risk register card, an account under a selected
market, a name in a visit card, or **Explore risk & actions** in section 02 — opens a
two-column drawer.

**Left: the evidence, all from Gainsight.**

- Risk posture: Gainsight health, Staircase AI health, sentiment, total open CTAs,
  executive sponsor, last QBR. Anything Gainsight has not scored reads *"not scored"*
  rather than showing a misleading `0`.
- Staircase AI signals as chips — which of the seven are firing and which are clear:
  account dark, no renewal discussion, no meetings, single-threaded, no exec-to-exec
  contact, slow responses, stakeholder not engaged.
- Every open risk CTA with priority, type, reason, due date and owner.
- The account narrative where Gainsight holds one: risk synopsis, root cause, what
  the customer told us, what has already been tried, and the definition of resolved.
  Only 3 of the 29 accounts have these fields filled in; the rest say so explicitly.

**Right: recommended actions to resolve.**

A plan generated from the left-hand evidence. Each action carries a priority, the
reason it is being recommended, an owner, a by-date and an effort estimate, plus the
signal that triggered it (`CTA: Support Escalation`, `Signal: Account dark`,
`Renewal clock`, `Proximity`, `Cadence gap`).

Two things make the ranking useful rather than decorative:

- **Already-tried detection.** Plays are matched against the account's *"what has
  already been tried"* text. On Abbett, which records an emergency EBR plus a shared
  usage report and ROI framework, five plays are automatically demoted to
  *"already tried — escalate rather than repeat"*.
- **Narrow escalation.** A Critical CTA escalates only the plays *it* triggered, not
  every play on the account; and the renewal clock escalates only plays whose normal
  lead time would overrun the renewal date. Without both constraints every action
  collapses to P1 and the ranking stops meaning anything.

`Copy action plan` produces a plain-text brief — evidence, narrative and the numbered
plan — for pasting into a CTA, a QBR doc or an email. `Raise siren` hands the account
straight to the Slack composer, and `Next risk →` walks the register in the drawer.

> The playbook lives in `app.js` (`PLAYS`, `SIGNAL_PLAYS`, `resolutionPlan`) — not in
> `data.js`. Recommendations are generated, deliberately separate from the Gainsight
> facts, and labelled as such in the UI.

## The siren

The **SIREN** button (top right, or the button inside section 02) opens a composer that:

1. picks the account — defaults to the nearest risk renewal, any at-risk account selectable;
2. generates a Slack `mrkdwn` message from the real Gainsight fields — ARR, renewal
   date, days remaining, health, CSM, site, travel time, and every open risk CTA with
   its priority, reason, due date and owner;
3. lets you **edit it freely** before anything leaves the building;
4. **Post to Slack** copies the message and opens the channel (default `#emea-renewals`).

> The prototype deliberately never posts on your behalf. It stages the message and
> opens Slack so the last click is always yours.

### The sound

Raising the siren plays a 1.45s two-tone wail — three sweeps between 620Hz and
980Hz, two detuned sawtooths through a lowpass, with an attack/decay envelope so
it neither clicks nor startles. It is **synthesised with the Web Audio API**, so
there is no audio file in the repo, no network fetch, and it still works offline.

The speaker fused to the right-hand edge of the Siren button mutes it — the two
read as one control so the speaker is unmistakably the siren's. The choice persists in
`localStorage` (`rcc-siren-muted`). Muting suppresses the sound only — the
composer still opens, because the audio is decoration, not function. Rendered
offline and measured at peak 0.125 with no clipping: audible, not blaring.

## Data provenance

Built from two Gainsight MCP extracts, checked into `data/`:

- `data/gainsight-companies.psv` — 295 accounts: name, ARR, renewal date, region,
  health score label, CSM, industry.
- `data/gainsight-risks.psv` — 40 open risk CTAs (types Risk / AI Insights / Renewals)
  with priority, reason, due date and owner.
- `data/gainsight-risk-detail.json` — company-level risk detail for those 29 accounts:
  risk narratives, Staircase AI signal flags, sentiment, churn-risk level, exec sponsor,
  last QBR. Gainsight stores "not scored" as `0` for the Staircase measures, which
  `build_data.py` normalises to `null`.

`build_data.py` joins them into `data.js` and prints a reconciliation report.

```bash
python3 build_data.py
```

Every headline figure was cross-checked against independent Gainsight aggregate
queries and matches exactly:

| Figure | Dashboard | Gainsight aggregate |
|---|---|---|
| Accounts / ARR | 295 / $15,540,000 | 295 / $15,540,000 |
| NA | 191 / $9,990,000 | 191 / $9,990,000 |
| EMEA | 59 / $3,185,000 | 59 / $3,185,000 |
| APAC | 30 / $1,640,000 | 30 / $1,640,000 |
| LATAM | 15 / $725,000 | 15 / $725,000 |
| Renewals to 31 Mar 27 | 163 / $7,955,000 | 163 / $7,955,000 |
| Accounts with open risk | 29 (40 CTAs) | 29 (40 CTAs) |

### One important caveat on geography

Gainsight holds **Region** (NA / EMEA / APAC / LATAM) for these accounts but **no city
or usable street address** — `Billing_Street__gc` is unpopulated in this tenant. So:

- **Real Gainsight data:** region, ARR, renewal date, health, CSM, industry, and all risk CTAs.
- **Derived for the prototype:** the specific *city* each account sits in. Each account is
  pinned to a city inside its real region via a stable hash of its name, so placement is
  consistent between runs but is **not** the customer's actual address. Ten accounts are
  hand-pinned in `build_data.py → PINNED` to make the "near me" narrative concrete.

Travel times from London are computed from great-circle distance (rail hours are
hand-set for European city pairs). Treat the globe as directionally right about
*where your revenue is concentrated by region*, and as illustrative at city level.

To make the city layer real, populate an address or city field in Gainsight and swap
the `CITIES` / `PINNED` logic in `build_data.py` for a lookup on that field.

## Files

```
index.html   markup + pre-paint theme bootstrap
styles.css   dual-theme token system (dark + Gainsight light)
app.js       globe projection, panels, risk playbook, account drawer,
             Slack composer, Web Audio siren, theming
data.js      generated — do not hand-edit
build_data.py
data/gainsight-companies.psv
data/gainsight-risks.psv
data/gainsight-risk-detail.json
```

The globe is plain Canvas 2D with an orthographic projection and a coarse built-in
coastline — no mapping library, no tile server, no network calls.
