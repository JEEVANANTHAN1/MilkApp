# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MilkApp is an Angular 19 standalone-component app for logging **dairy collection-center slips** — the receipt a farmer gets when depositing milk at a collection center (not a consumer purchase receipt). A real example slip has: dairy/vendor name, member code + member name (identifies the depositing farmer), date, FAT % and SNF % (milk quality readings), rate/liter, quantity, and total amount, e.g. `TOTAL AMT` (abbreviated, not "TOTAL AMOUNT"). A user photographs/uploads the slip and fills in the fields manually; the record — including the slip image as a base64 data URL — is persisted in the browser's IndexedDB. There is no backend for bill data. A separate `server/` (.NET + Ollama) OCR pipeline exists in the repo (see below) but is currently **not wired into the form** — auto-fill-from-image is disabled for now in favor of manual entry.

## Commands

- `npm start` / `ng serve` — run the dev server at `http://localhost:4200/`
- `ng build` — production build to `dist/milk-app` (dev build: `ng build --configuration development`)
- `npm test` / `ng test` — run unit tests via Karma/Jasmine (interactive Chrome runner)
- `ng generate component features/<feature>/<name>` — scaffold a new standalone component (schematics default to SCSS style)

There is no e2e test setup and no lint script configured in `package.json`.

## Architecture

- **Standalone components, no NgModules.** Bootstrapping is via `app.config.ts` (`provideRouter`, `provideZoneChangeDetection`), not a root module.
- **App shell has a persistent mobile bottom-nav.** `AppComponent` (`app.component.html/scss`) wraps `<router-outlet>` in a `.page-content` div and a fixed `.bottom-nav` with three tabs — Dashboard (`/`), Bills (`/bills`), Log bill (`/new`). `.page-content` carries bottom padding sized to the nav's height + `env(safe-area-inset-bottom)` so scrolled content doesn't end up hidden behind the fixed nav.
- **Routing is lazy and feature-scoped.** `app.routes.ts` lazy-loads `features/milk-bill/milk-bill.routes.ts` at path `''`, which lazy-loads the dashboard (`''`), bill list (`'bills'`), and form (`'new'`) components individually via `loadComponent`. Follow this pattern when adding new features/routes: a per-feature `*.routes.ts` file, wired into `app.routes.ts` via `loadChildren`.
- **State management uses Angular signals**, not RxJS/NgRx. `MilkBillService` (`src/app/features/milk-bill/milk-bill.service.ts`) holds a `signal<MilkBill[]>` and exposes derived `computed()` views: `allBills` (sorted by date desc), `totalSpent`, `isLoading`. Components read these signals directly in templates.
- **Dashboard owns its own month-filter state** — this is intentionally *not* on `MilkBillService`, since it's view-specific UI state, not shared app data. `DashboardComponent` (`features/milk-bill/dashboard/`) has a `selectedMonth` signal (`'yyyy-MM'` or the sentinel `'all'`, defaulting to the current month), and derives `filteredBills`/`filteredTotalSpent`/`filteredTotalLiters`/`filteredAverageRate`/`recentBills` from `milkBillService.allBills()` filtered by that selection. `monthOptions` is the set of distinct months that actually have bills, plus the current month even if it's empty, so the dropdown always has somewhere to land. `monthDeltaPercent` compares the selected month's spend against the month immediately before it (via the `shiftMonthKey()` helper) — it's `null` for `'all'` or when there's no prior-month data to compare against. If you need per-month/all-time aggregates elsewhere, follow this same pattern (filter `allBills()` in the component) rather than growing `MilkBillService` with view-specific computed signals again.
- **Persistence is a hand-rolled IndexedDB wrapper** inside `MilkBillService` — no storage library. One object store (`bills`) keyed by `id`, indexed by `billDate`. All bill records include the full image as a base64 `imageDataUrl`.
- **`MilkBill` model** (`models/milk-bill.model.ts` — the only copy; a stale duplicate at the old `milk-bill.model.ts` path was deleted) has, besides the core `billDate`/`quantityLiters`/`ratePerLiter`/`totalAmount`/`vendorName`: optional `fatPercent`, `snfPercent` (quality readings) and optional `memberCode`, `memberName` (identifies the depositing farmer). All optional since older/simpler slip formats may not have them.
- **Form is manual-entry only right now.** `MilkBillFormComponent` just reads the selected image to a data URL for preview/storage; every field (including FAT %/SNF %/member code/member name) is typed in by the user. `utils/bill-text-parser.ts`'s `parseBillText()` (heuristic regex extraction of fields from raw OCR text) covers all of these fields too — including FAT/SNF and a `parseLabeledLine()` helper for member code/name — as groundwork for re-enabling auto-fill later, but nothing currently calls it and there's no test file for it. Note: `parseTotal()`'s regex must try `total\s*amt` before the bare `total` fallback — real slips print `TOTAL AMT`, not `TOTAL AMOUNT`.
- **`OcrService`** (`ocr.service.ts`) still exists — it posts an image as `multipart/form-data` to `http://localhost:5257/api/ocr` (the `server/OcrOllamaApi` .NET project below) and returns raw OCR text — but it's not injected/called anywhere in the app anymore. To re-enable OCR auto-fill, wire it back into `MilkBillFormComponent.onImageSelected()`, feeding its result through `parseBillText()` to populate the signals.

## server/ (.NET — Ollama vision OCR)

`server/OcrOllama.slnx` ties together three .NET 9 projects. All of them talk to a locally running [Ollama](https://ollama.com) multimodal model (default `llava`) via its `/api/generate` endpoint.

- **`OcrOllama.Core`** — shared library. `OllamaVisionClient` (constructor takes an `HttpClient` whose `BaseAddress` is the Ollama host — the caller owns/configures/disposes it) exposes `ExtractTextAsync(model, prompt, imageBytes, ct)`. Request/response DTOs use a source-generated `JsonSerializerContext`.
- **`OcrOllamaConsole`** — CLI, independent of the Angular app. `dotnet run --project server/OcrOllamaConsole -- <image-path> [--model <name>] [--host <url>] [--prompt <text>]`. Creates its own `HttpClient` in `Program.cs`.
- **`OcrOllamaApi`** — ASP.NET Core minimal API that the Angular app calls. `dotnet run --project server/OcrOllamaApi` serves on `http://localhost:5257` by default (see `Properties/launchSettings.json`). Exposes `POST /api/ocr` (multipart form field `image`, optional `model`/`prompt` fields) → `{ "text": "..." }`. CORS is locked to a single allowed origin read from config (`Ollama:AllowedOrigin` in `appsettings.json`, default `http://localhost:4200`) — update that value (or `Ollama:Host` / `Ollama:Model`) rather than hardcoding elsewhere. Registers `OllamaVisionClient` via `AddHttpClient<T>` so `IHttpClientFactory` owns pooling/disposal.
- All three require Ollama running locally (`ollama serve`) with the target model pulled (`ollama pull llava`).
- Running the Angular dev server alone does **not** give you OCR — `OcrOllamaApi` (and Ollama) must also be running, or image select/re-scan will just show an error and require manual field entry.
