# sky.melloo.me Status

[![Check status](https://github.com/SkyMelloo/status/actions/workflows/check.yml/badge.svg)](https://github.com/SkyMelloo/status/actions/workflows/check.yml)
[![Live page](https://img.shields.io/badge/status-status.melloo.me-informational.svg)](https://status.melloo.me)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Independent uptime monitor for [sky.melloo.me](https://sky.melloo.me), published at
[status.melloo.me](https://status.melloo.me).

It runs entirely on GitHub's infrastructure rather than sky.melloo.me's own servers, on purpose -
a status page that goes down with the thing it's monitoring isn't a status page. A GitHub Actions
workflow pings the site every 5 minutes, appends the result to `data/history.json`, and regenerates
`docs/index.html`, which GitHub Pages then serves. No server to run, no database, no hosting cost.

## How it works

- **`check.js`** - does the whole job: fetch the target with a 15s timeout, record `{at, ok,
  status, ms}`, trim history older than 45 days, render the page.
- **`data/history.json`** - raw check log, one entry per run (~13k rows at full retention). The
  page only ever shows a daily rollup; raw data is what makes the uptime/response-time figures
  possible without pulling in a database.
- **`docs/index.html`** - fully static, generated fresh on every run. `docs/` is also GitHub
  Pages' publish directory for this repo.
- **`.github/workflows/check.yml`** - the schedule (`*/5 * * * *`), plus commit + Pages deploy.

## Running it locally

```
node check.js
```

Writes `data/history.json` and `docs/index.html` exactly like the workflow does. Open
`docs/index.html` directly, or serve `docs/` with anything static.

## Related

- [SkyMelloo](https://github.com/SkyMelloo/SkyMelloo)
- [MellooEssentials](https://github.com/SkyMelloo/MellooEssentials)
- [developer-api](https://github.com/SkyMelloo/developer-api)
