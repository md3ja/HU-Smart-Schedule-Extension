# Technical Architecture & Chrome Web Store Review Analysis

**Extension**: HU Smart Schedule  
**Target Version**: 1.1.0  
**Manifest Version**: 3  
**Review Date**: September 2026  
**Repository**: [HU-Smart-Schedule-Extension](https://github.com/md3ja/HU-Smart-Schedule-Extension)  
**Project Status**: Independent project (Publicly auditable source repository; Copyright © 2026. All rights reserved.)

This technical review inspects the actual production codebase of HU Smart Schedule v1.1.0 to provide verifiable, evidence-based answers for Chrome Web Store submission, privacy certifications, and permission justifications.

---

## 1. Manifest Configuration

Inspection of `manifest.json` confirms:
- **`manifest_version`**: `3`
- **`name`**: `"HU Smart Schedule"`
- **`version`**: `"1.1.0"`
- **`description`**: `"__MSG_appDesc__"`
- **`default_locale`**: `"en"`; packaged English and Arabic descriptions.
- **`icons`**:
  - 16x16: `images/icon-16.png`
  - 32x32: `images/icon-32.png`
  - 48x48: `images/icon-48.png`
  - 128x128: `images/icon-128.png`
- **`action`**:
  - `default_title`: `"HU Smart Schedule"`
  - `default_popup`: `"popup.html"`
  - `default_icon`: References to 16, 32, 48, 128 px icons
- **`permissions`**: `["storage"]` (Only)
- **`host_permissions`**: `["https://hu.edu.jo/*"]` (Only)
- **Background Worker**: None (No background service worker declared)
- **Content Scripts**: None (Zero content scripts injected)

---

## 2. Permissions & API Usage (Code Evidence)

### A. `storage` Permission
- **Manifest**: Declared under `"permissions": ["storage"]`.
- **API Call**: `chrome.storage.local` is used exclusively.
- **Evidence**:
  - `popup.js`: `await chrome.storage.local.set({huSmartSchedule: data});` — Persists user schedule preferences (selected academic year, semester, course query keywords, time window limits, ranking mode) locally on the user's device so settings remain available across popup sessions.
  - `popup.js`: `const obj = await chrome.storage.local.get("huSmartSchedule");` — Reads stored preferences on popup load.
  - `popup.js`: `await chrome.storage.local.set({ huSmartScheduleExport: payload });` — Temporarily saves the selected schedule proposal to transfer it to the export report view.
  - `export.js`: `const obj = await chrome.storage.local.get('huSmartScheduleExport');` — Loads the schedule payload into the A4 print/export view.
- **Scope**: Preferences and export payloads are stored locally and are not cloud-synchronized. Search parameters are separately transmitted directly to HU when retrieving sections.

### B. Use of `chrome.tabs`
- **Manifest**: The `"tabs"` permission is **NOT** declared.
- **Code Usage**:
  - `popup.js`: `await chrome.tabs.create({ url: exportUrl });` — Opens `export.html` in a new browser tab.
  - `popup.js`: `chrome.tabs.create({ url });` — Opens `popup.html?tab=1` in a new full-page browser tab.
- **Chrome Permission Architecture**: Under Chrome Extensions Manifest V3, `chrome.tabs.create()` is available to extension action pages **without** requiring the elevated `tabs` permission because it only opens a new tab and does not inspect or manipulate existing tab URLs, titles, or browsing history. The extension correctly minimizes permissions by omitting `"tabs"`.

---

## 3. Network Architecture & Data Handling

### A. Direct Communication with Hashemite University
- **External Domain**: `https://hu.edu.jo`
- **Endpoint**: `https://hu.edu.jo/unitCenter/` (Public course schedule search).
- **Evidence**:
  - `popup.js`: `const BASE = "https://hu.edu.jo/unitCenter/";`
  - `popup.js`: `const response = await fetch(url, { ... });` inside `requestHtml()`.
- **What is transmitted**: Course search parameters (course name or course number, semester code, and academic year code) are sent directly from the user's browser to `https://hu.edu.jo/unitCenter/` to retrieve announced course sections.
- **Network Metadata**: Standard network request metadata (such as IP address and standard HTTPS headers) may be received by Hashemite University's servers as part of normal HTTPS communication.
- **Zero Developer Intermediary**: The developer of HU Smart Schedule does not operate an intermediary backend server. The developer does not receive, intercept, or log these searches.

### B. Local Schedule Processing

Smart Search v1 matches course names and numbers locally against a bundled catalog of 3,203 courses, with Arabic normalization. Approved aliases include NLP → 2010042470 and Calc 1 → 110108101. Ambiguous terms require a course choice; Java, جافا, C++, AI, and ROS are not automatically resolved. A known course without sections in the selected semester is shown as not offered. Historical semester hints are guidance, not a guarantee of future availability.

Smart Search matching runs locally. Live semester sections are fetched directly from hu.edu.jo using the selected course number, academic year, and semester; unresolved Arabic name searches may use HU’s name-search service. No intermediary backend or analytics is used.

Runtime files include locally packaged `smart-search.js` and `smart-search-catalog.json`; popup.html loads Smart Search before popup.js. Source: private reviewed commit `80f7f16b20f0eee0526e71db08bf7551b5e4c422`.

Once course section HTML is received by the extension:
- **Conflict Detection**: Checks for lecture time overlaps locally in browser memory.
- **Schedule Generation**: Calculates compatible section combinations locally.
- **Break Calculation**: Measures break durations between consecutive in-person lectures locally.
- **Ranking**: Sorts schedule proposals based on user criteria locally.
- **Calendar & Export Rendering**: Weekly timetable grid and A4 printable report are rendered locally.

---

## 4. Privacy Practices & Data Classification

| Checkpoint | Status in Extension | Verified Technical Detail |
| :--- | :---: | :--- |
| **Website Content** | **YES** | The extension fetches and parses publicly available course schedule content from Hashemite University's website in response to user searches. |
| **User Authentication / Credentials** | **NO** | The extension does not request or access student portal credentials or student account data. |
| **Personally Identifiable Information** | **NO** | No student names, emails, phone numbers, or student IDs are collected or processed. |
| **Health, Financial, Location Info** | **NO** | Zero health, payment, or geolocation data is processed. |
| **Browsing History / User Activity** | **NO** | No general web activity tracking or tab history inspection. |
| **Analytics & Telemetry** | **NO** | Zero analytics SDKs (no Google Analytics, Sentry, Mixpanel, etc.). |
| **Advertising / Tracking** | **NO** | Zero ad networks, marketing trackers, or tracking pixels. |
| **Remote Code Execution** | **NO** | Zero `eval()`, `new Function()`, or remote CDN scripts. All scripts are packaged locally. |

---

## 5. Summary for Chrome Web Store Reviewers

1. **Single Purpose**: Dedicated exclusively to helping Hashemite University students plan conflict-free academic schedules.
2. **Minimal Permissions**: Requests only `storage` and scoped host permission `https://hu.edu.jo/*`.
3. **Transparent Data Handling**: Course searches go directly to the public university portal; core processing runs locally; no developer backend server exists.
