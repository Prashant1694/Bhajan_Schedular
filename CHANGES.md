# Bhajan Scheduler — Hardening & Architectural Upgrade Guide (CHANGES.md)

This document provides a comprehensive, beginner-friendly walkthrough of the production hardening and architectural upgrades performed on the **Bhajan Scheduler** codebase (branch: `hardening`). 

Written for software engineers and maintainers, it explains **what was vulnerable or fragile**, **what was changed**, **why it matters**, **how to verify the changes**, and **what manual steps the project owner needs to take** when deploying to Railway.

---

## Executive Summary

| Phase | Core Objective | Primary Deliverables | Git Commit |
|---|---|---|---|
| **Phase 1: Critical Security Hardening** | Protect identity, secret tokens, and sessions | Modern CSRF protection (`csrf-csrf`), secret query scoping (`withSecrets`), open-redirect guards, secure dummy bcrypt timings, session revocation on SQLite, clean public error messaging. | `728b685` |
| **Phase 2: Data Integrity & Reliability** | Eliminate race conditions, file locks & crashes | SQLite WAL mode & busy timeout PRAGMAs, automatic atomic backups via `VACUUM INTO`, whitelist schema validation, database indexes, batched activity logging buffer, graceful shutdown (`SIGTERM`/`SIGINT`), `/healthz` liveness probes. | `fe48989` |
| **Phase 3: Code Quality, Modularity & Testing** | Clean architecture & automated confidence | Centralized constants (`config/constants.js`), extracted service layer (`services/plannerService.js`), unified view locals (`middleware/authLocals.js`), automated test suite (16 tests in Node test runner), ESLint & Prettier configs, Dockerfile, GitHub Actions CI workflow. | `9d8c99d` |
| **Phase 4: UX & Progressive Enhancement** | Bulletproof user experience & touch accessibility | Universal double-submission prevention debounce, WCAG 44px minimum tap targets, branded custom 404 & 500 error pages, sticky form field preservation, PWA Service Worker cache version bump (`v5.0`). | `a6165c3` |

---

## Phase 1: Critical Security Hardening

### 1. What Was Wrong Before
* **Missing or Bypassed CSRF Protection**: Form submissions across the application were vulnerable to Cross-Site Request Forgery (CSRF). Malicious websites visited by logged-in coordinators could forge bhajan submissions, deletions, or session edits without authorization.
* **Sensitive Hash & PIN Leakage**: Querying `Singer` or `AdminUser` models returned sensitive fields (`password_hash`, `pin`) by default. Serializing models into API responses or EJS templates risked inadvertently exposing authentication credentials in client-side HTML or JSON responses.
* **Open Redirect Vulnerabilities**: The `redirect` parameter in login flows (`/singer/login?redirect=...`) was unvalidated, allowing attackers to construct phishing links redirecting devotees to external malicious websites.
* **Timing Attack Vulnerabilities in PIN & Password Checks**: When a user or singer ID did not exist, authentication immediately returned a failure without performing a hash comparison. Attackers could measure millisecond response timings to enumerate valid usernames and singer names.
* **Vulnerable Dependencies**: Legacy spreadsheet parsing relied on unmaintained or insecure packages vulnerable to prototype pollution.

### 2. What Was Changed
* **Double CSRF Cookie Strategy (`middleware/csrfProtection.js`)**: Implemented `csrf-csrf` using an HTTP-only `ps_csrf` cookie, custom header/body extraction (`X-CSRF-Token` or `_csrf`), and exemptions only for Google OAuth callbacks.
* **Model Secret Scoping (`models/Singer.js`, `models/AdminUser.js`)**: Configured Sequelize `defaultScope` to explicitly exclude `pin`, `password_hash`, and recovery secrets. Accessing secrets now requires explicit scope opt-in via `.scope("withSecrets")`.
* **Strict Open Redirect Guard (`services/securityHelpers.js`)**: Added `safeRedirect(targetUrl, fallback)` which validates paths with `/^\/(?!\/|\\)[^\r\n]*$/`, guaranteeing redirects stay on local paths.
* **Constant-Time Execution (`services/securityHelpers.js`, `controllers/singerHubController.js`)**: Pre-computed `DUMMY_BCRYPT_HASH`. Non-existent records now run a dummy `bcrypt.compare` to normalize timing characteristics.
* **Safe Session Invalidation (`services/sessionManager.js`)**: Session destruction revokes active SQLite sessions and clears authentication cookies (`connect.sid`, `ps_csrf`).
* **Switched to `exceljs`**: Replaced legacy spreadsheet libraries with hardened, modern `exceljs`.
* **Secured Logout Actions**: Converted all logout triggers from GET links to CSRF-protected POST forms.

