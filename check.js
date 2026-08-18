// Pings sky.melloo.me, appends the result to data/history.json, and regenerates docs/index.html -
// runs every 5 minutes via .github/workflows/check.yml. Self-contained on purpose: this whole thing
// runs on GitHub's infrastructure, not ours, so it has to keep working even if our own servers,
// router, or ISP are the thing that's down.
const fs = require('fs');
const path = require('path');

const TARGET = 'https://sky.melloo.me/';
const HISTORY_PATH = path.join(__dirname, 'data', 'history.json');
const OUT_PATH = path.join(__dirname, 'docs', 'index.html');
// One check every 5 minutes; keep 45 days of raw checks (~13k rows, a small JSON file) - the page
// itself only ever shows a daily rollup, but raw data makes the incident list/response-time figure
// possible without needing a bigger dependency.
const RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

async function check() {
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(TARGET, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    return { at: startedAt, ok: res.status < 500, status: res.status, ms: Date.now() - startedAt };
  } catch (err) {
    return { at: startedAt, ok: false, status: 0, ms: Date.now() - startedAt, error: String(err.message || err) };
  }
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** One bucket per UTC day: uptimePct (null if no data that day) + average response time for the
 * up checks. Same shape/thresholds as sky.melloo.me's own /status page bars, so the two look
 * consistent if you've seen one. */
function buildDailyBuckets(history, days) {
  const now = Date.now();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - i * 86_400_000;
    const key = dayKey(dayStart);
    const rows = history.filter((h) => dayKey(h.at) === key);
    if (!rows.length) {
      buckets.push({ date: key, uptimePct: null, avgMs: null });
      continue;
    }
    const okCount = rows.filter((r) => r.ok).length;
    const upRows = rows.filter((r) => r.ok && r.ms);
    buckets.push({
      date: key,
      uptimePct: (okCount / rows.length) * 100,
      avgMs: upRows.length ? Math.round(upRows.reduce((s, r) => s + r.ms, 0) / upRows.length) : null,
    });
  }
  return buckets;
}

