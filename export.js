    const DAY_ORDER = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

    function minutesToTime(m) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    }

    function formatDurationArabic(minutes) {
      if (!minutes || minutes <= 0) return "لا يوجد فراغ";
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours === 0) return `${mins} دقيقة`;
      if (mins === 0) {
        if (hours === 1) return "ساعة واحدة";
        if (hours === 2) return "ساعتان";
        if (hours >= 3 && hours <= 10) return `${hours} ساعات`;
        return `${hours} ساعة`;
      }
      const hText = hours === 1 ? "ساعة" : (hours === 2 ? "ساعتان" : (hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`));
      return `${hText} و${mins} دقيقة (${minutes} د)`;
    }

    function escapeHtml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderTimetableTable(sections, colors) {
      if (!sections || !sections.length) return '';
      const meetings = sections.flatMap(sec => sec.meetings.map(m => ({ ...m, section: sec })));
      if (!meetings.length) return '';

      const minStart = Math.floor(Math.min(...meetings.map(m => m.start)) / 60) * 60;
      const maxEnd = Math.ceil(Math.max(...meetings.map(m => m.end)) / 60) * 60;

      // A fixed time scale keeps half-hour starts and multi-hour meetings exact.
      // Full text is repeated in the details table when a short box cannot fit it.
      const scale = Math.min(1.5, 560 / (maxEnd - minStart));
      let html = '<div class="timetable-wrap"><div class="print-week-header"><span>الوقت</span>';
      html += DAY_ORDER.map(day => `<span>${day}</span>`).join('');
      html += `</div><div class="print-week-body" style="height:${(maxEnd - minStart) * scale}px;--hour-height:${60 * scale}px"><div class="print-time-axis">`;
      for (let time = minStart; time < maxEnd; time += 60) {
        html += `<span style="top:${(time - minStart) * scale}px"><bdi dir="ltr">${minutesToTime(time)}</bdi></span>`;
      }
      html += '</div>';
      for (const day of DAY_ORDER) {
        html += `<div class="print-week-day" data-day="${day}">`;
        for (const m of meetings.filter(m => m.day === day)) {
            const sec = m.section;
            const colorIdx = colors ? colors.get(sec.courseKey || sec.courseNumber || sec.courseLabel) ?? 0 : 0;
            html += `<div class="timetable-meeting ${m.remote ? 'remote' : ''} course-color-${colorIdx}" data-start="${m.start}" data-end="${m.end}" style="top:${(m.start - minStart) * scale}px;height:${(m.end - m.start) * scale}px;border-right-color:var(--border);background:var(--bg);color:var(--text);">
              <b>${escapeHtml(sec.courseLabel)} (شعبة ${escapeHtml(sec.section)})</b>
              <span>${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</span>
              <div style="font-size:9px;font-weight:700;"><bdi dir="ltr">${minutesToTime(m.start)}–${minutesToTime(m.end)}</bdi>${m.remote ? ' · عن بعد' : ''}</div>
            </div>`;
        }
        html += '</div>';
      }
      html += '</div></div>';
      return html;
    }

    async function getPayload() {
      if (window.chrome?.storage?.local) {
        const obj = await chrome.storage.local.get('huSmartScheduleExport');
        if (obj?.huSmartScheduleExport) return obj.huSmartScheduleExport;
      }
      const raw = localStorage.getItem('huSmartScheduleExport');
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
      return null;
    }

    async function init() {
      const payload = await getPayload();
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('type') || payload?.type || 'full';
      const singleIndex = Number(params.get('index') ?? payload?.scheduleIndex ?? 0);

      if (!payload) {
        document.getElementById('reportContent').innerHTML = `
          <div style="padding:30px;background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;color:#c53030;">
            <b>تنبيه:</b> لم يتم العثور على بيانات للتصدير. يرجى فتح الامتداد والضغط على زر "اجلب الشعب وابنِ الجداول" ثم التصدير مجدداً.
          </div>`;
        return;
      }

      document.getElementById('metaTerm').textContent = `${payload.year || '2026'} / ${payload.semester || 'الأول'}`;
      document.getElementById('metaDate').textContent = new Date(payload.timestamp || Date.now()).toLocaleString('ar-JO');

      const modeLabels = {
        full: 'التقرير الأكاديمي الشامل',
        schedules: 'تقرير الجداول المقترحة',
        single: `الجدول المقترح رقم ${singleIndex + 1}`,
        sections: 'دليل جميع الشعب والتواقيت المتاحة',
        conflicts: 'دليل الشعب المتعارضة'
      };
      document.getElementById('metaType').textContent = modeLabels[mode] || mode;
      document.title = `${modeLabels[mode] || 'تقرير'} — الجامعة الهاشمية`;

      let contentHtml = '';

      // 1. Proposed Schedules
      if (['full', 'schedules', 'single'].includes(mode)) {
        const schedules = payload.schedules || [];
        const toShow = mode === 'single' ? [schedules[singleIndex]].filter(Boolean) : schedules;

        contentHtml += `<section class="report-section">
          <h2 class="section-heading">
            <span>📅 ${mode === 'single' ? `اقتراح الجدول رقم ${singleIndex + 1}` : `أفضل الجداول المقترحة (${toShow.length})`}</span>
            ${toShow.length ? '<span class="badge badge-blue">بدون أي تعارض</span>' : ''}
          </h2>`;

        if (!toShow.length) {
          contentHtml += `<p style="color:#718096;">لا توجد جداول مقترحة متوفرة حالياً للعرض.</p>`;
        } else {
          const allCourseKeys = [...new Set(toShow.flatMap(s => (s.sections || []).map(sec => sec.courseKey || sec.courseNumber || sec.courseLabel)))].sort();
          const colors = new Map(allCourseKeys.map((k, i) => [k, i % 6]));

          toShow.forEach((sched, idx) => {
            const num = mode === 'single' ? singleIndex + 1 : idx + 1;
            const metrics = sched.metrics || {};
            const gapsByDay = metrics.gapsByDay instanceof Map ? metrics.gapsByDay : new Map(Object.entries(metrics.gapsByDay || {}));

            contentHtml += `<div class="schedule-card-print ${idx > 0 && mode !== 'single' ? 'page-break' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h3 style="margin:0;font-size:16px;color:#1e3a63;">اقتراح ${num}</h3>
                <div class="schedule-meta-bar">
                  <span class="badge badge-blue">${metrics.days ?? 0} أيام دوام</span>
                  <span class="badge">أول محاضرة: <bdi dir="ltr">${minutesToTime(metrics.earliest ?? 0)}</bdi></span>
                  <span class="badge">آخر محاضرة: <bdi dir="ltr">${minutesToTime(metrics.latest ?? 0)}</bdi></span>
                  <span class="badge badge-warn">إجمالي الفراغات: ${formatDurationArabic(metrics.gap ?? 0)}</span>
                </div>
              </div>

              <div class="daily-breaks-list">
                <span style="font-weight:700;">فراغات الأيام:</span>
                ${DAY_ORDER.map(d => {
                  const m = gapsByDay.get(d) ?? 0;
                  const dayMeetings = (sched.sections || []).flatMap(sec => sec.meetings || []).filter(meeting => meeting.day === d);
                  const label = !dayMeetings.length ? 'عطلة' : dayMeetings.every(meeting => meeting.remote) ? 'عن بعد فقط' : m > 0 ? m + ' د' : 'متواصل';
                  return `<span class="break-pill ${m > 0 ? 'warn' : ''}">${d}: ${label}</span>`;
                }).join(' ')}
              </div>

              ${renderTimetableTable(sched.sections, colors)}

              <table class="data-table">
                <thead>
                  <tr>
                    <th>المادة</th>
                    <th>رقم المادة</th>
                    <th>الشعبة</th>
                    <th>المدرس</th>
                    <th>أيام وأوقات المحاضرة</th>
                    <th>نوع الدوام</th>
                  </tr>
                </thead>
                <tbody>
                  ${(sched.sections || []).map(sec => {
                    const isRemote = sec.meetings?.length && sec.meetings.every(m => m.remote);
                    const mixed = !isRemote && sec.meetings?.some(m => m.remote);
                    const meets = sec.meetings?.map(m => `${m.day} ${minutesToTime(m.start)}–${minutesToTime(m.end)}${m.remote ? ' (عن بعد)' : ''}`).join(' | ') || 'موعد غير منشور';
                    return `<tr>
                      <td><b>${escapeHtml(sec.courseLabel)}</b></td>
                      <td><bdi dir="ltr">${escapeHtml(sec.courseNumber || '—')}</bdi></td>
                      <td><b>شعبة ${escapeHtml(sec.section)}</b></td>
                      <td>${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td><bdi dir="ltr">${escapeHtml(meets)}</bdi></td>
                      <td><span class="badge ${isRemote ? 'badge-remote' : 'badge-green'}">${mixed ? 'وجاهي وعن بعد' : isRemote ? 'عن بعد 🌐' : 'وجاهي 🏫'}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
          });
        }
        contentHtml += `</section>`;
      }

      // 2. Conflicting Sections
      if (['full', 'conflicts'].includes(mode)) {
        const conflicts = payload.conflicts || { total: 0, groups: [] };
        contentHtml += `<section class="report-section ${mode === 'full' ? 'page-break' : ''}">
          <h2 class="section-heading">
            <span>⚠️ دليل الشعب المتعارضة (${conflicts.total || 0} تعارض)</span>
            <span class="badge badge-warn">تساعدك في تجنب تعارضات التسجيل</span>
          </h2>`;

        if (conflicts.unknown) contentHtml += `<p class="badge badge-warn">${escapeHtml(conflicts.unknown)} شعبة ذات موعد غير منشور أو غير مكتمل؛ لا يمكن تأكيد خلوها من التعارضات.</p>`;
        if (conflicts.outsideWeek) contentHtml += `<p class="badge badge-warn">${escapeHtml(conflicts.outsideWeek)} شعبة خارج أسبوع الدوام المحدد، مستبعدة من الاقتراحات.</p>`;
        if (!conflicts.groups || !conflicts.groups.length) {
          contentHtml += `<p style="color:#2b6cb0;background:#ebf8ff;padding:12px;border-radius:6px;">لا توجد تعارضات بين الشعب المقروءة ضمن هذا الأسبوع.</p>`;
        } else {
          conflicts.groups.forEach(group => {
            contentHtml += `<div style="margin-bottom:16px;">
              <h4 style="margin:8px 0;color:#2c5282;">${escapeHtml(group.first.label)} ↔ ${escapeHtml(group.second.label)} (${group.pairs.length} تعارض)</h4>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>المادة الأولى والشعبة</th>
                    <th>المدرس</th>
                    <th>المادة الثانية والشعبة</th>
                    <th>المدرس</th>
                    <th>أوقات التداخل</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.pairs.map(pair => {
                    const overlaps = (pair.overlaps || []).map(o => `${o.day} ${minutesToTime(o.start)}–${minutesToTime(o.end)}`).join('، ');
                    return `<tr>
                      <td><b>${escapeHtml(group.first.label)}</b> — شعبة ${escapeHtml(pair.first.section)}</td>
                      <td>${escapeHtml((pair.first.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td><b>${escapeHtml(group.second.label)}</b> — شعبة ${escapeHtml(pair.second.section)}</td>
                      <td>${escapeHtml((pair.second.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td><span class="badge badge-warn"><bdi dir="ltr">${escapeHtml(overlaps)}</bdi></span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
          });
        }
        contentHtml += `</section>`;
      }

      // 3. Available Sections Catalog
      if (['full', 'sections'].includes(mode)) {
        const allSections = payload.allSections || [];
        contentHtml += `<section class="report-section ${mode === 'full' ? 'page-break' : ''}">
          <h2 class="section-heading">
            <span>📚 دليل كل الشعب والتواقيت المتاحة</span>
            <span class="badge badge-blue">مستخرجة من جريدة المواد الرسمية</span>
          </h2>`;

        if (!allSections.length) {
          contentHtml += `<p style="color:#718096;">لا توجد شعب متوفرة حالياً للعرض.</p>`;
        } else {
          allSections.forEach(item => {
            const courseTitle = item.label || item.query || 'مادة';
            const sections = item.sections || [];
            contentHtml += `<div style="margin-bottom:20px;">
              <h3 style="margin:12px 0 6px;color:#1e3a63;font-size:15px;">${escapeHtml(courseTitle)} <span class="badge">${sections.length} شعبة</span></h3>
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:70px;">الشعبة</th>
                    <th style="width:100px;">رقم المادة</th>
                    <th style="width:160px;">المدرس</th>
                    <th>المواعيد الرسمية</th>
                    <th style="width:140px;">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${sections.map(sec => {
                    const meets = (sec.meetings || []).map(m => `${m.day} ${minutesToTime(m.start)}–${minutesToTime(m.end)}${m.remote ? ' (عن بعد)' : ''}`).join(' | ') || (sec.statusLabel || 'موعد غير منشور');
                    return `<tr>
                      <td><b>شعبة ${escapeHtml(sec.section)}</b></td>
                      <td><bdi dir="ltr">${escapeHtml(sec.courseNumber || '—')}</bdi></td>
                      <td>${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td>${escapeHtml(meets)}</td>
                      <td>${sec.complete ? '<span class="badge badge-green">مكتملة ومتاحة</span>' : `<span class="badge badge-warn">${escapeHtml(sec.statusLabel || 'موعد غير منشور')}</span>`}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
          });
        }
        contentHtml += `</section>`;
      }

      document.getElementById('reportContent').innerHTML = contentHtml;
    }

    document.getElementById('printReport').addEventListener('click', () => window.print());
    document.getElementById('closeReport').addEventListener('click', () => window.close());
    window.addEventListener('DOMContentLoaded', init);

