#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (content[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // Ignore.
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  return rows.slice(1).map((vals) => {
    const out = {};
    for (let i = 0; i < headers.length; i += 1) {
      out[headers[i]] = vals[i] ?? "";
    }
    return out;
  });
}

function num(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function meter(value, max = 100, suffix = "") {
  const ratio = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `
    <div class="meter-wrap">
      <div class="meter"><span style="width:${ratio.toFixed(1)}%"></span></div>
      <span class="meter-label">${value.toFixed(2)}${suffix}</span>
    </div>
  `;
}

function msToSec(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildHtml(rows) {
  const success = rows.filter((r) => Number.parseInt(r.calls_ok, 10) > 0);
  const failed = rows.filter((r) => Number.parseInt(r.calls_errors, 10) > 0);
  const totalCost = success.reduce((sum, r) => sum + num(r.total_cost_usd), 0);
  const avgCost = success.length > 0
    ? success.reduce((sum, r) => sum + num(r.avg_cost_per_call_usd), 0) / success.length
    : 0;
  const totalCalls = rows.reduce((sum, r) => sum + Number.parseInt(r.calls_ok, 10) + Number.parseInt(r.calls_errors, 10), 0);
  const okCalls = rows.reduce((sum, r) => sum + Number.parseInt(r.calls_ok, 10), 0);
  const errCalls = rows.reduce((sum, r) => sum + Number.parseInt(r.calls_errors, 10), 0);

  const maxLatency = Math.max(...success.map((r) => num(r.avg_latency_ms)), 1);
  const maxCost = Math.max(...success.map((r) => num(r.avg_cost_per_call_usd)), 1e-9);

  const successRows = success.map((r) => {
    const score = num(r.avg_score);
    const parse = num(r.parse_success_pct);
    const constraints = num(r.constraints_ok_pct);
    const aspect = num(r.aspect_ok_pct);
    const latency = num(r.avg_latency_ms);
    const cost = num(r.avg_cost_per_call_usd);

    return `
      <tr>
        <td class="mono">${esc(r.rank)}</td>
        <td><strong>${esc(r.model)}</strong><br><span class="muted">${esc(r.profile)}</span></td>
        <td>${meter(score, 100)}</td>
        <td>${meter(parse, 100, "%")}</td>
        <td>${meter(constraints, 100, "%")}</td>
        <td>${meter(aspect, 100, "%")}</td>
        <td>${meter(latency, maxLatency, "")}<div class="muted tiny">${msToSec(latency)}</div></td>
        <td>${meter(cost, maxCost, "")}<div class="muted tiny">$${cost.toFixed(6)}</div></td>
      </tr>
    `;
  }).join("\n");

  const failedRows = failed.map((r) => `
    <tr>
      <td class="mono">${esc(r.rank)}</td>
      <td>${esc(r.model)}</td>
      <td>${esc(r.profile)}</td>
      <td class="mono">${esc(r.calls_errors)}</td>
      <td class="mono">${esc(r.avg_score)}</td>
    </tr>
  `).join("\n");

  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>nano2zit Benchmark Summary</title>
  <style>
    :root {
      --bg: #0a0b0f;
      --card: #131726;
      --card-soft: #0f1320;
      --text: #ecf1ff;
      --muted: #97a6cc;
      --accent: #48e0a4;
      --accent-2: #57a3ff;
      --warn: #ffb347;
      --danger: #ff6a6a;
      --line: #223055;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top right, #101737, var(--bg) 55%);
      color: var(--text);
      font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.4;
    }
    .container {
      width: min(1200px, 94vw);
      margin: 28px auto 40px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.8rem;
      letter-spacing: 0.2px;
    }
    .sub {
      color: var(--muted);
      font-size: 0.95rem;
      margin-bottom: 18px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .card {
      background: linear-gradient(180deg, var(--card), var(--card-soft));
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
    }
    .k {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .v {
      font-size: 1.15rem;
      font-weight: 700;
    }
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: auto;
      background: rgba(10, 15, 29, 0.75);
      margin-bottom: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }
    th, td {
      border-bottom: 1px solid #1c2746;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 0.92rem;
    }
    th {
      position: sticky;
      top: 0;
      background: #111a32;
      color: #d7e4ff;
      font-size: 0.8rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      z-index: 1;
    }
    tr:hover td {
      background: rgba(74, 108, 178, 0.08);
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .muted { color: var(--muted); }
    .tiny { font-size: 0.78rem; margin-top: 4px; }
    .meter-wrap { min-width: 130px; }
    .meter {
      width: 100%;
      height: 8px;
      border-radius: 99px;
      overflow: hidden;
      background: #1a2645;
      border: 1px solid #26365f;
    }
    .meter > span {
      display: block;
      height: 100%;
      border-radius: 99px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
    }
    .meter-label {
      display: inline-block;
      margin-top: 4px;
      font-size: 0.78rem;
      color: #cde0ff;
    }
    .section-title {
      margin: 16px 2px 10px;
      font-size: 1.03rem;
      color: #dce8ff;
    }
    .ok { color: var(--accent); }
    .warn { color: var(--warn); }
    .bad { color: var(--danger); }
  </style>
</head>
<body>
  <main class="container">
    <h1>Benchmark Comparison</h1>
    <div class="sub">Generated at ${esc(generatedAt)} · Source: docs/benchmark-summary-2026-02-24.csv</div>

    <section class="cards">
      <article class="card">
        <div class="k">Total Cost (USD)</div>
        <div class="v">$${totalCost.toFixed(6)}</div>
      </article>
      <article class="card">
        <div class="k">Avg Cost / Bucket Call</div>
        <div class="v">$${avgCost.toFixed(6)}</div>
      </article>
      <article class="card">
        <div class="k">Total Calls</div>
        <div class="v">${totalCalls}</div>
      </article>
      <article class="card">
        <div class="k">Successful Calls</div>
        <div class="v ok">${okCalls}</div>
      </article>
      <article class="card">
        <div class="k">Failed Calls</div>
        <div class="v bad">${errCalls}</div>
      </article>
    </section>

    <h2 class="section-title">Ranking (Successful Buckets)</h2>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model / Profile</th>
            <th>Avg Score</th>
            <th>Parse %</th>
            <th>Constraints %</th>
            <th>Aspect %</th>
            <th>Latency</th>
            <th>Cost / Call</th>
          </tr>
        </thead>
        <tbody>
          ${successRows}
        </tbody>
      </table>
    </section>

    <h2 class="section-title">Failed Buckets</h2>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Model</th>
            <th>Profile</th>
            <th>Error Calls</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${failedRows || "<tr><td colspan=\"5\">No failures.</td></tr>"}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const inFile = path.resolve(repoRoot, "docs/benchmark-summary-2026-02-24.csv");
  const outFile = path.resolve(repoRoot, "docs/benchmark-summary-2026-02-24.html");

  const content = fs.readFileSync(inFile, "utf8");
  const rows = parseCsv(content);
  const html = buildHtml(rows);
  fs.writeFileSync(outFile, html, "utf8");

  console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
}

main();