function barClass(pct) {
  if (pct === null || pct === undefined) return 'unknown';
  if (pct >= 99.9) return 'up';
  if (pct >= 50) return 'partial';
  return 'down';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(history, latest) {
  const days = buildDailyBuckets(history, 90);
  const withData = days.filter((d) => d.uptimePct !== null);
  const overallPct = withData.length ? withData.reduce((s, d) => s + d.uptimePct, 0) / withData.length : null;
  const last24h = history.filter((h) => h.at > Date.now() - 24 * 60 * 60 * 1000);
  const last24hPct = last24h.length ? (last24h.filter((r) => r.ok).length / last24h.length) * 100 : null;
  const recentUp = history.filter((h) => h.ok && h.ms).slice(-50);
  const avgMs = recentUp.length ? Math.round(recentUp.reduce((s, r) => s + r.ms, 0) / recentUp.length) : null;

  const barsHtml = days
    .map((d) => {
      const cls = barClass(d.uptimePct);
      const label = d.uptimePct === null ? 'No data' : `${d.uptimePct.toFixed(1)}% uptime`;
      // Literal middot, not the &middot; entity - this lands in a native title="" tooltip, which
      // renders text as-is rather than decoding HTML entities.
      const sub = d.avgMs ? ` · ${d.avgMs}ms avg` : '';
      return `<span class="status-bar ${cls}" title="${esc(d.date)}: ${esc(label)}${esc(sub)}"></span>`;
    })
    .join('');

  const stateNow = latest.ok ? 'up' : 'down';
  const stateLabel = latest.ok ? 'All systems operational' : "sky.melloo.me isn't responding";
  const stateSub = latest.ok
    ? 'Checked every 5 minutes from GitHub Actions, independent of our own servers.'
    : "We're seeing the same thing you are - checked every 5 minutes from GitHub Actions, independent of our own servers.";

  // Exact same panel/brand/header-row/footline system as sky.melloo.me's own error page and
  // offline-contact page (see .github repo notes) - this, those, and the real site should all read
  // as the same product, not three different ad-hoc designs.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="120" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>sky.melloo.me Status</title>
<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAJFBMVEUAAACcTJb82uT3tdTjgbGHO2tuSjtXKyOZh12wpnuKblc4HhtG0pcFAAAAAXRSTlMAQObYZgAAAGBJREFUeNqViTESxDAIAxECnw3//+9pnMRFuuyo2ZV9AXi5E+fa7o7ncrwDATrvgqC7oEbsEBJqEcwrUISGNJGxJbQcbdaVGRvmb1Rb91wp5FnVbaa0Vo2jdqc5Lz3p0T/LzQKpQT/BRgAAAABJRU5ErkJggg==" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  :root {
    --page: #17141c; --surface-rgb: 38, 34, 46; --surface-alpha: 0.55;
    --text-primary: #f5f5f7; --text-secondary: #c3c2cf; --text-muted: #8f8ea0;
    --border: rgba(255, 255, 255, 0.12); --gridline: rgba(255, 255, 255, 0.09);
    --pink-accent: #ff6ec7; --accent-grad: linear-gradient(135deg, #ff6ec7, #d946b8 55%, #ff8fe0);
    --status-good: #0ca30c; --status-warning: #fab219; --status-critical: #d03b3b;
  }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    background: var(--page); color: var(--text-primary);
    font-family: "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 32px 20px;
  }
  .panel {
    max-width: 620px; width: 100%; border-radius: 20px;
    background: rgba(var(--surface-rgb), var(--surface-alpha));
    backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%);
    border: 1px solid var(--border); padding: 30px 32px 32px; position: relative; overflow: hidden;
  }
  .panel-glow {
    position: absolute; inset: -50% auto auto -15%; width: 300px; height: 300px; border-radius: 50%;
    background: var(--accent-grad); opacity: 0.16; filter: blur(60px); pointer-events: none;
  }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 22px; position: relative; }
  .brand img { image-rendering: pixelated; }
  .brand span { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }

  .header-row { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px; position: relative; }
  .header-icon { image-rendering: pixelated; flex-shrink: 0; margin-top: 2px; }
  .header-row h1 { margin: 0 0 4px; font-size: clamp(1.4rem, 4vw, 1.7rem); line-height: 1.25; background: linear-gradient(120deg, var(--pink-accent), #a63f8a); -webkit-background-clip: text; background-clip: text; color: transparent; text-wrap: balance; }
  .header-row p { margin: 0; color: var(--text-secondary); line-height: 1.6; font-size: 14.5px; }

  .status-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em; padding: 4px 10px; border-radius: 999px; margin: 4px 0 22px; position: relative; }
  .status-pill.up { background: rgba(12,163,12,0.16); color: #6fd66f; }
  .status-pill.down { background: rgba(208,59,59,0.16); color: #ff8080; }
  .status-pill-dot { width: 6px; height: 6px; border-radius: 50%; }
  .status-pill.up .status-pill-dot { background: var(--status-good); }
  .status-pill.down .status-pill-dot { background: var(--status-critical); }

  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 22px; position: relative; }
  .stat-tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 4px; }
  .stat-tile-value { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }

  .bars-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; position: relative; }
  .bars-head h2 { font-size: 13.5px; font-weight: 600; margin: 0; }
  .bars-head span { font-size: 11.5px; color: var(--text-muted); }
  .status-bars { display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; cursor: default; position: relative; }
  .status-bar { flex: 1 0 4px; min-width: 4px; height: 26px; border-radius: 2px; background: var(--gridline); }
  .status-bar.up { background: var(--status-good); height: 26px; }
  .status-bar.partial { background: var(--status-warning); height: 17px; }
  .status-bar.down { background: var(--status-critical); height: 12px; }
  .status-bar.unknown { background: var(--gridline); height: 6px; opacity: 0.5; }
  .bars-range { display: flex; justify-content: space-between; margin-top: 6px; font-size: 10.5px; color: var(--text-muted); }

  .footline { border-top: 1px solid var(--border); margin-top: 20px; padding-top: 16px; font-size: 12.5px; color: var(--text-muted); position: relative; }
  .footline a { color: var(--text-secondary); }