### 3. Why It Matters
Coordinators and devotees manage sacred schedules. Preventing unauthorized session manipulation, credential exposure, and enumeration attacks ensures the platform remains trustworthy and compliant with modern security baselines.

### 4. How to Test
```bash
# Run unit tests validating auth redirects, login validations, and CSRF protection
npm test
```

### 5. Files Touched
* `middleware/csrfProtection.js` *(new)*
* `services/securityHelpers.js` *(new)*
* `services/sessionManager.js` *(new)*
* `models/Singer.js`
* `models/AdminUser.js`
* `controllers/authController.js`
* `controllers/singerHubController.js`
* `views/partials/sidebar.ejs`
* `views/app-shell.ejs`
* `views/singer-hub.ejs`

---

## Phase 2: Data Integrity & Reliability

### 1. What Was Wrong Before
* **SQLite `SQLITE_BUSY: database is locked` Errors**: Concurrent HTTP requests simultaneously attempting writes caused lock contention, crashing requests during peak Thursday scheduling hours.
* **Unprotected Concurrency in Bhajan Submissions**: Simultaneous submissions could exceed deity quota limits or create duplicate bhajan entries for the same slot.
* **Lack of Whitelist Body Validation**: Controllers trusted arbitrary `req.body` properties, risking mass assignment and unexpected mutations.
* **No Automated Disaster Recovery**: The SQLite database lacked automated, non-blocking backup mechanisms.
* **Dangerous Reset Cascades**: The danger reset endpoint could wipe records without an administrative confirmation phrase or safety snapshot.
* **Synchronous Activity Logging Bottlenecks**: Writing activity logs directly on every HTTP request caused disk I/O latency.

### 2. What Was Changed
* **SQLite PRAGMAs & WAL Mode (`config/database.js`)**: Configured connection pool hooks with:
  * `PRAGMA journal_mode = WAL;` (Write-Ahead Logging: concurrent readers never block writers, and writers never block readers)
  * `PRAGMA busy_timeout = 5000;` (Wait up to 5 seconds for write locks rather than immediately throwing `SQLITE_BUSY`)
  * `PRAGMA foreign_keys = ON;` (Enforce referential integrity)
  * `PRAGMA synchronous = NORMAL;` (Safe, high-throughput durability)
* **Automated Atomic Backups (`services/backupService.js`)**: Implemented SQLite `VACUUM INTO` backups that create clean, consistent snapshots without pausing traffic. Backups run nightly at 2:00 AM and prune files older than 7 days.
* **Whitelist Schema Validators (`services/validators.js`)**: Strict key whitelists for `submitForm`, `copySession`, `updatePermission`, and `reorder`, rejecting unexpected payloads before database execution.
* **Transactional Concurrency Protection (`controllers/plannerController.js`)**: Bhajan submissions and session mutations are wrapped in Sequelize transactions with slot-limit checks, returning clean `409 Conflict` errors on duplicates.
* **Database Performance Indexes (`services/databaseInitializer.js`)**: Created compound indexes on `(session_date, deity)`, `(session_date, singer_name)`, and foreign keys.
* **Batched Activity Tracker (`middleware/activityTracker.js`)**: Activity logs are buffered in memory and flushed periodically every 5 seconds or 50 items, drastically reducing SQLite write amplification.
* **Graceful Process Lifecycle (`app.js`)**: Added `SIGTERM` and `SIGINT` handlers that flush memory buffers, close HTTP listeners, and cleanly terminate SQLite connections before process exit.
* **Liveness & Readiness Endpoint (`/healthz`)**: Returns JSON health metadata (`status`, `database`, `uptimeSeconds`, `memory`).

