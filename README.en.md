# Trade Blueprint

**Read this in other languages:** [Português](README.md) · [Español](README.es.md)

Local application designed to help traders prepare before the trading session, organize analytical studies, and compare what was planned with what actually happened.

## Purpose

The tool is not designed to predict the market. It organizes the trader's decision-making process around four questions:

1. **What is my thesis and which scenarios matter for the next session?**
2. **What evidence exists against my thesis?**
3. **What will I do if scenario A, B, or C materializes?**
4. **After the session, what did the market do, what did I do, and how closely did I follow the original plan?**

## Current features — v0.12

### Trading system

Both parts of the trading method are available on one screen:

- **General rules:** Entry, Exit, Risk, Time, Context, and Behavior limits, with rationale, enable/disable status, and images;
- **Trading setups:** reusable patterns with context, entry criteria, confirmation, invalidation, stop, trade management, situations to avoid, and behavioral safeguards;
- apply a setup to scenario A of a plan.

The first launch includes fictional records marked with an **Example** badge. Each example can be removed individually.

### Trade plans

- plan by asset and date;
- bias and **declared thesis conviction**;
- context, levels, events, and maximum risk;
- no-trade conditions;
- **evidence against the thesis**;
- **“what would have to happen for me to change my mind?”**;
- A/B/C scenarios;
- behavior plan;
- images;
- freezing and version history;
- post-session review;
- **Planned × Actual Market × My Execution** comparison.

### Preparation quality

Before freezing a plan, the application shows a **preparation completeness score** and identifies important missing fields.

The score:

- measures process completeness only;
- **does not predict the market**;
- **is not an entry signal**;
- warns about critical gaps without necessarily blocking the trader.

The pre-market checklist now tracks **completed/not completed** state.

You can also:

- save a plan as a **template**;
- create plans from templates;
- duplicate a previous plan **without copying its review**.

### Studies

The **Studies** section is separate from trade plans and supports analytical exercises that do not need to be tied to a future trade.

### History

The **History** section aggregates learning over time:

- calendar of planned and reviewed sessions;
- filters by asset, setup, scenario, adherence, and period;
- adherence by setup;
- most frequently violated rules;
- planned × partially planned × improvised execution;
- reading quality × execution quality;
- text search across plans/reviews, rules, and setups;
- historical image gallery.

Post-session reviews now include structured fields that feed these metrics without relying only on free-text interpretation.

### Trade journal integration

Under **History**, executions can be imported from **JSON or CSV** and linked to plans.

- automatic linking by date + asset when there is exactly one compatible plan;
- manual link to plan and scenario A/B/C;
- import of times, prices, quantity, direction, and result;
- non-destructive review prefill when possible;
- detection of trades without a plan or pre-planned scenario;
- **Planned × traded × journaled** combined report.

Format and examples: [`docs/JOURNAL-INTEGRATION.md`](docs/JOURNAL-INTEGRATION.md).

### Deliberate training

The **Training** section turns historical records into practical exercises:

- outcome-blind Replay using frozen plans;
- automatic revisiting of low-adherence plans;
- exercises generated from the trader's most frequently violated rules;
- **“what I thought then” × “how I interpret it now”** comparison;
- personal library of **correct and incorrect** examples by setup.

During Replay, the actual market and original execution remain hidden until the trader records a new decision and reading.

## Installation and use on Windows

There are two ways to use the project.

### Option 1 — Install the Windows application

When a Windows installer is available under **Releases**:

1. open the repository on GitHub;
2. open **Releases**;
3. select the latest version;
4. download the Windows setup file, typically named like:
   ```text
   Trade-Blueprint-0.x.x-Windows-x64-setup.exe
   ```
5. double-click the downloaded file;
6. follow the installer;
7. open **Trade Blueprint** from the Start Menu.

Official builds with the updater enabled can check for new versions under **Settings > Desktop app and updates**.

> If there is no installer Release yet, use the option below.

### Option 2 — Run from source

#### 1. Install Node.js

Install a current **Node.js LTS** version.

#### 2. Download the project

On GitHub:

1. click **Code**;
2. click **Download ZIP**;
3. extract the ZIP;
4. open the extracted folder.

#### 3. Open Command Prompt in that folder

In Windows Explorer:

1. click the folder's address bar;
2. type:
   ```text
   cmd
   ```
3. press **Enter**.

Command Prompt will open directly in the correct folder.

#### 4. Install dependencies

Run:

```bash
npm install
```

Wait until it finishes. You normally need to do this again only after downloading a newer project version or when dependencies change.

#### 5. Start the application

Run:

```bash
npm run dev
```

When you see something similar to:

```text
Local: http://localhost:5173/
```

open that address in your browser.

Keep Command Prompt open while the local server is running. To stop it, return to the terminal and press **Ctrl + C**.

### Optional checks

```bash
npm run typecheck
npm run build
```

Building the desktop installer requires additional development tools. See [`docs/DESKTOP.md`](docs/DESKTOP.md) only if you intend to develop or package the desktop application.

