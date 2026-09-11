# Privacy Policy — HU Smart Schedule

**Effective Date**: September 2026  
**Extension**: HU Smart Schedule (Chrome Extension)  
**Target Version**: 1.1.0  
**Repository**: [https://github.com/md3ja/HU-Smart-Schedule-Extension](https://github.com/md3ja/HU-Smart-Schedule-Extension)  
**Project Status**: Independent project (Publicly auditable source repository; Copyright © 2026. All rights reserved.)

---

## 1. Overview

HU Smart Schedule is an independent browser extension developed to assist Hashemite University students in organizing course timetables, detecting scheduling conflicts, and generating preferred schedule combinations prior to university course registration.

We value your privacy. This Privacy Policy outlines what information is processed, how network communications function, and the technical boundaries maintained by the extension.

---

## 2. Course Searches & Network Communications

Smart Search matching runs locally. Live semester sections are fetched directly from hu.edu.jo using the selected course number, academic year, and semester; unresolved Arabic name searches may use HU’s name-search service. No intermediary backend or analytics is used.

When live sections are requested:
- **User-Entered Query Parameters**: Resolved or directly entered course numbers (or unresolved Arabic course names for name-search fallback), academic year, and semester are sent directly from your browser to Hashemite University's publicly accessible course schedule service:
  `https://hu.edu.jo/unitCenter/`
  as required to perform the search and retrieve announced course section information.
- **Network Metadata**: Standard network request metadata (such as your IP address and standard HTTPS headers) may be received by Hashemite University's servers as part of normal HTTPS communication. Hashemite University's website operates under its own policies and privacy practices.
- **No Developer Backend Server**: The HU Smart Schedule developer does not operate an intermediary backend server receiving, logging, or storing these searches.

---

## 3. Local Schedule Processing

Core schedule processing runs locally inside the extension:
- **Smart Search**: Name normalization and matching against the bundled 3,203-course catalog run locally. Ambiguous matches require a user selection; catalog entries and historical hints do not establish live availability.
- **Conflict Detection**: Checking for overlapping lecture times occurs locally in browser memory.
- **Schedule Generation & Ranking**: Calculating compatible timetable combinations and ranking them based on student preferences is executed locally.
- **Break Calculation**: Measuring gap minutes between consecutive in-person lectures is performed locally.
- **Calendar & Export Rendering**: Visual weekly timetable rendering and A4 printable report generation run locally.

---

## 4. Local Data Storage (`chrome.storage.local`)

The extension utilizes Chrome's local storage API (`chrome.storage.local`) on your device for two functional purposes:
1. **User Preferences (`huSmartSchedule`)**: Stores your chosen academic year, semester, search terms, and schedule filter settings so you do not have to re-enter them every time the extension is opened.
2. **Export Transfer Data (`huSmartScheduleExport`)**: Temporarily stores the selected schedule proposal to populate the print/export report tab.

This data remains stored locally on your device, is never synchronized to external cloud servers, and is removed if you clear extension data or uninstall the extension.

---

## 5. Data We Do Not Collect

- **No Student Portal Credentials**: The extension does not request, access, collect, or store student ID numbers, portal usernames, university passwords, or authentication tokens.
- **No Personal Identifiers**: No personal data (names, email addresses, phone numbers) is collected by the extension.
- **No Browsing History or Activity Tracking**: The extension does not track or inspect your browsing history, open tabs, or web activity.
- **No Analytics or Telemetry**: No third-party analytics SDKs (such as Google Analytics, Sentry, or Mixpanel) are bundled or executed.
- **No Advertising**: The extension contains zero advertising code, marketing trackers, or tracking cookies.

---

## 6. Limited Use Disclosure

Data handled by HU Smart Schedule is used solely to provide and support the extension's user-facing timetable planning functionality.

HU Smart Schedule's use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. In accordance with Chrome Web Store User Data policies:
- Data is **not sold** to third parties.
- Data is **not used or transferred for advertising** or personalized marketing.
- Data is **not used for profiling**, creditworthiness, or lending purposes.
- Data is **not transferred for unrelated purposes**.

---

## 7. Chrome Permissions

The extension requests only minimal permissions necessary for its single purpose:
- **`storage`**: Used solely to persist your local user preferences and timetable export payload on your machine.
- **`https://hu.edu.jo/*`**: Required to retrieve publicly available course section information from Hashemite University's public schedule pages. The extension does not request or access student portal credentials or student account data. Course search parameters are sent directly to hu.edu.jo only to retrieve the requested schedule information.

*Note on Tabs*: The extension does not request the elevated `tabs` permission. It uses standard `chrome.tabs.create()` to open its full-page planner and print report in a new tab without inspecting your existing tabs or browsing history.

---

## 8. Support & Contact

For questions, issues, or feedback regarding this Privacy Policy, please open an issue in the official public repository:  
[https://github.com/md3ja/HU-Smart-Schedule-Extension/issues](https://github.com/md3ja/HU-Smart-Schedule-Extension/issues)

---

## 9. Disclaimer

HU Smart Schedule is an independent project. It is not affiliated with, endorsed by, officially connected to, or approved by Hashemite University.

Copyright © 2026. All rights reserved.