</style>
</head>
<body>
  <div class="panel">
    <div class="panel-glow" aria-hidden="true"></div>
    <div class="brand">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAJFBMVEUAAACcTJb82uT3tdTjgbGHO2tuSjtXKyOZh12wpnuKblc4HhtG0pcFAAAAAXRSTlMAQObYZgAAAGBJREFUeNqViTESxDAIAxECnw3//+9pnMRFuuyo2ZV9AXi5E+fa7o7ncrwDATrvgqC7oEbsEBJqEcwrUISGNJGxJbQcbdaVGRvmb1Rb91wp5FnVbaa0Vo2jdqc5Lz3p0T/LzQKpQT/BRgAAAABJRU5ErkJggg==" width="18" height="18" alt="" />
      <span>sky.melloo.me</span>
    </div>

    <div class="header-row">
      <img class="header-icon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAilBMVEUBAADr/PzT/PvC/PvO5+aa7+qmztZu4NmJv8tI0sqZpKR6rLWJpKMqyb5+pKOFlpVkm5hshYtHko1ZfIMviYNPcHUcgnteZWVVZWRNZWRSXFw+YF5CUlYsWlc3TFEdVFExRUgRUEw6J1MnHjwZEycQDBwPDBgKCBIGBQsGAwsEAgcCAQQAAAEAAACdkju/AAAAAXRSTlMAQObYZgAAAU1JREFUeNqVkEWa22AQBZ+IBiwzM1tw/xtln1X4d55b02YsUeurEuJFQsC9qwX3ntbkntbkuv78hCbXdCSA+L4mMhcEURB4XhAEESWt7EgchyGAiNqxicMiEt3tF4EknwwcxyKOw+CTugsNIMnxHUQDYw1iNOP4PQzkHQo9wVHApF6vM3mPyE6PRqOvwAX5LqED4AcMmvAMCowEOhvbsWFH1IbCBrFl1cL8NfDAlQNzEA1lNEwMXI7bLYyK4yM1V3oCRQNNZKK2LwObQPgHy9L5JJXEcFCvAddVtju6ti3nHLif5hoYcKtXOPIWBrZk7lt0fAcH8NoVvTF1FALo6n/gxf/+cay1IfjvHv7ZMN/6EFjUkCXzZJUkm1o3S9M1lxTDIQ7UalixiJNaNyXrXPVpEmdJrc+rl6ovkoR30KtxPan0MezjNpVKn/ol/gOqY0VT2ktYGQAAAABJRU5ErkJggg==" width="34" height="34" alt="" />
      <div>
        <h1>${esc(stateLabel)}</h1>
        <p>${esc(stateSub)}</p>
      </div>
    </div>

    <span class="status-pill ${stateNow}"><span class="status-pill-dot"></span>${latest.ok ? 'Operational' : 'Unreachable'}</span>

    <div class="stat-grid">
      <div>
        <div class="stat-tile-label">Uptime (90d)</div>
        <div class="stat-tile-value">${overallPct !== null ? overallPct.toFixed(2) + '%' : '—'}</div>
      </div>
      <div>
        <div class="stat-tile-label">Uptime (24h)</div>
        <div class="stat-tile-value">${last24hPct !== null ? last24hPct.toFixed(1) + '%' : '—'}</div>
      </div>
      <div>
        <div class="stat-tile-label">Avg response</div>
        <div class="stat-tile-value">${avgMs !== null ? avgMs + 'ms' : '—'}</div>
      </div>
    </div>

    <div class="bars-head">
      <h2>90-day history</h2>
      <span>Hover a bar for details</span>
    </div>
    <div class="status-bars">${barsHtml}</div>
    <div class="bars-range"><span>${esc(days[0]?.date || '')}</span><span>Today</span></div>

    <p class="footline">Last checked ${esc(new Date(latest.at).toISOString().replace('T', ' ').slice(0, 19))} UTC. <a href="https://sky.melloo.me/">sky.melloo.me →</a></p>
  </div>
</body>
</html>
`;
}

async function main() {
  const history = loadHistory();
  const latest = await check();
  history.push(latest);
  const cutoff = Date.now() - RETENTION_MS;
  const trimmed = history.filter((h) => h.at > cutoff);

  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed));
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, render(trimmed, latest));
  // Without this, GitHub Pages runs the output through Jekyll by default and the build fails -
  // this is a plain static file, not a Jekyll site.
  fs.writeFileSync(path.join(path.dirname(OUT_PATH), '.nojekyll'), '');

  console.log(`Checked ${TARGET}: ok=${latest.ok} status=${latest.status} ms=${latest.ms}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
