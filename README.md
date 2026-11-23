# Global Election Monitor — "Global Electoral Pulse"

A self-hosted, real-time election monitoring dashboard for **Nigeria, the United States, the United Kingdom, Australia and New Zealand**.

It brings together:
- official results feeds, and INEC declared results going back to 2011;
- live broadcaster video;
- election news;
- crowd reports.

All of it is shown on one screen, with interactive maps, a year-by-year archive and a tamper-evident audit ledger.

- **Zero dependencies.** It needs only Node.js 18 or newer: no `npm install`, no database, no build step.
- **Real data by default.** Every number on screen comes from a public source and is labelled with it. Test feeds and simulations are clearly marked, and are off unless you switch them on.
- **Free to run.** It uses only free, keyless public sources and keyless basemaps. Paid or approval-only feeds plug in from the Settings page when you have them.

> Poliwave was the reference for the product. The interface follows the Stitch "Telemetry Civic" light design system and the "Command Center" dark design system.

---

## Contents

1. [Quick start](#quick-start)
2. [What's on each screen](#whats-on-each-screen)
3. [Data sources](#data-sources)
4. [Election years and the results archive](#election-years-and-the-results-archive)
5. [Nigeria: declared results dataset](#nigeria-declared-results-dataset)
6. [Maps](#maps)
7. [Live video (Stream Wall)](#live-video-stream-wall)
8. [Settings and configuration](#settings-and-configuration)
9. [Live mode vs simulation mode](#live-mode-vs-simulation-mode)
10. [Moderation, crowd reports and the audit ledger](#moderation-crowd-reports-and-the-audit-ledger)
11. [HTTP API](#http-api)
12. [Architecture and project layout](#architecture-and-project-layout)
13. [Development](#development)
14. [Troubleshooting](#troubleshooting)
15. [Known limitations and roadmap](#known-limitations-and-roadmap)
16. [Credits, licences and terms of use](#credits-licences-and-terms-of-use)

---

## Quick start

### Windows

1. Install **Node.js 18+** from <https://nodejs.org>.
2. Download or clone this repository.
3. Double-click **`start.bat`**.

`start.bat` opens the dashboard in your browser, normally at **http://127.0.0.1:4380**. It also restarts the server automatically when you click **Save & restart server** in Settings.

### macOS / Linux

```bash
git clone https://github.com/kayfreeman/Global-Election-Monitor.git
cd Global-Election-Monitor
npm start            # same as: node server/server.js
```

Then open the address printed in the terminal.

### Notes

- **Port.** The default is `4380`. If that port is busy or reserved, the server tries others and prints the address it chose, which is also saved to `data/url.txt`. To fix the port, set `GP_PORT=9000` in `.env`. The dashboard uses `GP_PORT` rather than `PORT`, so a system-wide `PORT` set by other software can't take it over.
- **Logs.** Start-up messages and errors are written to `data/server.log`.
- **Access.** The dashboard listens on `127.0.0.1`, this computer only, by default. To open it on your network, see [Moderation](#moderation-crowd-reports-and-the-audit-ledger).
- **Internet.** The first run needs internet access to fetch results, boundaries, news and video.

---

## What's on each screen

Navigation is grouped into **Results** (Overview, Live Results, Map, Drilldown), **Media** (News, Streams, Signals) and **Integrity** (Ledger), plus a **Settings** gear. On narrower windows the tabs collapse to icons; the active tab keeps its label and every icon has a tooltip.

| Tab | Route | What it does |
|---|---|---|
| **Overview** | `#/command` | <ul><li>One card per country showing the headline result for the selected election year: the winner, the runner-up, their vote shares and the total votes.</li><li>A live video panel with a feed switcher; ● marks channels that are on air.</li><li>A verification wire, the latest results for the selected country and year, and election headlines.</li><li>A poll average compared with the actual returns.</li></ul> |
| **Live Results** | `#/live/<COUNTRY>` | <ul><li>Every result for the country and year, from official sources and live feeds.</li><li>**Nigeria:** INEC declared results. Each election opens to a table by state (presidential) or by LGA (governorship), with the winner per row and a source link.</li><li>**Nigeria, current year:** an INEC IReV upload tracker (election › LGA › ward › polling unit) with links to each EC8A result-sheet image.</li></ul> |
| **Map** | `#/map/<id>` | <ul><li>An interactive Leaflet map with real administrative boundaries.</li><li>Areas are coloured by the declared winner for the chosen year, with a "Colour by" switch when a year has both presidential and governorship elections.</li><li>Click an area for its vote breakdown and IReV upload progress; double-click a Nigerian state for its LGAs.</li><li>Exports to CSV and GeoJSON.</li></ul> |
| **Drilldown** | `#/drilldown/<id>` | <ul><li>Cascading reports: every area is a report and its sub-areas are sub-reports (Country › State › LGA › Ward › Polling Unit for Nigeria).</li><li>Includes a breadcrumb, a searchable explorer, figures, sub-report tables and CSV export.</li><li>Available in simulation mode only; in live mode it points to Live Results.</li></ul> |
| **News** | `#/news` | Election headlines from publisher RSS feeds and the GDELT global news index, filterable by country. Headlines and links only. |
| **Streams** | `#/wall` | <ul><li>A multi-camera wall (2×2, 3×2 or 1+5 focus layouts) of broadcasters' live YouTube channels.</li><li>An audio matrix to mute, solo or change the volume of each channel.</li><li>A feed editor.</li></ul> |
| **Signals** | `#/signals` | <ul><li>Merged wire, crowd reports and social posts.</li><li>Rumour-spike detection, plus topic and sentiment filters.</li><li>A field-report form and a moderation queue.</li></ul> |
| **Ledger** | `#/ledger` | <ul><li>An incident register and a SHA-256 hash-chained audit ledger, with a **Verify chain** button.</li><li>Data lineage and CSV export.</li></ul> |
| **Settings** | `#/settings` | Every integration in one place: data mode, results sources, news feeds, API keys, map basemap, polls, declared results and server options. See [Settings](#settings-and-configuration). |

**Always visible:**
- a country ticker;
- the jurisdiction filter and the **Election year** picker in the sidebar;
- a **Sources health** bar at the bottom, showing the real status of every source (`LIVE`, `TEST DATA`, `KEY SET`, `NEEDS KEY`, `NO ACCESS`, `ERROR`, `OFF`).

---

## Data sources

### Results

| Country | Source | What you get | Access |
|---|---|---|---|
| 🇳🇬 Nigeria | **INEC IReV** (public endpoints used by inecelectionresults.ng) | <ul><li>Every presidential and governorship election on IReV (2020–2026).</li><li>Upload progress.</li><li>The real list of LGAs, wards and polling units.</li><li>A link to each polling unit's EC8A result-sheet **image**.</li></ul> | Free. INEC's IReV terms of use apply. IReV publishes **images, not vote numbers**. |
| 🇳🇬 Nigeria | **INEC declared results** (bundled dataset) | Presidential results 2011–2023 by state; governorship results 2019–2026 by LGA where published. | Bundled; see [below](#nigeria-declared-results-dataset). |
| 🇺🇸 USA | **Louisiana Secretary of State** results JSON | Statewide and multi-parish races for every Louisiana election date: votes, precincts reporting and winners. Includes the 12 Dec 2026 runoffs. | Free, public. |
| 🇬🇧 UK | **Democracy Club** CSV export | Declared first-past-the-post contests (council by-elections, Police and Crime Commissioners and others) by date. | Free, CC-BY: credit Democracy Club. |
| 🇦🇺 Australia | **Victorian Electoral Commission** results feed (XML) | Victorian state election (28 Nov 2026): first preferences, two-candidate-preferred counts and voting centres returned. | Free, but needs a signed **VEC terms-of-use agreement**. **Off** by default. A public *sample* replay is available in Settings for checking the screens; it is labelled TEST DATA. |
| 🇦🇺 Australia | AEC media feed | Federal elections only. | Free registration (mediafeed@aec.gov.au). No federal election is scheduled. |
| 🇳🇿 New Zealand | Electoral Commission | — | electionresults.govt.nz is behind a bot check. Request media-feed access from media@elections.govt.nz. |
| 🇺🇸 🇬🇧 🇦🇺 | **[Election.org](https://election.org/data/api) public data API** | <ul><li>Official certified **US House and Senate** results for 2020, 2022 and 2024, published by the FEC and the House Clerk.</li><li>The **2024 US presidential election** by state, compiled by the FEC.</li><li>The **UK 2024 general election**: all 650 constituencies and every candidate.</li><li>The **Australia 2025 federal election**: all 150 divisions, first preferences and two-candidate-preferred counts.</li></ul> | Free and read-only. Works without a key; an optional `ELECTION_API_KEY` (in `.env` only) is used for US results. Credit: "Data via Election.org". |
| 🇺🇸 USA (all states) | AP Elections API | Race calls for every state. | **Paid** licence (`AP_API_KEY`). |

### News

| Source | Notes |
|---|---|
| **Publisher RSS** (10 by default) | Premium Times, Channels TV, Vanguard (NGA); NPR and Politico (USA); ABC News Australia and the Guardian Australia (AUS); BBC Politics and the Guardian UK politics feed (GBR); RNZ Politics (NZL). Add, edit or disable feeds in Settings. General feeds are filtered to election topics. |
| **GDELT DOC 2.0** | A free, keyless global news search with one query per country. It rate-limits shared connections, so the dashboard queries the countries in rotation and pauses for 30 minutes if GDELT returns "429 Too Many Requests". |

Only headlines and links are stored. Check each publisher's RSS terms before any public or commercial use; BBC and RNZ allow personal, non-commercial use.

### Social and crowd sources

| Source | Status |
|---|---|
| Native crowd reports | **Live.** First-party, rate-limited, and moderated before verification. |
| X API | Needs a token (`X_BEARER_TOKEN`) and is **pay-per-use**. Set a spend cap first. |
| Reddit | Needs an app ID and secret. The free tier is for non-commercial use only. |
| Meta Content Library | No access: it is for vetted researchers only. |
| Nairaland | No API; would need permission or a review of its terms. |

The footer and Settings always show the *true* state of every source. Nothing is ever shown as live when it isn't.

---

## Election years and the results archive

Pick an **Election year** in the sidebar, on the Overview, on Live Results or on the Map. Each country keeps its own year.

| Country | Years available | How |
|---|---|---|
| Nigeria | 2011, 2015, 2019–2026 | Bundled INEC declared results, plus IReV's list of elections for each year. |
| USA | 2020, 2022 and 2024 nationwide, plus every year on the Louisiana SoS calendar | Election.org: House and Senate in all three years, presidential by state in 2024. The Louisiana SoS covers its own elections. Each year is fetched the first time it is opened, then cached in `data/archive/`. |
| UK | 2016 to now; 2024 general election | Democracy Club results for every Thursday (UK polling day) of the year; the first load of a past year takes about a minute, then it is cached. Election.org adds the 2024 general election, with the map coloured by nation. |
| Australia | 2025 | Election.org: the 2025 federal election, with the map coloured by state. |
| NZ | Current year only | No free year-by-year source with a party breakdown. |

Past years are cached on disk permanently; the current year refreshes every 30 minutes. A slow or unreachable IReV never holds up the page: its list of elections is awaited for at most 3 seconds.

---

## Nigeria: declared results dataset

`server/data/declared-nga.json` contains **72 elections**:

- **Presidential:** 2011 (overall result), 2015, 2019 and 2023 (results by state, including the FCT).
- **Governorship:**
  - 2019, including off-cycle Kogi and Bayelsa;
  - 2020: Edo, Ondo;
  - 2021: Anambra;
  - 2022: Ekiti, Osun;
  - 2023: all 28 states in March, plus Bayelsa, Imo and Kogi in November;
  - 2024: Edo, Ondo;
  - 2026: Osun.
  
  LGA breakdowns are included where the source has them (29 elections).

### Provenance and quality checks

The figures are **INEC declared results**, taken from the results tables of the Wikipedia article for each election, which cite INEC. The tables were read directly rather than retyped. Each election was then checked:

- **LGA or state totals:** the area breakdown had to add up to the declared result within 3% (29 elections).
- **Two parts of the page:** the article's summary box and its results table had to agree (42 elections).
- **Single source:** one election (Kaduna 2019) has only one source on the page. It is labelled "Single source — verify against INEC" on screen.

Errors found during the checks were corrected, and each correction is explained on screen:

| Election | Issue | Fix |
|---|---|---|
| Taraba 2023 | Wikipedia shows the winner on 302,614 votes, a figure misreported by one news outlet. | Corrected to INEC's declaration: **PDP 257,926 · NNPP 202,277 · APC 142,502**. |
| Sokoto 2019 | Party labels were swapped. | Tambuwal (**PDP**) 512,002; Ahmad Aliyu (**APC**) 511,660. |
| Gombe 2019 | A stray "Other candidates" row with more votes than the winner. | Removed. |
| Jigawa 2019 | The Guri LGA row was duplicated. | The duplicate was removed. |
| Katsina 2023 | The LGA table had duplicated and blank rows. | The LGA breakdown was dropped; the overall result is kept. |
| Imo 2019, Zamfara 2019 | Courts later changed the winner. | The declared figures are shown, with a note about the later Supreme Court rulings. |

Within each election, candidates beyond the top six are combined into "Others", and area tables keep the four main candidates. "Declared winner" means the candidate INEC declared, not the final outcome after any court challenge.

**Not yet included:** Ekiti 2026, Anambra 2025, Delta 2023 and Bauchi 2019. Their source pages have no machine-readable table. Add them in **Settings → Declared results** from the returning officer's announcement; entries are saved to `data/declared-user.json` and recorded in the ledger.

> Verify figures against INEC (inecnigeria.org) before publishing them.

---

## Maps

- **Boundaries:** [geoBoundaries](https://www.geoboundaries.org) simplified boundaries at ADM1 (state/region) and ADM2 (LGA/county) level. They are downloaded on first use and cached in `data/geo/`. Nigerian boundaries come from GRID3 via geoBoundaries (CC BY 4.0).
- **Basemaps:** all keyless:
  - **Esri Light Gray** (the default);
  - Esri Streets;
  - OpenStreetMap;
  - OpenStreetMap France;
  - no basemap;
  - your own tile URL.
  
  CARTO is not used because it now requires an API key. If the dashboard becomes public with heavy traffic, OpenStreetMap asks large users to host their own tiles; use the custom tile URL option for that.
- **Map library:** Leaflet 1.9.4, loaded from unpkg. If it can't load (no internet), the map falls back to a tile-grid layout.
- **Colouring:** each area is coloured by its declared or leading party. In Nigeria's current year, states with no declared result yet are coloured by IReV upload progress.
- **Selection:** the area you click stays selected through the live refreshes, and the inspector keeps its scroll position.

---

## Live video (Stream Wall)

The wall comes pre-loaded with broadcasters' free live channels on YouTube:

| Country | Channels |
|---|---|
| NGA | Channels Television, TVC News |
| USA | NBC News NOW, LiveNOW from FOX |
| GBR | Sky News, GB News |
| AUS | ABC News Australia, 9News Australia |
| NZL | 1News (TVNZ) |

**How it works:**

- **Finding the live broadcast.** You store a *channel* link, such as `https://www.youtube.com/@channelstelevision`. The server reads that channel's public `/live` page to find which video is streaming right now; there is no API key and no quota. It checks again every 3 minutes. Live video IDs change with every broadcast, so they can't be stored in advance.
- **Off-air channels** show "Not live right now" and switch on by themselves when the channel goes live.
- **Blocked embedding:** some broadcasters block their streams from playing on other sites. Every tile has an **Open on YouTube ↗** link for that case.
- **Other sources:** single YouTube videos (watch or youtu.be links), any embeddable player (iframe) and direct video files also work.
- **Editing:** use **Configure feeds**; **Restore broadcaster defaults** puts the list back.

---

## Settings and configuration

Everything is editable in the **Settings** tab; no file editing is needed. Settings changes need moderator access, which is automatic on the computer running the server.

| Section | What you can change |
|---|---|
| Data mode | **Live** (default) or **Simulation**. Applies instantly. |
| Results sources | <ul><li>Turn IReV, Louisiana, Democracy Club and VEC on or off.</li><li>IReV: elections to track, refresh intervals and request spacing.</li><li>Louisiana: election dates. Democracy Club: how many days back.</li><li>VEC: off, live or sample mode.</li></ul> |
| News feeds | Add, edit, disable or delete RSS feeds; per-country GDELT queries; refresh interval. Each feed shows its status. |
| API keys | AP, X, Reddit, the VEC, AEC and ECNZ feed URLs, and `ADMIN_TOKEN`. Saved to `.env`; values are masked after saving. |
| Map | Basemap choice or a custom tile URL and attribution. |
| Polls | Remove the demo polls; add real polls with a source link. |
| Declared results (Nigeria) | Add an election's declared result. |
| Server | Port (`GP_PORT`) and listen address (`HOST`). |

**Save & restart server** applies source, feed and key changes. When the server was started with `start.bat`, it exits with code 3 and `start.bat` starts it again.

### Files

| File | Purpose | In Git? |
|---|---|---|
| `config.json` | Mode, map, sources, feeds and streams, written by Settings. Example: `config.example.json`. | No |
| `.env` | Secrets and server options, written by Settings. Example: `.env.example`. | No |
| `data/` | Runtime data: the ledger, reports, polls, live cache, boundary cache, archive cache, logs and `declared-user.json`. | No |
| `server/data/declared-nga.json` | Bundled Nigerian declared results. | Yes |

### Environment variables (`.env`)

| Variable | Use |
|---|---|
| `GP_PORT` | Port. Default `4380`; if busy, nearby ports are tried. |
| `HOST` | `127.0.0.1` (default, this computer only) or `0.0.0.0` (whole network; also set `ADMIN_TOKEN`). |
| `ADMIN_TOKEN` | Moderator token for remote access. |
| `ELECTION_API_KEY` | Optional Election.org developer key (free, read-only). Public results work without it. |
| `AP_API_KEY` | AP Elections API (paid). |
| `VEC_FEED_URL`, `VEC_CANDIDATES_URL` | VEC live feed, after approval. |
| `AEC_FEED_HOST`, `ECNZ_FEED_URL` | Australian and NZ commission media feeds. |
| `X_BEARER_TOKEN`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Social sources. |
| `OPEN_BROWSER=1` | Open the browser on start (set by `start.bat`). |
| `GP_SUPERVISED=1` | Lets Settings restart the server (set by `start.bat`). |

---

## Live mode vs simulation mode

- **Live (default).** Every tab shows real data only, and the simulation engine is off. Tabs with nothing real to show say so, rather than filling the gap with demo data. Test feeds are labelled TEST DATA.
- **Simulation.** A local engine generates synthetic results, incidents and social posts for every level of each country's hierarchy, so all screens can be explored end-to-end, for example in training or demos. Synthetic items are labelled `SIMULATED`, and an amber banner is shown. Live Results and News stay real.

Hierarchies used by the Drilldown and simulation:

| Country | Levels |
|---|---|
| USA | Country › State › County › Precinct |
| Australia | Country › State/Territory › Division › Voting Centre |
| Nigeria | Country › Geopolitical Zone › State › LGA › Ward › Polling Unit |
| UK | Country › Nation › Region › Constituency › Ward |
| NZ | Country › Region › Electorate › Voting Place |

---

## Moderation, crowd reports and the audit ledger

- **Crowd reports.** Anyone can submit a field report from Signals. Reports are rate-limited and sit in a moderation queue until a moderator confirms, verifies or rejects them.
- **Moderator access.** Moderators are automatic on the computer running the server. If you open the dashboard to your network (`HOST=0.0.0.0`), set `ADMIN_TOKEN` and enter it in the sidebar.
- **Audit ledger.** Significant events are appended to `data/ledger.jsonl` as a SHA-256 hash chain: each entry includes the previous entry's hash. These events include declared live results, moderation decisions, entered declared results and incidents. **Verify chain** recomputes the whole chain and reports any break. In live mode, simulation entries are hidden.

---

## HTTP API

All endpoints return JSON unless noted. Changes need moderator access (local, or the `x-admin-token` header).

| Area | Endpoints |
|---|---|
| Stream (SSE) | `GET /api/stream`: events `hello`, `tick`, `live`, `news`, `mode` |
| Meta and status | `GET /api/meta`, `/api/ping`, `/api/summary`, `/api/adapters` (= `/api/live/sources`) |
| Live results | `GET /api/live/contests?country=`, `/api/live/irev`, `/api/live/irev/:electionId`, `/api/live/irev/:electionId/ward/:wardId` |
| Year archive | `GET /api/years?country=` → `[{year, sources}]` · `GET /api/archive/:COUNTRY/:YEAR` → `{contests, irev, notes}` |
| Declared results | `POST /api/declared` `{type: "PRES"\|"GOV", year, state, date, source, summary: [[name, party, votes], …]}` |
| News | `GET /api/news?country=` |
| Map boundaries | `GET /api/geo/:COUNTRY/(ADM1\|ADM2)?parent=` |
| Streams | `GET /api/streams`, `PUT /api/streams`, `GET /api/streams/defaults`, `GET /api/streams/resolve?url=` |
| Settings | `GET /api/settings`, `PUT /api/settings`, `PUT /api/settings/secrets`, `POST /api/settings/restart` |
| Hierarchy (simulation) | `GET /api/node/:id` (`?grand=1`), `/api/node/:id/children.csv`, `/api/search?country=&q=` |
| Signals | `GET /api/wire`, `/api/posts`, `/api/incidents` |
| Crowd reports | `GET\|POST /api/reports`, `POST /api/reports/:id/(confirm\|verify\|reject)` |
| Polls | `GET\|POST /api/polls`, `DELETE /api/polls/:id`, `GET /api/polls/average` |
| Ledger | `GET /api/ledger` (`?all=1` includes simulation entries), `/api/ledger/verify`, `/api/ledger.csv` |
| Simulation | `POST /api/sim/(pause\|resume\|reset\|speed)` |

**Poll average.** Each poll is weighted by `sqrt(sample / 1000) × 0.5^(age / 14 days) × mode factor`; smartphone panels have a mode factor of 0.7. Example request:

```json
POST /api/polls
{ "country": "NGA", "pollster": "Name", "fieldStart": "2026-11-10", "fieldEnd": "2026-11-14",
  "sample": 1200, "mode": "phone", "shares": { "APC": 38, "PDP": 27, "LP": 25, "NNPP": 6, "OTH": 4 },
  "source": "https://…" }
```

---

## Architecture and project layout

```
┌──────────────── Browser (vanilla ES modules, no framework) ───────────────┐
│ app.js shell + hash router · core.js state/API/SSE · views/*.js per tab    │
│ Leaflet map · YouTube iframes · prebuilt Tailwind v4 CSS                   │
└───────────────▲──────────────────────────────────────────────▲────────────┘
                │ JSON over HTTP                                │ Server-Sent Events
┌───────────────┴──────────────── Node.js server ───────────────┴────────────┐
│ server.js routes · config.js (config.json + .env) · ledger.js (hash chain) │
│ live/hub.js — one place for all real data ─┬─ irev.js       (INEC IReV)    │
│   cache: data/live-cache.json              ├─ louisiana.js  (LA SoS)       │
│                                            ├─ democracyclub.js (UK)        │
│                                            ├─ vec.js        (Victoria)     │
│                                            ├─ news.js       (RSS + GDELT)  │
│                                            ├─ electionorg.js (US/UK/AU)    │
│                                            └─ youtube.js    (live lookup)  │
│ archive.js — year-by-year results (declared NGA + LA + DC, cached)         │
│ geo.js — geoBoundaries download/cache · sim.js + model/ — simulation       │
│ live/http.js — polite HTTP: per-host spacing, timeouts, retry/back-off     │
└────────────────────────────────────────────────────────────────────────────┘
```

```
server/
  server.js            HTTP + SSE server, API routes, start-up and port fallback
  config.js            defaults, config.json and .env reading and writing, secret masking
  archive.js           year-by-year results archive (NGA declared, USA, UK)
  data/declared-nga.json  bundled INEC declared results (72 elections)
  geo.js               geoBoundaries download, cache and state tagging
  ledger.js            SHA-256 hash-chained audit ledger
  polls.js, jsonstore.js  polls store and weighted average
  sim.js, model/       simulation engine, country definitions, hierarchy store
  live/
    hub.js             live data hub: contests, IReV trackers, news, source status
    http.js            polite fetch with retries
    irev.js            INEC IReV adapter
    louisiana.js       Louisiana Secretary of State adapter
    democracyclub.js   Democracy Club adapter
    vec.js             Victorian Electoral Commission adapter (live / sample / off)
    news.js            RSS and GDELT
    electionorg.js     Election.org results (US federal, UK 2024, Australia 2025)
    youtube.js         default broadcaster channels and keyless live-video lookup
    index.js           starts the adapters; lists sources that need keys or access
public/
  index.html, favicon.svg
  css/tw.css           prebuilt Tailwind v4 utilities (committed, no build needed)
  css/app.css          base and component styles
  js/app.js            shell: header, ticker, navigation, sidebar, footer, router
  js/core.js           shared state, API client, SSE, year selection, basemaps, UI helpers
  js/views/            command (Overview), live, map, drilldown, news, wall, signals,
                       ledger, settings, crowd, streamutil, tilemaps
tools/
  build-css.mjs        rebuilds public/css/tw.css from the classes used in public/
  test-parsers.mjs     parser tests against fixtures copied from real payloads
start.bat              Windows launcher, with the restart loop for Settings
```

---

## Development

- **Run:** `npm start`, then reload the browser. There is no bundler: edit the files in `public/` and refresh.
- **Parser tests:** `node tools/test-parsers.mjs` covers Louisiana, Democracy Club, VEC, RSS and GDELT.
- **CSS:** `public/css/tw.css` is prebuilt and committed. If you add new Tailwind classes:
  ```bash
  npm i -D tailwindcss@4
  npm run build:css         # or: TAILWIND_DIR=/path/to/node_modules/tailwindcss node tools/build-css.mjs
  ```
- **Adding a results source:** write an adapter in `server/live/` that calls:
  - `hub.source({...})` once, to register the source;
  - `hub.upsertContest(contest)` for each result;
  - `hub.status(id, {status, lastError, detail})` to report progress.

  Then start it from `server/live/index.js`. Contests share one shape: `{id, country, source, title, area, date, official, reportingDone, reportingTotal, choices: [{name, party, partyCode, votes, elected}], url}`.
- **Code style:** ES modules, no dependencies, and small functions. Server code must run on Node 18 or newer.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| A page or browser shows another product, such as EDB Postgres on port 8080 | The dashboard runs on **4380**, not 8080. Use the address printed in the server window or saved in `data/url.txt`. |
| "This site can't be reached" | The server isn't running: start `start.bat` and keep its window open. If port 4380 is reserved by Windows, the server picks another port and prints it. |
| The map shows "API KEY REQUIRED" | You're running an old version that used CARTO tiles. Update, restart, and reload with Ctrl+F5. All current basemaps are keyless. |
| A video shows YouTube "Error 153" | YouTube needs to know which site embeds the player. Open the dashboard through `http://127.0.0.1:4380`, not as a local file. Use **Open on YouTube ↗** if a broadcaster blocks embedding. |
| A channel says "Not live right now" | That broadcaster isn't streaming at the moment. The tile switches on by itself when it goes live. |
| `[gdelt] HTTP 429 Too Many Requests` | GDELT is limiting this connection. The dashboard pauses GDELT for 30 minutes automatically; RSS feeds are unaffected. |
| IReV errors or timeouts (504) | IReV slows down under load. Increase *Pause between requests* in Settings. Declared results still load. |
| Old screens or behaviour after an update | Restart the server (`start.bat` or Settings → Save & restart) and press **Ctrl+F5** in the browser. |
| A past UK year takes a while | The first load fetches Democracy Club results for every Thursday of that year (about a minute). After that it is cached. |

---

## Known limitations and roadmap

**Limitations:**

- **Nigerian vote counts during an election.** IReV publishes polling-unit sheets as images, so live vote counts need OCR or transcription. Until then, Nigeria shows upload progress live and declared results once INEC announces them.
- **US coverage.** Historical federal results come from Election.org. Live election-night results only come from Louisiana's feed; other states need the AP licence or one adapter per state.
- **Australia and NZ.** Live results need feed approval from the VEC and the NZ Electoral Commission. For history, only Australia's 2025 federal election is included (via Election.org).
- **Social media.** X and Reddit are subject to cost and terms decisions; there is no Meta or Nairaland access.
- **Drilldown geography.** The Drilldown hierarchy below state level is synthetic. Real polling-unit, ward, county and electorate rosters are planned.

**Roadmap:**

1. OCR of IReV EC8A result sheets → live polling-unit vote counts for Nigeria.
2. Real lower-level rosters (INEC polling units, US county FIPS codes, AEC divisions, NZ electorates) for the Drilldown and map.
3. VEC live feed (after approval) and a NZ media feed.
4. X and Reddit ingestion with spend caps; a social signal pipeline.
5. Hosted deployment: HTTPS, moderator accounts and backups.

---

## Credits, licences and terms of use

**Data:**

- **INEC IReV.** Use is subject to INEC's IReV terms of use.
- **Nigerian declared results.** Compiled from Wikipedia results tables, which cite INEC; Wikipedia text is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each election links to the exact article revision used. Corrections are documented above.
- **Democracy Club.** CC-BY: credit Democracy Club.
- **Election.org.** Credited as "Data via Election.org", with each record's link and its original source (FEC, House Clerk, or the national electoral body). Election.org claims no exclusive rights over public-domain facts; source-specific terms still apply.
- **Louisiana Secretary of State.** Public results data.
- **Victorian Electoral Commission.** The VEC terms of use apply to the live feed.
- **geoBoundaries.** Boundaries are CC BY 4.0; Nigeria's come from GRID3.

**Map:** Esri basemap tiles (Esri, HERE, Garmin, © OpenStreetMap contributors); OpenStreetMap tiles © OpenStreetMap contributors, used under the OSM tile usage policy; [Leaflet](https://leafletjs.com) (BSD-2-Clause).

**News and video:** RSS feeds, GDELT and YouTube embeds remain the property of their publishers. Only headlines, links and official embeds are used; check each publisher's terms before public or commercial use.

**Software licence:** no licence has been chosen for this repository yet, so all rights are reserved by the owner. Add a `LICENSE` file to set terms for others.