### 3. Why It Matters
When dozens of devotees access the planner simultaneously before the Thursday deadline, SQLite in default rollback journal mode would fail with database lock errors. WAL mode, busy timeout buffers, and transactional checks ensure zero lost submissions and continuous uptime.

### 4. How to Test
```bash
# Verify health probe returns 200 JSON with database connection state
curl http://localhost:8000/healthz
```

### 5. Files Touched
* `config/database.js`
* `services/backupService.js` *(new)*
* `services/validators.js` *(new)*
* `services/logger.js` *(new)*
* `services/databaseInitializer.js`
* `middleware/activityTracker.js`
* `controllers/adminController.js`
* `controllers/plannerController.js`
* `app.js`

---

## Phase 3: Code Quality, Modularity & Testing

### 1. What Was Wrong Before
* **Scattered Magic Strings & Constants**: Deity lists, validation rules, speed orders, and lockout durations were duplicated across controllers and view templates.
* **Monolithic Controllers**: `plannerController.js` handled route extraction, domain calculations, database queries, and raw HTML generation within single files.
* **Moojibake Corruptions**: Corrupted characters (`â€”`, `ðŸ”’`) existed in templates due to mismatched UTF-8 encodings.
* **Missing Test Automation**: No automated test suites existed to catch regressions before deployments.
* **Missing Containerization**: No standard Docker configuration or continuous integration pipeline.

### 2. What Was Changed
* **Central Constants Hub (`config/constants.js`)**: Centralized `ROLES`, `VALID_DEITIES`, `DEITY_ORDER`, `DEITY_ALIASES`, `SPEED_VALUES`, `DEFAULT_DEITY_LIMITS`, and `PIN_LOCKOUT_CONFIG`.
* **Planner Service Extraction (`services/plannerService.js`)**: Extracted domain logic (`getAvailableDates`, `buildDeityStatus`, `generateDeityCardsHtml`, `renderSelectionScreenHtml`, `normalizeBhajanTitle`) out of `controllers/plannerController.js`.
* **Universal Auth Locals Middleware (`middleware/authLocals.js`)**: Exposes clean `res.locals.auth` (`isAdmin`, `isSuperAdmin`, `isSinger`, `user`) to all EJS templates.
* **Standardized Testing Suite (`tests/`)**: Built 16 automated tests utilizing Node.js's native test runner (`node:test`) and `supertest`:
  * `tests/healthz.test.js`: Healthz checks, 404 HTML fallback, and 404 JSON fallback.
  * `tests/auth.test.js`: Admin login forms, redirects, session script logouts, invalid credentials.
  * `tests/bhajanSubmission.test.js`: Whitelist validation schemas, session copying, unauthorized redirects.
  * `tests/pinLockout.test.js`: Constant-time dummy bcrypt checks, 4-digit PIN format validation.
* **Code Standard Configurations**:
  * `.prettierrc`: Consistent 2-space indentation and formatting.
  * `eslint.config.js`: Modern flat config ensuring zero undeclared variables and strict syntax checks.
* **Production Multi-Stage `Dockerfile`**: Optimized Node 20 Alpine container with native build stages, curl healthchecks, and non-root execution under user `node`.
* **CI Workflow (`.github/workflows/ci.yml`)**: Runs linting and test suites across Node 18, 20, and 22 on every pull request.
* **Railway Deployment Config (`railway.json`)**: Configured `"healthcheckPath": "/healthz"` with retry policies.

### 3. Why It Matters
A modular codebase with automated tests prevents accidental regressions when new features are added. CI/CD integration guarantees that pull requests cannot break authentication or data schemas.

### 4. How to Test
```bash
# Run lint checks
npm run lint

# Run code formatter
npm run format

# Run full test suite (16 tests)
npm test
```

### 5. Files Touched
* `config/constants.js` *(new)*
* `services/plannerService.js` *(new)*
* `middleware/authLocals.js` *(new)*
* `tests/healthz.test.js` *(new)*
* `tests/auth.test.js` *(new)*
* `tests/bhajanSubmission.test.js` *(new)*
* `tests/pinLockout.test.js` *(new)*
* `.prettierrc` *(new)*
* `eslint.config.js` *(new)*
* `Dockerfile` *(new)*
* `.dockerignore` *(new)*
* `.github/workflows/ci.yml` *(new)*
* `railway.json`
* `package.json`

