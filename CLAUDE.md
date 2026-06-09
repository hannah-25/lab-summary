# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm.cmd install          # first-time setup
npm.cmd run capture      # manual capture mode (opens Chrome, user browses SRMS)
npm.cmd run batch        # batch mode (reads ward-patients.txt, auto-fetches all patients)
npm.cmd run reprocess    # re-run classification/formatting on the last capture without re-fetching
npm.cmd run test         # unit tests (no test runner — plain Node assertions)
```

`batch` requires a prior `capture` run to exist in `%LOCALAPPDATA%\TrinityLabSummary\raw\` so it can extract the API request templates.

All outputs land in `%LOCALAPPDATA%\TrinityLabSummary\output\`. Raw API responses are saved to `%LOCALAPPDATA%\TrinityLabSummary\raw\` for later reprocessing.

## Architecture

The pipeline has four stages: **capture → extract → classify → report**.

### Capture (`capture.mjs`, `batch.mjs`)

Two entry points, same output format:

- **capture**: Intercepts browser network responses via Playwright's `context.on("response")`. The user manually navigates SRMS pages while the interceptor collects JSON payloads. Saves raw responses to `raw/capture-<timestamp>.json`.
- **batch**: Reads patient names from `ward-patients.txt`, then directly POSTs to `rstUserList.do` (patient search) and `rstUserDtl.do` (detail fetch) using request templates extracted from the last `capture` run. Saves raw responses to `raw/batch-<timestamp>.json`.

Both use a persistent Chrome profile at `%LOCALAPPDATA%\TrinityLabSummary\srms-profile` so login sessions are reused.

### Extract (`extract.mjs`)

`extractLabRows(payload, sourceUrl)` walks arbitrary nested JSON from SRMS responses and pulls out lab result rows. It identifies patient metadata by looking for objects with `JNO` + `NAM`/`CHN`/`JN` fields, and result rows by objects with `O_GCDN` (test name) + `O_CHR` (result value). Narrative results (culture reports in `CRST` fields) are merged into rows whose `O_CHR` is empty.

Row shape: `{ patientJno, patientName, chartNo, accessionDate, code, internalCode, name, result, reference, flag, date, sample, parent, remark, sourceUrl }`.

The `parent` field tracks grouping headers: rows where `result === "**"` are section headers, and subsequent rows inherit that header as their `parent` until a new coded row appears.

### Classify (`classify.mjs`)

`classifyRows(rows)` buckets rows into: `blood | urine | sputum | stool | vre | bloodCulture | unclassified`.

Classification is regex-based on `name + sample + parent + remark`. Priority order: VRE/CRE → sputum → stool → blood culture → urine → blood. Anything unmatched goes to `unclassified` — if `미분류` items appear in output, add new regex rules here.

`formatMicroSection` and `microItems` handle microbiology formatting — they filter to the most recent accession date only and strip section headers.

### Report (`report.mjs`, `rules.mjs`)

`groupByPatient(rows)` groups by `chartNo` → `patientName` → `patientJno`.

`buildPatientReport` generates the plain-text output. `buildPatientView` generates a structured JSON object for `viewer-<timestamp>.json`.

`rules.mjs` contains the blood/UA formatting logic:
- `splitRecentAndPrevious(rows)` — separates the two most recent accession groups by `patientJno` key (same accession = same `JNO`), falling back to `accessionDate`/`date`.
- `buildBloodSummary` — always shows WBC, CRP, Na/K; conditionally shows BUN/Cr and OT/PT if either value is flagged; uses `ABBR` map for display names and `LAB_ORDER` for ordering. Albumin ≥2 and <3 gets a `★` prefix.
- `buildUaSummary` — only shows UA items that are abnormal (flagged or outside reference range).
- `shouldShowLab` — Glucose is only shown if value > 150.

## Key Files for Classification Changes

When `미분류` results appear, update the regex constants at the top of `src/classify.mjs`. The `ABBR`, `UA_ABBR`, `IGNORE`, `LAB_ORDER`, and `UA_ORDER` constants in `src/rules.mjs` control which blood/UA items are displayed and in what order.
