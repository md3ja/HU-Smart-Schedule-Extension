<div align="center">

<img src="images/icon-128.png" alt="HU Smart Schedule" width="96">

# HU Smart Schedule

### See your schedule before registration.
**From conflicts to a clean schedule.**

**English** · [العربية](README_AR.md)

</div>

HU Smart Schedule is a Chrome extension built for Hashemite University students to explore published course sections, detect timetable conflicts, and generate schedule options based on their preferences.

---

## 🎬 See it in action

![See it in action](docs/demo/generate-full-schedule.gif)

Enter your courses, choose your preferences, and generate timetable options without conflicts.

---

## ✨ Features

- 🔎 Search by course name or course number
- 📚 Fetch published sections, instructors, days, and times
- ⚠️ Automatic timetable conflict detection
- 🧩 Generate conflict-free schedule combinations
- ⭐ Rank schedules by student preferences
- 📅 Sunday–Thursday weekly calendar
- ⏳ Break calculation between in-person classes
- 🌐 Online classes included in conflict detection
- 🖥️ Full-page planner mode
- 📋 Copy schedule information
- 📄 A4 PDF / Print export

---

## 🚀 How it works

### 1️⃣ Add your courses
Enter course names or course numbers.

### 2️⃣ Choose your semester
Select the academic year and semester.

### 3️⃣ Set your preferences
Choose preferences such as fewer campus days, less Break, later starts, or earlier finishes.

### 4️⃣ Generate your schedule
HU Smart Schedule checks sections, detects conflicts, and generates timetable options.

HU Smart Schedule connects directly to the publicly available Hashemite University course schedule pages.

No student portal login is required.

---

## 🔎 Smart Search v1

Smart Search v1 matches course names and numbers locally against a bundled catalog of 3,203 courses, with Arabic normalization. Approved aliases include NLP → 2010042470 and Calc 1 → 110108101. Ambiguous terms require a course choice; Java, جافا, C++, AI, and ROS are not automatically resolved. A known course without sections in the selected semester is shown as not offered. Historical semester hints are guidance, not a guarantee of future availability.

Smart Search matching runs locally. Live semester sections are fetched directly from hu.edu.jo using the selected course number, academic year, and semester; unresolved Arabic name searches may use HU’s name-search service. No intermediary backend or analytics is used.

## 🔎 Quick course search

![Quick course search](docs/demo/search-single-course.gif)

Search for a single course by name or number and quickly view its available sections, instructors, days, and times.

---

## 🧩 Installation

![Installation](docs/demo/install-extension.gif)

1. Download the latest HU Smart Schedule release
2. Extract the downloaded ZIP file
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the extracted HU Smart Schedule folder
7. Pin **HU Smart Schedule** from Chrome's Extensions menu

Once installed, HU Smart Schedule can be used from any normal Chrome tab.

---

## 📄 PDF / Print export

![PDF / Print export](docs/demo/export-pdf-report.gif)

Export your timetable as a clean A4 report or save it directly as a PDF using Chrome's print dialog.

---

## ⚠️ Important note

Course and section information is based on data currently published by Hashemite University and may change.

Always confirm final section availability in the official registration system before registering.

---

## 🔒 Privacy

- No username or password is requested
- No student account information is collected
- Course searches are sent only to public Hashemite University schedule pages
- Conflict detection, Break calculation, ranking, and schedule generation run locally inside the extension
- Read the complete [Privacy Policy](PRIVACY.md)

---

## ℹ️ Disclaimer

HU Smart Schedule is an independent project.

It is not affiliated with, endorsed by, officially connected to, or approved by Hashemite University.

---

<div align="center">

**Version 1.1.0**

Copyright © 2026. All rights reserved.

</div>