---

## Phase 4: Accessibility & Progressive Enhancement

### 1. What Was Wrong Before
* **Accidental Double-Submissions**: Impatient devotees clicking the submit button multiple times on slow mobile connections could trigger duplicate form submissions.
* **Touch Targets Under 44px**: Certain buttons, form inputs, and bottom navigation pills on mobile devices were smaller than the 44px minimum required by WCAG 2.5.5 / 2.5.8 accessibility standards.
* **Generic Error Screens**: 404 and 500 errors returned raw browser error messages or plain text strings rather than friendly, branded pages.
* **Stale PWA Caches**: Clients with the Progressive Web App installed were still caching legacy assets under the old cache version.
* **Lost Form Input on Error**: Entering an invalid admin password cleared the typed username, forcing users to type both fields again.

### 2. What Was Changed
* **Universal Double-Submit Prevention (`public/js/script.js`)**: Added a submission debounce to the global form listener. When a form is submitted, subsequent clicks are ignored, the submit button is disabled after 10ms with visual feedback (`cursor: wait`, `opacity: 0.7`), and an 8-second safety reset prevents locked buttons on client validation failures.
* **WCAG 44px Touch Targets (`public/css/style.css`, `public/css/app-shell.css`)**:
  * Set `min-height: 44px` on all buttons, inputs, selects, and action controls on mobile devices.
  * Set `min-height: 48px` on `.native-bottom-nav .nav-tab` for comfortable thumb interaction.
* **Custom Branded Error Views (`views/404.ejs`, `views/500.ejs`)**: Beautiful EJS templates matching the app design system with return-home and go-back actions.
* **PWA Service Worker Bump (`public/sw.js`)**: Incremented `CACHE_VERSION` to `"v5.0"`. Activates cache invalidation to purge old caches (`bhajan-planner-v2`) and guarantee users receive hardened CSS and JavaScript.
* **Sticky Input Preservation (`controllers/authController.js`, `views/admin-login.ejs`)**: Retains the typed username on login failure so users only re-enter their password.

### 3. Why It Matters
Many devotees access the schedule on mobile devices at the temple, often on cellular networks. Ensuring touch accessibility, preventing duplicate clicks, and providing clear recovery pages creates an accessible, respectful user experience.

### 4. How to Test
```bash
# Verify custom 404 page renders in HTML
curl http://localhost:8000/non-existent-page

# Verify 404 API requests receive JSON
curl -H "Accept: application/json" http://localhost:8000/api/non-existent
```

### 5. Files Touched
* `public/js/script.js`
* `public/css/style.css`
* `public/css/app-shell.css`
* `public/sw.js`
* `views/404.ejs` *(new)*
* `views/500.ejs` *(new)*
* `views/admin-login.ejs`
* `controllers/authController.js`
* `app.js`

---

## Manual Steps for the Repository Owner

When deploying these hardened changes to production (e.g. Railway), perform these one-time administrative steps:

### 1. Set Environment Variables in Railway Dashboard
Under your Railway project settings -> **Variables**, configure:
* `SESSION_SECRET`: Set to a strong random 64-character hex string (e.g., generate via `openssl rand -hex 32`).
* `CSRF_SECRET`: Set to a distinct strong random 64-character hex string.
* `NODE_ENV`: Set to `production`.
* `PORT`: Set to `8000` (or leave default if Railway injects dynamic `PORT`).

### 2. Verify Railway Volume Mount (Persistent Database)
Ensure your Railway service has a persistent volume mounted at `/app` or specifies `DB_PATH` (e.g. `DB_PATH=/data/bhajans.db`) so database changes and the `backups/` directory survive container redeployments.

### 3. Verify Health Check URL
Confirm Railway service settings -> **Deploy** -> **Healthcheck Path** is set to:
```
/healthz
```

### 4. Test Production Backup Download
1. Log in to the Admin Dashboard as a Super Admin.
2. Navigate to the **Database / System** tab.
3. Download an on-demand database backup to verify atomic `VACUUM INTO` execution.
