# HU Smart Schedule

**Build smarter university schedules.**

A fast course schedule planner with automatic conflict detection, flexible preferences, Break-aware filtering, and printable schedule reports — built for Hashemite University students.

<p align="left">
  <img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-v1.4.0-yellow.svg" alt="Version 1.4.0">
  <img src="https://img.shields.io/badge/Built%20for-HU%20Students-teal.svg" alt="Built for HU Students">
  <img src="https://img.shields.io/badge/Architecture-No%20Backend-green.svg" alt="No Backend">
  <img src="https://img.shields.io/badge/License-All%20Rights%20Reserved-lightgrey.svg" alt="All Rights Reserved">
</p>

> **Unofficial student tool.** HU Smart Schedule is not affiliated with or endorsed by Hashemite University.

---

# 🇬🇧 English

## 🎬 Overview

HU Smart Schedule helps students plan before registration by fetching public course-section data from Hashemite University and generating compatible weekly timetable proposals.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-v14-demo.gif" alt="HU Smart Schedule Overview" width="720">
</p>

## ✨ Key Features

- 🔎 **Smart Search:** Search by course number, course name, or supported shorthand.
- ⚠️ **Conflict Detection:** Identify overlapping sections and lecture times automatically.
- 🧩 **Schedule Generation & Ranking:** Generate compatible combinations and rank them by fewer campus days, smaller gaps, or preferred times.
- ☕ **Break Filtering:** Filter proposals by preferred free-time windows between consecutive in-person classes.
- ➕ **Course Management:** Add or remove courses during the same planning session without starting over.
- 📅 **Weekly Calendar:** Review Sunday–Thursday schedules with course cards, Break indicators, off-days, and remote-class badges.
- 🖨️ **Printable Reports:** Print or save a clean, low-ink A4 schedule report as PDF.
- 💾 **Persistent Draft:** Your entered courses and relevant preferences are saved locally so you can continue later.

---

## 🔎 Search & Preferences

Search by course number, name, or supported shorthand. Set your preferred lecture start/end limits, choose days off, and select how schedule proposals should be ranked.

When a search matches multiple subjects, **Course Disambiguation** lets you choose the intended course directly.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-search-and-preferences.gif" alt="Search and Preferences" width="720">
</p>

---

## ⚠️ Sections & Conflicts

Open **"كل الشعب والتواقيت"** to inspect announced sections, instructors, lecture times, days, and hall locations.

If selected courses overlap, the **"الشعب المتعارضة"** panel shows exactly which sections and times conflict.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-sections-and-conflicts.gif" alt="Sections and Conflicts" width="720">
</p>

---

## ☕ Break-Aware Scheduling

Choose preferred **Break** windows and instantly filter the generated schedule proposals that match them.

- **Sunday / Tuesday / Thursday (STT):** 1-hour slots starting from 08:30.
- **Monday / Wednesday (MW):** 90-minute slots starting from 08:00.
- **Matching modes:** Require all selected Breaks or allow any selected Break.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-break-filter.gif" alt="Break Filtering" width="720">
</p>

<details>
<summary><b>Break calculation rules</b></summary>

- A **Break** is free time between consecutive **in-person** classes on the same day.
- Free time before the first campus class does not count as a Break.
- Free time after the last campus class does not count as a Break.
- Online classes do not create or extend campus Break intervals.
- A day with no in-person classes is treated as an off-day rather than a campus day.

</details>

---

## ➕ Course Management

Use **"إدارة المواد"** to remove a course, add another one, and continue the current planning workflow without restarting your search.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-course-management.gif" alt="Course Management" width="720">
</p>

---

## 📅 Weekly Calendar

Each proposal is shown in a clear Sunday–Thursday timetable with:

- a full time axis from morning to evening,
- course title, section, instructor, and meeting time,
- Break indicators,
- off-day badges,
- remote-class indicators.

<p align="center">
  <img src="docs/screenshots/hu-smart-schedule-weekly-calendar.png" alt="Weekly Calendar" width="720">
</p>

---

## 🖨️ PDF Export

Print or save your preferred schedule through the browser's native print workflow.

The report includes:

- academic year and semester,
- campus-day and lecture-time summary,
- daily Break summary,
- weekly timetable,
- detailed course/section table,
- clean white low-ink A4 layout.

