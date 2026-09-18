# HU Smart Schedule v1.4.0 — Dark Theme & Workflow Improvements | ثيم داكن وتحسينات على سير العمل

**Release Version | رقم الإصدار:** `v1.4.0`  
**Date | التاريخ:** September 2026 / أيلول 2026  
**Target Platform | المنصة:** Google Chrome (Manifest V3)

---

## What's New | الجديد في هذا الإصدار

- **Refreshed Dark Theme | ثيم داكن محدث:** A new dark visual system with clearer contrast and improved readability across the extension — واجهة داكنة جديدة بتباين أوضح وقراءة أسهل في مختلف أجزاء الإضافة.
- **Improved Popup Layout | تحسين تخطيط نافذة الإضافة:** Better use of the available popup space with a more stable, readable layout — استغلال أفضل لمساحة نافذة الإضافة مع تخطيط أكثر ثباتاً ووضوحاً.
- **Clearer 5-Day Weekly Calendar | تقويم أسبوعي خماسي أوضح:** Sunday–Thursday columns, time axis, Break indicators, off-days, and remote-course badges are easier to review at a glance — عرض أوضح لأيام الأحد إلى الخميس ومحور الوقت والاستراحات وأيام العطلة والمحاضرات عن بُعد.
- **Search V2 Improvements | تحسينات البحث الذكي (Search V2):** Expanded support for course aliases and common student shorthand, with course disambiguation when a search matches more than one subject — دعم أوسع لاختصارات وأسماء المواد الشائعة مع إمكانية تحديد المادة المقصودة عند وجود أكثر من نتيجة مطابقة.
- **Persistent Course Draft | حفظ تلقائي لمسودة المواد:** Entered courses and relevant preferences are restored locally when returning to the extension — حفظ المواد المدخلة والتفضيلات ذات الصلة محلياً لاستكمال التخطيط دون فقدانها.
- **Improved Course Management | تحسين إدارة المواد:** Add or remove courses during an active planning session without restarting the workflow — إضافة أو حذف المواد أثناء التخطيط دون الحاجة للبدء من جديد.
- **Dynamic Break Filtering | فلترة تفاعلية لفترات الاستراحة:** Choose preferred Break windows and instantly filter matching schedule proposals using the available matching modes — اختيار فترات الاستراحة المفضلة وفلترة الجداول المطابقة مباشرة باستخدام أوضاع المطابقة المتاحة.
- **Sections Panel Improvements | تحسين لوحة الشعب:** “كل الشعب والتواقيت” opens by default and preserves the user's expand/collapse state during updates — تفتح لوحة “كل الشعب والتواقيت” افتراضياً وتحافظ على حالة الطي والتوسيع أثناء التحديثات.
- **Clearer Conflict Review | مراجعة أوضح للتعارضات:** Improved presentation of overlapping sections and their conflicting times — عرض أوضح للشعب المتعارضة والأوقات المتداخلة بينها.
- **Printable Schedule Reports | تقارير طباعة محسنة:** Clean white, low-ink A4 reports with schedule summaries, weekly timetables, and structured course details — تقارير بيضاء وموفرة للحبر بحجم A4 تتضمن ملخص الجدول والتقويم الأسبوعي وتفاصيل المواد والشعب.
- **Accessibility Improvements | تحسينات إمكانية الوصول:** Improved semantic controls and keyboard-friendly interaction in key expandable sections — تحسين عناصر التحكم والتنقل بلوحة المفاتيح في الأقسام القابلة للطي والتوسيع.
- **More Reliable HU Data Requests | اتصال أكثر موثوقية ببيانات الجامعة:** Course searches now use the canonical Hashemite University HTTPS endpoints for more reliable public section retrieval — استخدام روابط HTTPS الرسمية لجريدة المواد العامة لتحسين موثوقية جلب الشعب.

---

## Fixes | الإصلاحات

- **Popup Layout Stability | ثبات تخطيط النافذة:** Reduced layout shifting and improved consistency while moving between sections and results — تقليل اهتزاز وتغير التخطيط أثناء التنقل بين الأقسام والنتائج.
- **Calendar Overflow | تحسين عرض التقويم:** Adjusted timetable sizing so all five weekdays fit cleanly without unnecessary horizontal scrolling — ضبط أبعاد التقويم لعرض أيام الأسبوع الخمسة دون تمرير عرضي غير ضروري.
- **Course Search Reliability | تحسين موثوقية البحث:** Updated HU course-search requests to the correct canonical HTTPS endpoints, preventing redirect and CORS-related failures — تحديث طلبات البحث لاستخدام روابط HTTPS الصحيحة وتجنب مشاكل إعادة التوجيه وCORS.
- **Section State Retention | حفظ حالة لوحة الشعب:** Expanding or collapsing the sections panel is no longer reset when schedules are recalculated or courses are removed — الحفاظ على حالة فتح أو طي لوحة الشعب عند إعادة حساب الجداول أو حذف مادة.
- **Cleaner Remote HTML Handling | معالجة أنظف لمحتوى الجامعة:** Improved sanitization of fetched public HTML to avoid unnecessary remote-resource warnings during parsing — تحسين تنقية محتوى HTML المجلوب من موقع الجامعة لتقليل تحذيرات الموارد الخارجية غير الضرورية.
