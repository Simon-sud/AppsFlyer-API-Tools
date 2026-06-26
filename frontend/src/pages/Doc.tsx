import React, { useMemo, useState } from 'react';
import { RiCheckLine, RiFileCopyLine } from 'react-icons/ri';

import { CountryCodeDictionaryTable } from '../components/CountryCodeDictionaryTable';

type Snippet = {
  id: 'curl' | 'python' | 'golang';
  label: string;
  code: string;
};

type ResponseCode = '200' | '400-json' | '400-token' | '401' | '500';
type LogResponseCode = '200' | '400-token' | '401' | '500';
type ReportResponseCode = '200' | '400-token' | '401' | '500';

const writeClipboardWithFallback = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore and fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

const CodeTabs: React.FC<{ snippets: Snippet[]; title: string }> = ({ snippets, title }) => {
  const [active, setActive] = useState<Snippet['id']>(snippets[0]?.id ?? 'curl');
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  const activeSnippet = snippets.find((s) => s.id === active) ?? snippets[0];

  const copy = async () => {
    if (!activeSnippet) return;
    const ok = await writeClipboardWithFallback(activeSnippet.code);
    setCopyState(ok ? 'done' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 1200);
  };

  if (!activeSnippet) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 overflow-hidden dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-1">
          {snippets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                active === s.id
                  ? 'bg-gray-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          title={`Copy ${title}`}
          className={`inline-flex items-center gap-1 text-xs transition-colors ${
            copyState === 'failed'
              ? 'text-rose-600 dark:text-rose-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          {copyState === 'done' ? <RiCheckLine className="h-4 w-4" /> : <RiFileCopyLine className="h-4 w-4" />}
          {copyState === 'done' ? 'Copied' : copyState === 'failed' ? 'Copy Failed' : 'Copy'}
        </button>
      </div>
      <pre
        className="text-xs p-3 overflow-x-auto text-slate-800 dark:text-slate-200"
        style={{ scrollbarGutter: 'stable both-edges' }}
      >
        {activeSnippet.code}
      </pre>
    </div>
  );
};

const DocNote: React.FC<{
  variant: 'tip' | 'caution';
  title: string;
  children: React.ReactNode;
}> = ({ variant, title, children }) => {
  const shell =
    variant === 'tip'
      ? 'border-sky-200 bg-sky-50/90 dark:border-sky-800/60 dark:bg-sky-950/35'
      : 'border-amber-200 bg-amber-50/90 dark:border-amber-800/60 dark:bg-amber-950/35';
  const head =
    variant === 'tip' ? 'text-sky-900 dark:text-sky-100' : 'text-amber-900 dark:text-amber-100';
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${shell}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${head}`}>{title}</div>
      <div className="mt-1.5 text-gray-700 dark:text-slate-300 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
};

const Doc: React.FC = () => {
  const trackSnippets = useMemo<Snippet[]>(
    () => [
      {
        id: 'curl',
        label: 'curl',
        code: `curl "http://adnexus.cloud/api/autopipe/token/track?token={YOUR_API_TOKEN}" \\
  -H "Accept: application/json"`,
      },
      {
        id: 'python',
        label: 'Python',
        code: `import requests

url = "http://adnexus.cloud/api/autopipe/token/track"
api_token = "{YOUR_API_TOKEN}"
params = {"token": api_token}

response = requests.get(url, params=params, timeout=10)
response.raise_for_status()
print(response.json())`,
      },
      {
        id: 'golang',
        label: 'Golang',
        code: `package main

import (
  "fmt"
  "io"
  "net/http"
  "net/url"
)

func main() {
  q := url.Values{}
  q.Set("token", "{YOUR_API_TOKEN}")
  req, _ := http.NewRequest("GET", "http://adnexus.cloud/api/autopipe/token/track?"+q.Encode(), nil)
  req.Header.Set("Accept", "application/json")

  resp, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer resp.Body.Close()

  body, _ := io.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,
      },
    ],
    []
  );

  const [activeResponseCode, setActiveResponseCode] = useState<ResponseCode>('200');
  const responseCodeOptions = useMemo(
    () => [
      { key: '200' as const, label: '200 OK', tone: 'success' as const },
      { key: '400-json' as const, label: '400 InvalidJSON', tone: 'error' as const },
      { key: '400-token' as const, label: '400 MissingToken', tone: 'error' as const },
      { key: '401' as const, label: '401 InvalidToken', tone: 'error' as const },
      { key: '500' as const, label: '500 UpdateFailed', tone: 'error' as const },
    ],
    []
  );
  const responsePayload = useMemo<Record<ResponseCode, string>>(
    () => ({
      '200': `{
  "success": true,
  "data": {
    "task_id": "",
    "status": "",
    "ios_appid": "",
    "android_appid": "",
    "event_type": "",
    "token_request_count": 0,
    "token_last_used_at": ""
  }
}`,
      '400-json': `{
  "success": false,
  "error": "invalid json body"
}`,
      '400-token': `{
  "success": false,
  "error": "token is required"
}`,
      '401': `{
  "success": false,
  "error": "invalid token"
}`,
      '500': `{
  "success": false,
  "error": "update token stats failed"
}`,
    }),
    []
  );

  const requestLogSnippets = useMemo<Snippet[]>(
    () => [
      {
        id: 'curl',
        label: 'curl',
        code: `curl "http://adnexus.cloud/api/autopipe/token/logs?maxgroup=50" \\
  -H "X-Autopipe-Token:{YOUR_API_TOKEN}" \\
  -H "Accept: application/json"`,
      },
      {
        id: 'python',
        label: 'Python',
        code: `import requests

url = "http://adnexus.cloud/api/autopipe/token/logs"
api_token = "{YOUR_API_TOKEN}"
headers = {"X-Autopipe-Token": api_token}
params = {"maxgroup": 50}

response = requests.get(url, headers=headers, params=params, timeout=10)
response.raise_for_status()
print(response.json())`,
      },
      {
        id: 'golang',
        label: 'Golang',
        code: `package main

import (
  "fmt"
  "io"
  "net/http"
  "net/url"
)

func main() {
  q := url.Values{}
  q.Set("maxgroup", "50")

  req, _ := http.NewRequest("GET", "http://adnexus.cloud/api/autopipe/token/logs?"+q.Encode(), nil)
  req.Header.Set("X-Autopipe-Token", "{YOUR_API_TOKEN}")
  req.Header.Set("Accept", "application/json")

  resp, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer resp.Body.Close()

  body, _ := io.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,
      },
    ],
    []
  );
  const [activeLogResponseCode, setActiveLogResponseCode] = useState<LogResponseCode>('200');
  const logResponseCodeOptions = useMemo(
    () => [
      { key: '200' as const, label: '200 OK', tone: 'success' as const },
      { key: '400-token' as const, label: '400 MissingToken', tone: 'error' as const },
      { key: '401' as const, label: '401 InvalidToken', tone: 'error' as const },
      { key: '500' as const, label: '500 QueryFailed', tone: 'error' as const },
    ],
    []
  );
  const logResponsePayload = useMemo<Record<LogResponseCode, string>>(
    () => ({
      '200': `{
  "success": true,
  "task_id": "",
  "maxgroup": 50,
  "event_type": "",
  "records": 0,
  "data": [
    {
      "id": "",
      "app_id": "",
      "execution_time": "",
      "status": "",
      "error_message": "",
      "execution_duration": 0,
      "data_processed": 0,
      "data_fetched": 0,
      "data_deduplicated": 0
    }
  ]
}`,
      '400-token': `{
  "success": false,
  "error": "token is required"
}`,
      '401': `{
  "success": false,
  "error": "invalid token"
}`,
      '500': `{
  "success": false,
  "error": "query logs failed"
}`,
    }),
    []
  );

  const reportSnippets = useMemo<Snippet[]>(
    () => [
      {
        id: 'curl',
        label: 'curl',
        code: `curl -L -J -O "http://adnexus.cloud/api/autopipe/token/report" \\
  -H "X-Autopipe-Token:{YOUR_API_TOKEN}" \\
  -H "Accept: text/csv"`,
      },
      {
        id: 'python',
        label: 'Python',
        code: `import requests

url = "http://adnexus.cloud/api/autopipe/token/report"
api_token = "{YOUR_API_TOKEN}"
headers = {"X-Autopipe-Token": api_token}

with requests.get(url, headers=headers, stream=True, timeout=30) as r:
  r.raise_for_status()
  filename = "task_report.csv"
  cd = r.headers.get("Content-Disposition", "")
  if "filename=" in cd:
    filename = cd.split("filename=", 1)[1].strip().strip('"')

  with open(filename, "wb") as f:
    for chunk in r.iter_content(chunk_size=8192):
      if chunk:
        f.write(chunk)`,
      },
      {
        id: 'golang',
        label: 'Golang',
        code: `package main

import (
  "io"
  "net/http"
  "os"
  "strings"
)

func main() {
  req, _ := http.NewRequest("GET", "http://adnexus.cloud/api/autopipe/token/report", nil)
  req.Header.Set("X-Autopipe-Token", "{YOUR_API_TOKEN}")
  req.Header.Set("Accept", "text/csv")

  resp, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer resp.Body.Close()

  filename := "task_report.csv"
  if cd := resp.Header.Get("Content-Disposition"); cd != "" {
    if idx := strings.Index(cd, "filename="); idx >= 0 {
      filename = strings.Trim(strings.TrimSpace(cd[idx+len("filename="):]), " "+string('"'))
    }
  }

  out, err := os.Create(filename)
  if err != nil { panic(err) }
  defer out.Close()

  _, _ = io.Copy(out, resp.Body)
}`,
      },
    ],
    []
  );

  const [activeReportResponseCode, setActiveReportResponseCode] = useState<ReportResponseCode>('200');
  const reportResponseCodeOptions = useMemo(
    () => [
      { key: '200' as const, label: '200 OK', tone: 'success' as const },
      { key: '400-token' as const, label: '400 MissingToken', tone: 'error' as const },
      { key: '401' as const, label: '401 InvalidToken', tone: 'error' as const },
      { key: '500' as const, label: '500 QueryFailed', tone: 'error' as const },
    ],
    []
  );
  const reportResponsePayload = useMemo<Record<ReportResponseCode, string>>(
    () => ({
      // Returns a CSV file stream at 200, keeping empty content here to match actual behavior
      '200': ``,
      '400-token': `{
  "success": false,
  "error": "token is required"
}`,
      '401': `{
  "success": false,
  "error": "invalid token"
}`,
      '500': `{
  "success": false,
  "error": "query report failed"
}`,
    }),
    []
  );

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <div className="p-1 bg-transparent border-0 rounded-none shadow-none">
        <section id="doc-overview" className="mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Overview</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            This console connects account configuration, scheduled AutoPipe workloads, dispatch access tokens,
            discovery tools, store-based download estimation, and the Gochat assistant. Use the sidebar to jump
            between page-specific guidance, Gochat settings, and the token API reference at the bottom. External
            integrations should use only the documented token endpoints unless your deployment exposes additional
            routes.
          </p>
          <DocNote variant="tip" title="Tip">
            Log in and pick the correct team scope in the header where applicable; AutoPipe and dispatch listings are
            filtered by your effective team membership.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            API tokens are secrets. Do not commit them to source control, client-side bundles, or public channels.
            Regenerating a token immediately invalidates the previous value and resets request statistics on the server.
          </DocNote>
        </section>

        <section id="doc-home" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Appsflyer Query</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            The Appsflyer Query workspace is the primary surface for querying raw and processed datasets tied to your linked
            accounts. Build filters, run searches, and inspect tabular results; exports and follow-up actions depend on
            the connectors enabled for your environment.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Select account context and query parameters before executing a search.</li>
            <li>Wait for loading to finish; large windows may take longer on first load.</li>
            <li>Use column affordances and pagination controls to narrow the visible slice of results.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            If results look empty, confirm the date range, account filter, and that upstream sync jobs have completed.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Heavy queries can stress shared backends—avoid unnecessarily wide time ranges in production monitoring loops.
          </DocNote>
        </section>

        <section id="doc-dashboard" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Dashboard</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Dashboard aggregates performance and distribution views across accounts, applications, and campaigns. Use it
            for at-a-glance health checks and comparisons rather than row-level drill-down (use Home or exports for
            detail).
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Choose dimensions (e.g. account / app / campaign) from the header controls.</li>
            <li>Align the legend and chart filters with the question you are answering.</li>
            <li>When in doubt, reset filters and re-apply them one at a time to isolate changes.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Dropdown search respects your current scope; totals in labels reflect the filtered universe unless noted.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Cached aggregates may lag live pipelines by a few minutes—do not treat charts as a real-time incident feed
            without verifying timestamps.
          </DocNote>
        </section>

        <section id="doc-autopipe" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">AutoPipe</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            AutoPipe lists scheduled and single-run data tasks. From here you monitor progress, modes (daily vs
            one-shot), and task metadata before promoting a task into dispatch workflows.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Scan status and execution windows to know whether a task is safe to import downstream.</li>
            <li>Adjust display density or paging when managing long task grids.</li>
            <li>Pair this page with Dispatch Access when you need API tokens for external runners.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Paused or warning tasks may still appear in lists—read the status pill before chaining automation.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Starting or modifying pipelines can trigger billable or rate-limited upstream calls; coordinate with your
            ops owner before bulk changes.
          </DocNote>
        </section>

        <section id="doc-dispatch-access" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Dispatch Access</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Dispatch Access bridges AutoPipe tasks and dispatch tokens. Import creates the dispatch binding and mints an
            API token; the key icon opens token details, copy, and usage hints; Regenerate replaces the token after
            explicit confirmation and clears historical request counters on the server.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Filter by account or data type, or search across the loaded task set (search re-fetches under your
              filters).</li>
            <li>After Import completes, the row should switch to the key control without a full reload.</li>
            <li>Regenerate only when integrations can be updated immediately—old bearer values stop working instantly.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Request Count increments once per successful call to track, logs, and report endpoints—rotate credentials in
            every consumer when you regenerate.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Import is blocked for paused / warning tasks by design; fix upstream task health before issuing tokens.
          </DocNote>
        </section>

        <section id="doc-benchmark" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Benchmark</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Benchmark Explorer browses AppsFlyer&apos;s public benchmark slices (industry aggregates, not your
            account actuals). Pick category, sub-category, country, and channel filters, then load a slice URL to
            inspect metrics, charts, and tabular rows. Data is ephemeral in this tab and is proxied through the
            workbench backend with an in-process sitemap cache.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Page layout</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Slice picker</strong> — filter the sitemap, open a slice, or run bulk scrape into the results
              table.
            </li>
            <li>
              <strong>Slice insights</strong> — five sections mirror AppsFlyer: Performance, Trends, Top Countries,
              Change, and Extra (Split by media type).
            </li>
            <li>
              <strong>Metric tabs &amp; filters</strong> — per-section metrics with Platform / App size / Country
              row filters, search, and CSV / JSON export.
            </li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Charts by section</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Trends</strong> — quarter lines by platform (Overall / Android / iOS); QoQ % for selected install
              series.
            </li>
            <li>
              <strong>Performance</strong> — grouped bars per quarter and platform (median of filtered rows).
            </li>
            <li>
              <strong>Top Countries</strong> — 100% stacked bars by country share per quarter (up to three platform
              panels).
            </li>
            <li>
              <strong>Change</strong> — country movers &amp; shakers (QoQ % by country for the latest quarter).
            </li>
            <li>
              <strong>Extra</strong> — split by media type (100% stacked bars, iOS + Android; Sessions, IAA revenue,
              etc. as % shares).
            </li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Units &amp; metrics</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>UA / Remarketing ad spend and Extra-section metrics (including <strong>IAA revenue</strong>) display as
              percentage shares, not USD.
            </li>
            <li>Change section values are quarter-over-quarter % change; Trends uses index / % depending on metric
              name.
            </li>
            <li>Hover charts or legends to highlight series; tooltips follow the same layout as other workbench charts.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Use <strong>Reload Sitemap</strong> after AppsFlyer publishes new benchmark paths. Match the slice country
            in the URL when reading Top Countries / Change rows.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Benchmark data is for industry comparison only. Do not treat aggregates as client KPIs or financial
            reporting. Refresh clears in-memory results.
          </DocNote>
        </section>

        <section id="doc-app-estimator" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">App Estimator</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            App Estimator explores download estimates derived from store rating snapshots, rating velocity, traindate
            benchmark downloads, and segment-level K calibration. Data is served read-only from the OpenClaw SQLite
            database; a built-in daily pipeline collects ratings, recalculates velocity, fits K, and batches download
            estimates on the server.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Overview tab</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Daily pipeline</strong> — four steps: Rating Collect, Velocity, K Calibration, and Download
              Estimate. Each card shows Done / Running / Failed / Pending for the current run date.
            </li>
            <li>
              <strong>Table counts</strong> — row totals for rating snapshots, velocity, traindate benchmarks, K
              calibration, download estimates, and distinct countries covered in the dataset.
            </li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Data tabs</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Ratings</strong> — latest store rating snapshot per app and country; click a row to expand
              historical rating points below the table.
            </li>
            <li>
              <strong>Velocity</strong> — average daily rating change between snapshots; filter by confidence and
              calc method (Adjacent vs Window 7d / 14d).
            </li>
            <li>
              <strong>Benchmarks</strong> — traindate-reported downloads used as ground truth when calibrating K.
            </li>
            <li>
              <strong>Calibration</strong> — effective K per platform × category × country segment, with sample count
              and MAPE.
            </li>
            <li>
              <strong>Estimates</strong> — latest estimate date only; daily and monthly downloads are model outputs
              (V4.1), not store-reported figures.
            </li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Filters &amp; search</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Platform and Country apply across data tabs; Category appears on Benchmarks and Calibration.</li>
            <li>Quality (Specific vs Global) filters Ratings; Confidence filters Velocity and Estimates.</li>
            <li>Search by app name, package, or bundle ID; use Reset Filters to clear the current tab scope.</li>
            <li>Pagination shows Page X / Y at the bottom-left; the title row displays total row counts.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            If Estimates is empty after a pipeline run, confirm the estimate step shows Done and that
            download_estimates has rows for today on the server—the batch step validates DB writes after execution.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Estimated downloads are model projections for research and comparison—not financial or store-official
            metrics. Do not use them as contractual KPIs without independent validation.
          </DocNote>
        </section>

        <section id="doc-apps-finder" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Apps Finder</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Apps Finder helps discover mobile applications by identifiers or keywords, then optionally persist selections
            for downstream linking. It complements Account setup when you do not yet know exact store IDs.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Enter search terms or IDs, review matches, and paginate or load more as offered by the UI.</li>
            <li>Save or attach apps according to your deployment&apos;s workflow buttons.</li>
            <li>Cross-check bundle IDs with store listings before binding to production accounts.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Narrow queries reduce noise from similarly named apps across regions and publishers.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Third-party search indexes can be incomplete; verify ownership and platform (iOS vs Android) before
            committing.
          </DocNote>
        </section>

        <section id="doc-account" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Account</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Account holds credentials, naming, avatars, and refresh policies for each linked AppsFlyer (or related)
            configuration. Changes here propagate to query contexts across Home, Dashboard, and pipeline selectors.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">How to use</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>Add or edit configurations through the guided forms; validate API keys where prompted.</li>
            <li>Icon and display name updates help teammates recognize tenants in crowded dropdowns.</li>
            <li>Align auto-refresh preferences with how stale you can tolerate marketing data.</li>
          </ul>
          <DocNote variant="tip" title="Tip">
            After rotating API keys externally, update the stored secret here before expecting Home queries to succeed.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Misconfigured credentials can silently return empty datasets—monitor error toasts and server logs after
            changes.
          </DocNote>
        </section>

        <section id="doc-gochat" className="mt-12 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Gochat Assistant</h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Gochat is the workbench AI assistant powered by MiMo models on the server. Open it from the hexagon
            button in the header to ask questions about the product, draft analysis, or get structured outputs. When
            logged in, conversations persist per user on the server; preferences are stored locally in your browser.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Chat panel</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Expand / Minimize</strong> — widen the sheet for longer threads or collapse it to the default
              drawer width.
            </li>
            <li>
              <strong>History</strong> — (signed-in users) open the conversation list, switch threads, or delete old
              sessions. Up to 20 conversations are kept per user; delete one before starting a new chat at the limit.
            </li>
            <li>
              <strong>New conversation</strong> — the plus control in the input area starts a fresh thread without
              losing saved history entries.
            </li>
            <li>
              Send with Enter; multi-line input scrolls inside the composer. Assistant replies support Markdown,
              fenced code / JSON / CSV blocks with copy actions, and optional reasoning traces when enabled.
            </li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-slate-200">Go Chat Settings</h3>
          <p className="mt-2 text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Open the settings drawer from the header gear icon. The top section controls Gochat behavior:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-300 space-y-1">
            <li>
              <strong>Model Select</strong> — MiMo v2.5 Pro, v2.5, v2 Pro, or v2 Omni (API keys are server-managed).
            </li>
            <li>
              <strong>Instant Streaming</strong> — show tokens as they arrive; off uses a typewriter-style reveal.
            </li>
            <li>
              <strong>Show Reasoning</strong> — surface model thinking before the final answer when the upstream
              provides it.
            </li>
            <li>
              <strong>Reply Language</strong> — English or Chinese preference for assistant replies.
            </li>
            <li>
              <strong>Creativity</strong> — temperature-style control (0–10); higher values yield more varied answers.
            </li>
            <li>
              <strong>Max Output Tokens</strong> — cap response length (1k–32k steps).
            </li>
            <li>
              <strong>Response Format</strong> — Markdown, Plain Text, JSON, CSV, or Code as the primary structured
              style for new messages.
            </li>
          </ul>
          <DocNote variant="tip" title="Tip">
            Response format is locked per assistant message so switching settings mid-thread does not re-render old
            replies incorrectly. Scroll the settings drawer to reach Account and other workbench preferences below
            Gochat.
          </DocNote>
          <DocNote variant="caution" title="Caution">
            Do not paste API tokens, passwords, or customer PII into Gochat. Model output may be inaccurate—verify
            critical numbers against authoritative sources before acting on them.
          </DocNote>
        </section>

        <section id="doc-track" className="mt-14 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">Track Request</h2>
          <div className="mb-8 rounded-lg border border-gray-200 bg-white/80 overflow-hidden dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-100 dark:bg-zinc-700">
                  GET
                </span>
                <code className="text-xs font-mono">/api/autopipe/token/track</code>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-slate-700 px-3 py-2">
              <p className="text-sm text-gray-700 dark:text-slate-300">
                Submit the task token to retrieve normalized metadata and atomically record current usage.
              </p>
            </div>
          </div>

          <CodeTabs snippets={trackSnippets} title="Track Request request" />

          <div className="mt-4 rounded-lg border border-gray-200 bg-white/75 dark:bg-slate-900/35 dark:border-slate-700">
            <div className="px-4 py-2 border-b border-gray-200 text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 dark:border-slate-700">
              RESPONSE CODES
            </div>
            <div className="p-4 text-sm text-gray-600 dark:text-slate-300">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    {responseCodeOptions.map((opt) => {
                      const isActive = activeResponseCode === opt.key;
                      const base =
                        opt.tone === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                          : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200';
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setActiveResponseCode(opt.key)}
                          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${base} ${isActive ? '' : 'opacity-80 hover:opacity-100'}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${opt.tone === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <pre className="text-xs overflow-x-auto text-slate-800 dark:text-slate-200">{responsePayload[activeResponseCode]}</pre>
              </div>
            </div>
          </div>
        </section>

        <section id="doc-track-log" className="mt-10 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 dark:text-slate-100">Track Log</h2>
          <div className="mb-8 rounded-lg border border-gray-200 bg-white/80 overflow-hidden dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-100 dark:bg-zinc-700">GET</span>
                <code className="text-xs font-mono">/api/autopipe/token/logs</code>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-slate-700 px-3 py-2">
              <p className="text-sm text-gray-700 dark:text-slate-300">
                Retrieve grouped execution history for a task, including run status and processing metrics.
              </p>
            </div>
          </div>

          <CodeTabs snippets={requestLogSnippets} title="Track Log request" />

          <div className="mt-4 rounded-lg border border-gray-200 bg-white/75 dark:bg-slate-900/35 dark:border-slate-700">
            <div className="px-4 py-2 border-b border-gray-200 text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 dark:border-slate-700">
              RESPONSE CODES
            </div>
            <div className="p-4 text-sm text-gray-600 dark:text-slate-300">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {logResponseCodeOptions.map((opt) => {
                    const isActive = activeLogResponseCode === opt.key;
                    const base =
                      opt.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setActiveLogResponseCode(opt.key)}
                        className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${base} ${isActive ? '' : 'opacity-80 hover:opacity-100'}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${opt.tone === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <pre className="text-xs overflow-x-auto text-slate-800 dark:text-slate-200">{logResponsePayload[activeLogResponseCode]}</pre>
              </div>
            </div>
          </div>
        </section>

        <section id="doc-track-pipe-report" className="mt-10 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 dark:text-slate-100">Track Pipe Report</h2>
          <div className="mb-8 rounded-lg border border-gray-200 bg-white/80 overflow-hidden dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-100 dark:bg-zinc-700">GET</span>
                <code className="text-xs font-mono">/api/autopipe/token/report</code>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-slate-700 px-3 py-2">
              <p className="text-sm text-gray-700 dark:text-slate-300">
                Download task data as a CSV file for the given token.
              </p>
            </div>
          </div>

          <CodeTabs snippets={reportSnippets} title="Track Pipe Report request" />

          <div className="mt-4 rounded-lg border border-gray-200 bg-white/75 dark:bg-slate-900/35 dark:border-slate-700">
            <div className="px-4 py-2 border-b border-gray-200 text-xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 dark:border-slate-700">
              RESPONSE CODES
            </div>
            <div className="p-4 text-sm text-gray-600 dark:text-slate-300">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {reportResponseCodeOptions.map((opt) => {
                    const isActive = activeReportResponseCode === opt.key;
                    const base =
                      opt.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setActiveReportResponseCode(opt.key)}
                        className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${base} ${isActive ? '' : 'opacity-80 hover:opacity-100'}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${opt.tone === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <pre className="text-xs overflow-x-auto text-slate-800 dark:text-slate-200">{reportResponsePayload[activeReportResponseCode]}</pre>
              </div>
            </div>
          </div>
        </section>

        <section id="doc-country-dictionary" className="mt-14 mb-2 scroll-mt-[var(--docs-toc-gap)]">
          <h2 className="text-2xl font-bold text-gray-900 mb-3 dark:text-slate-100">
            Country Code Dictionary
          </h2>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
            Reference table for ISO 3166-1 alpha-2 codes used in slice URLs, Benchmark country filters, and exports.
            Chinese labels follow common mainland usage. Mobile app share and device columns are{' '}
            <strong>estimates</strong> for planning and cross-checking slice geography—not live AppsFlyer or store
            telemetry.
          </p>
          <DocNote variant="tip" title="Tip">
            Sort any column by clicking the header. Search matches code, English name, or Chinese name.
          </DocNote>
          <div className="mt-4">
            <CountryCodeDictionaryTable />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Doc;
