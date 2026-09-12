# Chrome Web Store Privacy Practices Disclosure

This document provides exact copy-paste answers for the **Privacy practices** tab in the Chrome Web Store Developer Dashboard for **HU Smart Schedule v1.2.0**.

---

## 1. Single Purpose Description

```text
The single purpose of HU Smart Schedule is to help students of the Hashemite University plan academic course schedules by searching public section offerings, detecting lecture time conflicts, generating optimal weekly schedules, and exporting printable timetables.
```

---

## 2. Permission Justifications

Enter these exact justifications in the developer dashboard for each requested permission:

### Permission: `storage`

**Justification**:
```text
Used exclusively to persist user schedule preferences (academic year, semester, course query keywords, time preferences, ranking criteria) and temporary timetable export payloads locally on the user's device via chrome.storage.local. Storage is not cloud-synchronized. Separate user-initiated section requests send course search parameters directly to hu.edu.jo.
```

### Host Permission: `https://hu.edu.jo/*`

**Justification**:
```text
Required to retrieve publicly available course section information from Hashemite University's public schedule pages. The extension does not request or access student portal credentials or student account data. Course search parameters are sent directly to hu.edu.jo only to retrieve the requested schedule information.
```

### Architectural Audit: `tabs` Permission
- **Status in Manifest**: The elevated `"tabs"` permission is **NOT** requested.
- **Clarification for Reviewers**: The extension calls `chrome.tabs.create()` to open its full-page planner view (`popup.html?tab=1`) and its print report view (`export.html`) in a new tab. Under Chrome Manifest V3, `chrome.tabs.create` does not require the `tabs` permission, as it only creates new tabs without reading tab URLs, titles, or browsing history. The extension intentionally avoids requesting `tabs` to uphold minimum privilege principles.

---

## 3. Remote Code Declaration

**Question**: Does your extension use remote code?  
**Answer**: **No, I am not using remote code.**

**Justification**:
```text
All JavaScript logic, HTML templates, and CSS stylesheets are completely packaged within the extension archive. The extension contains zero eval(), new Function(), or dynamic script injection, and loads zero external scripts or libraries from remote CDNs.
```

---

## 4. Data Usage / Collection Categories

Based on Chrome Web Store User Data guidance and the actual extension behavior:

| Category | Disclosure Status | Explanation |
| :--- | :---: | :--- |
| **Website Content** | **YES** (Checked) | **Reason**: Public course schedule content is fetched and parsed from hu.edu.jo; course number or fallback Arabic name, year, and semester are sent to retrieve it. |
| **Personally Identifiable Information** | **NO** (Unchecked) | No student names, emails, student IDs, phone numbers, or addresses are collected. |
| **Health Information** | **NO** (Unchecked) | None. |
| **Financial & Payment Information** | **NO** (Unchecked) | The extension is completely free with no payments or financial data. |
| **Authentication Information** | **NO** (Unchecked) | No student passwords, usernames, tokens, or credentials are requested or handled. |
| **Personal Communications** | **NO** (Unchecked) | None. |
| **Location** | **NO** (Unchecked) | No GPS, IP geolocation, or location tracking. |
| **Web History** | **NO** (Unchecked) | The extension does not record, access, or inspect user browsing history or visited URLs. |
| **User Activity** | **NO** (Unchecked) | No telemetry, click tracking, usage metrics, or page interaction analytics. |

---

## 5. Distinction of Data Handled

To ensure complete transparency during Chrome Web Store review, the data flows are clearly distinguished as follows:

### A. Data Handled by HU Smart Schedule
- Smart Search matching runs locally. Live semester sections are fetched directly from hu.edu.jo using the selected course number, academic year, and semester; unresolved Arabic name searches may use HU’s name-search service. No intermediary backend or analytics is used.
- The bundled catalog contains 3,203 courses; matching and Arabic normalization run locally.
- Course search terms, academic year, semester, and time preferences are temporarily held in browser memory and persisted locally via `chrome.storage.local`.
- Core schedule processing (conflict detection, schedule combination calculations, Break calculation, ranking, and timetable rendering) runs locally inside the extension.

### B. Data Received by the Developer
- **ZERO**: The developer does not operate an intermediary backend server.
- The developer does not receive, collect, or store any user searches, schedules, or analytics.

### C. Data Transmitted Directly to Hashemite University
- When a search is performed, course search parameters (course name/number, semester, year) are sent via HTTPS GET/POST requests directly from the extension to Hashemite University's public schedule service (`https://hu.edu.jo/unitCenter/`).
- Standard network request metadata (such as IP address and HTTP request headers) may be received by Hashemite University's servers as part of normal HTTPS web communication.

---

## 6. Certifications & Limited Use

Select the following confirmation checkboxes in the Developer Dashboard:

- [x] **I certify that my extension complies with the Chrome Web Store Developer Program Policies.**
- [x] **I certify that my extension complies with the User Data FAQ.**
- [x] **I certify that my collection, use, and transfer of user data adheres to the Limited Use requirements:**
  - Data handled by the extension is used only to provide HU Smart Schedule's user-facing timetable planning functionality.
  - Data is **not sold**.
  - Data is **not used for advertising**.
  - Data is **not used for profiling**.
  - Data is **not transferred for unrelated purposes**.
