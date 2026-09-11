# Chrome Web Store Submission Checklist — HU Smart Schedule v1.1.0

Use this checklist while completing the submission on the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 1. Account & Prerequisites

- [ ] Chrome Web Store developer account registered ($5 one-time registration fee paid).
- [ ] 2-Step Verification enabled on the Google developer account.
- [ ] Developer profile information (developer name, email, physical address if required) completed.

---

## 2. Store Listing Configuration

- [ ] **Package Uploaded**: Uploaded verified production ZIP:
  `HU-Smart-Schedule-v1.1.0.zip`
- [ ] **Extension Title**: `HU Smart Schedule`
- [ ] **Summary (Short Description)**:
  `Plan Hashemite University schedules with course search, conflict detection, timetable generation, Break calculation, and PDF export.` (129 / 132 characters)
- [ ] **Detailed Description**: Copied plain text from `docs/chrome-web-store/STORE-LISTING.md`.
- [ ] **Category**: Selected **Education**.
- [ ] **Support URL**: `https://github.com/md3ja/HU-Smart-Schedule-Extension/issues`
- [ ] **Official Website / Homepage**: `https://github.com/md3ja/HU-Smart-Schedule-Extension`

---

## 3. Visual Graphic Assets

- [ ] **Icon**: `images/icon-128.png` (128x128 px, RGBA).
- [ ] **Screenshots** (5 uploaded from `docs/chrome-web-store/assets/`, 1280x800 px):
  - [ ] `01-course-search.png` (Course & Section Search)
  - [ ] `02-sections-results.png` (Live Sections & Timings)
  - [ ] `03-schedule-generator.png` (Conflict-Free Schedule Generator)
  - [ ] `04-weekly-calendar.png` (Interactive Weekly Calendar)
  - [ ] `05-pdf-export.png` (Clean A4 Print & PDF Export)
- [ ] **Small Promo Tile**: `docs/chrome-web-store/assets/small-promo-440x280.png` (440x280 px).
- [ ] **Marquee Tile**: `docs/chrome-web-store/assets/marquee-1400x560.png` (1400x560 px).

---

## 4. Privacy Practices Tab

- [ ] **Single Purpose Description**: Copied from `docs/chrome-web-store/PRIVACY-PRACTICES.md`.
- [ ] **Permission Justifications**:
  - [ ] `storage`: Pasted justification text.
  - [ ] `https://hu.edu.jo/*`:
    `Required to retrieve publicly available course section information from Hashemite University's public schedule pages. The extension does not request or access student portal credentials or student account data. Course search parameters are sent directly to hu.edu.jo only to retrieve the requested schedule information.`
- [ ] **Remote Code**: Selected **"No, I am not using remote code"**.
- [ ] **Data Usage Disclosures**:
  - [ ] **Website Content**: Selected **YES** (Fetches and parses public course schedule content from Hashemite University).
  - [ ] **All other categories**: Confirmed **UNCHECKED / NO**.
- [ ] **Privacy Policy URL**: Entered `https://github.com/md3ja/HU-Smart-Schedule-Extension/blob/main/PRIVACY.md`.
- [ ] **Limited Use Certification**: Accepted all compliance checkboxes.

---

## 5. Distribution

- [ ] **Visibility**: Set to **Public**.
- [ ] **Regions**: Selected **All regions** (or focused on Jordan + global availability).
- [ ] **Pricing**: Selected **Free / No in-app purchases**.

---

## 6. Final Review & Submission

- [ ] Verify v1.1.0 Smart Search, the 3,203-course catalog, NLP / Calc 1, ambiguity choices, and known-but-not-offered messages.
- [ ] Review existing screenshots against v1.1.0; replace outdated views before submission if needed.
- [ ] Confirm local matching and direct HU section requests are accurately disclosed; no backend or analytics.

- [ ] Previewed the store listing in the dashboard to ensure formatting and imagery are crisp.
- [ ] Verified that all disclaimers regarding independent project status and copyright are clearly visible.
- [ ] Stopped for review before final submission.