<p align="center">
  <img src="docs/screenshots/hu-smart-schedule-pdf-export-preview.png" alt="PDF Export Preview" width="720">
</p>

---

## 🚀 Quick Start

1. **Open HU Smart Schedule** from the Chrome extensions toolbar.
2. **Choose the academic year and semester.**
3. **Enter your courses** — one course number, name, or supported shorthand per line.
4. **Set your preferences** — lecture time limits, preferred off-days, and ranking criteria.
5. Click **"اجلب الشعب وابنِ الجداول"**.
6. Review **available sections and conflicts**.
7. Optionally choose a preferred **Break** window.
8. Pick a proposal and click **"طباعة الجدول (PDF)"** to print or save it.

---

## 📦 Installation

### Manual installation on Google Chrome

1. Download the latest package from [GitHub Releases](https://github.com/md3ja/HU-Smart-Schedule-Extension/releases).
2. Extract `HU-Smart-Schedule-v1.4.0.zip`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder.
7. Pin **HU Smart Schedule** to the Chrome toolbar if you want quick access.

> Current release: **v1.4.0**

---

## 🔒 Privacy & Permissions

HU Smart Schedule uses a privacy-focused architecture with local schedule processing.

- **No student login required:** The extension does not ask for or store university usernames or passwords.
- **Direct HU public access:** Public section data is fetched directly from `https://hu.edu.jo/*` over HTTPS.
- **No external backend or analytics:** No developer backend, analytics service, or tracking script is built into the extension.
- **Local schedule processing:** Schedule generation, conflict analysis, ranking, and Break filtering run inside the browser.
- **Local storage:** The `storage` permission is used for extension state, course drafts, and user preferences.

See [PRIVACY.md](PRIVACY.md) for more details.

---

## 🛠️ Technical Details

- **Platform:** Google Chrome Extension
- **Manifest:** Manifest V3
- **Frontend:** HTML5, CSS3, modern JavaScript
- **Interface:** Arabic RTL
- **Processing:** In-browser schedule generation, ranking, and conflict detection
- **Data source:** Hashemite University public section pages
- **Host access:** `https://hu.edu.jo/*`
- **Backend:** None

---

## 🆕 Current Release

**Current Version:** `v1.4.0`

### Highlights

- 🌙 Refreshed dark visual theme
- 📅 Clearer 5-day weekly calendar
- 🔎 Search V2 improvements and Course Disambiguation
- 💾 Persistent course draft
- ➕ Improved course-management workflow
- ☕ Dynamic Break filtering
- 🖨️ Cleaner printable schedule reports
- ♿ Accessibility and interaction improvements
- 🌐 More reliable HU data requests

[View HU Smart Schedule v1.4.0 on GitHub Releases](https://github.com/md3ja/HU-Smart-Schedule-Extension/releases/tag/v1.4.0)

---

## 📜 License & Usage

© 2026 HU Smart Schedule. **All Rights Reserved.**

This project is proprietary and is **not open source**. Unauthorized copying, redistribution, modification, or commercial reuse of the source code or project assets is prohibited.

---

# 🇯🇴 العربية

## 🎬 نظرة عامة

**HU Smart Schedule** أداة تساعد طلبة الجامعة الهاشمية على تخطيط جداولهم قبل التسجيل، من خلال جلب بيانات الشعب العامة من موقع الجامعة وتوليد اقتراحات جداول أسبوعية متوافقة.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-v14-demo.gif" alt="نظرة عامة على HU Smart Schedule" width="720">
</p>

## ✨ أهم المميزات

- 🔎 **البحث الذكي:** البحث برقم المادة أو اسمها أو الاختصارات المدعومة.
- ⚠️ **كشف التعارضات:** تحديد الشعب والمواعيد المتداخلة تلقائياً.
- 🧩 **توليد وترتيب الجداول:** إنشاء اقتراحات جداول متوافقة وترتيبها حسب أقل أيام دوام أو أقل فراغات أو الأوقات المفضلة.
- ☕ **فلترة Break:** فلترة الجداول حسب فترات الاستراحة المفضلة بين المحاضرات الوجاهية المتتالية.
- ➕ **إدارة المواد:** إضافة أو حذف مادة أثناء نفس جلسة التخطيط دون البدء من جديد.
- 📅 **الجدول الأسبوعي:** عرض أيام الأحد إلى الخميس مع بطاقات المواد والاستراحات والعطل والمحاضرات عن بُعد.
- 🖨️ **تقارير للطباعة:** طباعة الجدول أو حفظه بصيغة PDF بتصميم A4 واضح وموفر للحبر.
- 💾 **حفظ المسودة:** حفظ المواد المدخلة والتفضيلات ذات الصلة محلياً لاستكمال التخطيط لاحقاً.

---

## 🔎 البحث والتفضيلات

ابحث برقم المادة أو اسمها أو الاختصارات المدعومة، ثم حدد وقت بداية ونهاية المحاضرات المفضل، وأيام العطلة، وطريقة ترتيب اقتراحات الجداول.

إذا طابق البحث أكثر من مادة، تساعدك ميزة **تحديد المادة المقصودة** على اختيار المادة الصحيحة مباشرة.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-search-and-preferences.gif" alt="البحث والتفضيلات" width="720">
</p>

---

## ⚠️ الشعب والتعارضات

افتح قسم **"كل الشعب والتواقيت"** لاستعراض الشعب المعلنة والمدرسين والأيام والأوقات والقاعات.

وعند وجود تداخل، تعرض لوحة **"الشعب المتعارضة"** الشعب والمواعيد المتداخلة بشكل واضح.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-sections-and-conflicts.gif" alt="الشعب والتعارضات" width="720">
</p>

---

## ☕ الجداول حسب الاستراحات

اختر فترات **Break** المفضلة ليتم تحديث عدد الجداول المطابقة وفلترة الاقتراحات مباشرة.

- **الأحد / الثلاثاء / الخميس (STT):** فترات مدتها ساعة تبدأ من 08:30.
- **الاثنين / الأربعاء (MW):** فترات مدتها 90 دقيقة تبدأ من 08:00.
- **أوضاع المطابقة:** إلزامية تحقيق جميع الاستراحات المحددة أو الاكتفاء بتحقيق أي استراحة منها.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-break-filter.gif" alt="فلترة فترات الاستراحة" width="720">
</p>

<details>
<summary><b>قواعد احتساب Break</b></summary>

- الـ **Break** هي فترة الفراغ بين محاضرتين **وجاهيتين** متتاليتين في نفس اليوم.
- الوقت قبل أول محاضرة وجاهية لا يُحتسب Break.
- الوقت بعد آخر محاضرة وجاهية لا يُحتسب Break.
- المحاضرات عن بُعد لا تنشئ أو تمدد فترات Break داخل الحرم.
- اليوم الذي لا يحتوي على محاضرات وجاهية يُعتبر يوم عطلة وليس يوم دوام.

</details>

---

## ➕ إدارة المواد

من خلال **"إدارة المواد"** يمكنك حذف مادة أو إضافة مادة جديدة ومتابعة التخطيط الحالي دون الحاجة لإعادة البحث من البداية.

<p align="center">
  <img src="docs/demo/hu-smart-schedule-course-management.gif" alt="إدارة المواد" width="720">
</p>

---

## 📅 الجدول الأسبوعي

يُعرض كل اقتراح في جدول واضح من الأحد إلى الخميس ويتضمن:

- محور وقت من الصباح حتى المساء،
- اسم المادة والشعبة والمدرس ووقت المحاضرة،
- شارات Break،
- شارات أيام العطلة،
- تمييز المحاضرات عن بُعد.

<p align="center">
  <img src="docs/screenshots/hu-smart-schedule-weekly-calendar.png" alt="الجدول الأسبوعي" width="720">
</p>

---

## 🖨️ تصدير وطباعة PDF

يمكنك طباعة الجدول أو حفظه كملف PDF باستخدام نافذة الطباعة الأصلية في المتصفح.

ويتضمن التقرير:

- السنة والفصل الدراسي،
- ملخص أيام الدوام وأوقات المحاضرات،
- ملخص فترات Break اليومية،
- الجدول الأسبوعي،
- جدولاً مفصلاً للمواد والشعب،
- تصميماً أبيض واضحاً وموفراً للحبر بحجم A4.

<p align="center">
  <img src="docs/screenshots/hu-smart-schedule-pdf-export-preview.png" alt="معاينة تقرير PDF" width="720">
</p>

---

## 🚀 طريقة الاستخدام

1. افتح **HU Smart Schedule** من شريط إضافات Chrome.
2. اختر **السنة والفصل الدراسي**.
3. أدخل المواد — رقم المادة أو اسمها أو الاختصار المدعوم، مادة في كل سطر.
4. حدد **التفضيلات** مثل حدود وقت المحاضرات وأيام العطلة وطريقة ترتيب الجداول.
5. اضغط **"اجلب الشعب وابنِ الجداول"**.
6. راجع **الشعب المتاحة والتعارضات**.
7. يمكنك اختيار فترة **Break** لتصفية الجداول.
8. اختر الجدول المناسب واضغط **"طباعة الجدول (PDF)"** للطباعة أو الحفظ.

---

## 📦 التثبيت

### التثبيت اليدوي على Google Chrome

1. حمّل أحدث ملف إصدار من [GitHub Releases](https://github.com/md3ja/HU-Smart-Schedule-Extension/releases).
2. فك ضغط `HU-Smart-Schedule-v1.4.0.zip`.
3. افتح `chrome://extensions`.
4. فعّل **Developer mode**.
5. اضغط **Load unpacked**.
6. اختر مجلد الإضافة بعد فك الضغط.
7. يمكنك تثبيت أيقونة **HU Smart Schedule** في شريط Chrome للوصول السريع.

> الإصدار الحالي: **v1.4.0**

---

## 🔒 الخصوصية والصلاحيات

تعتمد HU Smart Schedule على تصميم يركز على الخصوصية مع معالجة الجداول محلياً داخل المتصفح.

- **لا تتطلب تسجيل الدخول:** لا تطلب الإضافة اسم المستخدم أو كلمة المرور الجامعية ولا تخزنهما.
- **اتصال مباشر بموقع الجامعة العام:** يتم جلب بيانات الشعب العامة مباشرة من `https://hu.edu.jo/*` عبر HTTPS.
- **لا توجد خوادم خارجية أو تحليلات:** لا يوجد خادم وسيط للمطور ولا خدمات Analytics أو Tracking داخل الإضافة.
- **معالجة محلية للجداول:** يتم توليد الجداول وفحص التعارضات والترتيب وفلترة Break داخل المتصفح.
- **تخزين محلي:** تُستخدم صلاحية `storage` لحفظ حالة الإضافة ومسودة المواد وتفضيلات المستخدم.

للمزيد راجع [PRIVACY.md](PRIVACY.md).

---

## 🛠️ التفاصيل التقنية

- **المنصة:** إضافة Google Chrome
- **Manifest:** Manifest V3
- **الواجهة:** HTML5 وCSS3 وJavaScript
- **اللغة والتخطيط:** واجهة عربية RTL
- **المعالجة:** توليد وترتيب الجداول وكشف التعارضات داخل المتصفح
- **مصدر البيانات:** صفحات الشعب العامة للجامعة الهاشمية
- **صلاحية الموقع:** `https://hu.edu.jo/*`
- **Backend:** لا يوجد

---

## 🆕 الإصدار الحالي

**الإصدار الحالي:** `v1.4.0`

### أبرز التحديثات

- 🌙 ثيم داكن محدث
- 📅 تقويم أسبوعي خماسي أوضح
- 🔎 تحسينات Search V2 وتحديد المادة المقصودة
- 💾 حفظ تلقائي لمسودة المواد
- ➕ تحسين إدارة المواد أثناء التخطيط
- ☕ فلترة تفاعلية لفترات Break
- 🖨️ تقارير طباعة أكثر وضوحاً
- ♿ تحسينات إمكانية الوصول والتفاعل
- 🌐 اتصال أكثر موثوقية ببيانات الجامعة العامة

[عرض HU Smart Schedule v1.4.0 على GitHub Releases](https://github.com/md3ja/HU-Smart-Schedule-Extension/releases/tag/v1.4.0)

---

## 📜 الترخيص وحقوق الاستخدام

© 2026 HU Smart Schedule. **جميع الحقوق محفوظة.**

هذا المشروع مملوك وليس مفتوح المصدر. يُحظر نسخ أو إعادة توزيع أو تعديل أو إعادة استخدام الشيفرة المصدرية أو أصول المشروع تجارياً دون تصريح.

---

<p align="center">
  <sub>Built for Hashemite University students — صُممت لطلبة الجامعة الهاشمية</sub>
</p>
