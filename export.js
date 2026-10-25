    const DAY_ORDER = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
    const VALID_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "السبت"];
    const COURSE_PALETTE_SIZE = 12;

    function getCourseColorIndex(index) {
      if (typeof index !== 'number' || isNaN(index) || index < 0) return 0;
      if (index < COURSE_PALETTE_SIZE) return index;
      return (index * 7 + 5) % COURSE_PALETTE_SIZE;
    }

    function minutesToTime(m) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    }

    function formatTimeRange(start, end) {
      return `${minutesToTime(start)}–${minutesToTime(end)}`;
    }

    function formatTimeRangeHtml(start, end) {
      return `<bdi dir="ltr">${formatTimeRange(start, end)}</bdi>`;
    }

    function formatReportDate(dateInput) {
      const d = dateInput instanceof Date
        ? dateInput
        : new Date(dateInput || Date.now());

      if (Number.isNaN(d.getTime())) {
        return formatReportDate(new Date());
      }

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();

      return `${day}/${month}/${year}`;
    }

    // Display-only helpers for constrained timetable blocks (never mutate stored data).
    const MEETING_HEIGHT_STANDARD = 80;
    const MEETING_HEIGHT_MEDIUM = 60;
    const MEDIUM_FULL_INSTRUCTOR_MAX = 22;

    function formatCompactInstructorName(name) {
      const text = String(name || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/[،,؛;]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text || text === 'غير معلن') return text;
      const prefixRe = /^(أ\.\s?د\.?|ا\.\s?د\.?|د\.?|أ\.|م\.|دكتور|الدكتور|الأستاذ|المهندس)$/;
      const glued = /^(أ\.د\.|ا\.د\.|د\.|أ\.|م\.)(.+)$/;
      let tokens = text.split(' ');
      if (!prefixRe.test(tokens[0])) {
        const m = tokens[0].match(glued);
        if (m) tokens = [m[1], m[2], ...tokens.slice(1)];
      }
      let prefix = '';
      if (tokens.length >= 2 && (tokens[0] === 'أ.' || tokens[0] === 'ا.') && (tokens[1] === 'د.' || tokens[1] === 'د')) {
        prefix = tokens[0] + ' ' + tokens[1];
        tokens.splice(0, 2);
      } else if (tokens.length > 1 && prefixRe.test(tokens[0])) {
        prefix = tokens.shift();
      }

      let firstCount = 1;
      if (tokens.length >= 2) {
        if (tokens[0] === 'عبد' || tokens[0] === 'أبو' || tokens[0] === 'ابو' || tokens[1] === 'الدين') {
          firstCount = 2;
        }
      }

      let lastCount = 1;
      if (tokens.length >= firstCount + 2) {
        const pen = tokens[tokens.length - 2];
        const ult = tokens[tokens.length - 1];
        if (pen === 'عبد' || pen === 'أبو' || pen === 'ابو' || pen === 'آل' || pen === 'ابن' || pen === 'بن' || pen === 'بني' || ult === 'الدين') {
          lastCount = 2;
        }
      }

      const middleCount = tokens.length - firstCount - lastCount;
      if (middleCount <= 0 || tokens.join(' ').length <= 14) return text;

      const first = tokens.slice(0, firstCount).join(' ');
      const last = tokens.slice(tokens.length - lastCount).join(' ');
      return (prefix ? prefix + ' ' : '') + first + ' ' + last;
    }

    function meetingTier(height) {
      return height >= MEETING_HEIGHT_STANDARD ? 'standard' : height >= MEETING_HEIGHT_MEDIUM ? 'medium' : 'compact';
    }

    function blockInstructorText(fullName, tier) {
      if (!fullName) return 'غير معلن';
      if ((tier === 'standard' || tier === 'medium') && fullName.length <= MEDIUM_FULL_INSTRUCTOR_MAX) return fullName;
      return formatCompactInstructorName(fullName);
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

    function cleanText(s) {
      return (s || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
    }

    function formatMeetingLocation(meeting) {
      if (!meeting) return 'لم يحدد';
      if (meeting.isUnscheduled) return 'لم يحدد';

      const isRemote = Boolean(meeting.remote || meeting.attendanceMode === 'remote' || meeting.displayMode === 'remote'
        || meeting.locationStatus === 'remote_platform' || meeting.locationStatus === 'remote_no_platform');
      if (isRemote) {
        if (meeting.onlinePlatform) {
          return `منصة ${cleanText(meeting.onlinePlatform)}`;
        }
        return 'عن بعد';
      }

      const b = cleanText(meeting.building || '');
      const r = cleanText(meeting.room || '');

      if (b && r) {
        return `${b} — ${r}`;
      }
      if (b) {
        return b;
      }
      if (r) {
        return r;
      }
      if (meeting.locationStatus === 'unrecognized' && meeting.rawLocation) {
        const raw = cleanText(meeting.rawLocation);
        if (raw) return raw;
      }
      return 'لم يحدد';
    }

    function formatSectionLocationText(sec) {
      if (!sec || !sec.meetings || !sec.meetings.length || sec.isUnscheduled) {
        return 'لم يحدد';
      }

      const locGroups = new Map();
      for (const m of sec.meetings) {
        const locStr = formatMeetingLocation(m);
        if (!locGroups.has(locStr)) locGroups.set(locStr, []);
        if (m.day && !locGroups.get(locStr).includes(m.day)) {
          locGroups.get(locStr).push(m.day);
        }
      }

      if (locGroups.size === 1) {
        return [...locGroups.keys()][0];
      }

      return [...locGroups.entries()].map(([locStr, days]) => {
        return days.length ? `${days.join('، ')}: ${locStr}` : locStr;
      }).join(' | ');
    }

    function formatSectionLocationsHtml(sec) {
      if (!sec || !sec.meetings || !sec.meetings.length || sec.isUnscheduled) {
        return `<span class="section-location-item">لم يحدد</span>`;
      }

      const locGroups = new Map();
      for (const m of sec.meetings) {
        const locStr = formatMeetingLocation(m);
        if (!locGroups.has(locStr)) locGroups.set(locStr, []);
        if (m.day && !locGroups.get(locStr).includes(m.day)) {
          locGroups.get(locStr).push(m.day);
        }
      }

      if (locGroups.size === 1) {
        const [locStr] = locGroups.keys();
        return `<span class="section-location-item">${escapeHtml(locStr)}</span>`;
      }

      return [...locGroups.entries()].map(([locStr, days]) => {
        const label = days.length ? `${days.join('، ')}: ${locStr}` : locStr;
        return `<span class="section-location-item">${escapeHtml(label)}</span>`;
      }).join(' <span class="section-location-sep">|</span> ');
    }

    function getRoomFriendlyMeaning(room) {
      if (!room || typeof room !== 'string') return '';
      const clean = cleanText(room);
      if (/^ص\.ك\.ر/i.test(clean)) return 'الرياضة';
      if (/^م\s*[\.0٠]?\s*تك/i.test(clean)) return 'مختبر IT';
      if (/^صيدلة/i.test(clean)) return 'الصيدلة';
      if (/^ل\.ز|^مركز\s+اللغات/i.test(clean)) return 'مركز اللغات';
      if (/^ح\.ب/i.test(clean)) return 'الحسين الباني';
      if (/^ح\.ر/i.test(clean)) return 'الحارث الرابع';
      if (/^م\.\s*ش/i.test(clean)) return 'الشرقي / ابن رشد';
      if (/^م\.\s*غ/i.test(clean)) return 'الغربي / ابن خلدون';
      if (/^(?:ع\s+ط|ع\.ط)/i.test(clean)) return 'العلوم الطبية المساندة';
      if (/^(?:ت\s+م|ت\.م)/i.test(clean)) return 'التمريض';
      if (/^تك\b|^تك\s*\d/i.test(clean)) return 'IT';
      if (/^هـ/i.test(clean)) return 'الهندسة';
      if (/^ق\s*\d/i.test(clean)) return 'الاقتصاد';
      if (/^ف\s*\d/i.test(clean)) return 'الفيزياء';
      if (/^ك\s*\d/i.test(clean)) return 'الكيمياء';
      if (/^ح\s*\d/i.test(clean)) return 'الأحياء';
      if (/^ع\s*\d/i.test(clean)) return 'الموارد الطبيعية والبيئية';
      if (/^ض\s*\d/i.test(clean)) return 'الرياضة';
      if (/^ر\s*\d/i.test(clean)) return 'الرياضيات';
      return '';
    }

    function formatFriendlyRoomCode(room) {
      if (!room || typeof room !== 'string') return '';
      const clean = cleanText(room);
      if (!clean) return '';

      let m;
      // 1. مختبر IT: م.تك(105), م.تك 105, م.تك105, م تك (105)
      if ((m = clean.match(/^م\s*[\.0٠]?\s*تك(?:\s*\(?|\(?)([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `مختبر IT ${m[1]}`;
      }
      if (/^م\s*[\.0٠]?\s*تك$/iu.test(clean)) return 'مختبر IT';

      // 2. IT: تك 102, تك102
      if ((m = clean.match(/^تك\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `IT ${m[1]}`;
      }
      if (/^تك$/iu.test(clean)) return 'IT';

      // 3. الشرقي: م.ش 101, م.ش101
      if ((m = clean.match(/^م\s*[\.0٠]?\s*ش\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الشرقي ${m[1]}`;
      }
      if (/^م\s*[\.0٠]?\s*ش$/iu.test(clean)) return 'الشرقي';

      // 4. الغربي: م.غ209, م.غ 209
      if ((m = clean.match(/^م\s*[\.0٠]?\s*غ\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الغربي ${m[1]}`;
      }
      if (/^م\s*[\.0٠]?\s*غ$/iu.test(clean)) return 'الغربي';

      // 5. الحارث: ح.ر 205, ح.ر205
      if ((m = clean.match(/^ح\s*[\.0٠]?\s*ر\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الحارث ${m[1]}`;
      }
      if (/^ح\s*[\.0٠]?\s*ر$/iu.test(clean)) return 'الحارث';

      // 6. الباني: ح.ب 310, ح.ب310
      if ((m = clean.match(/^ح\s*[\.0٠]?\s*ب\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الباني ${m[1]}`;
      }
      if (/^ح\s*[\.0٠]?\s*ب$/iu.test(clean)) return 'الباني';

      // 7. الصيدلة: صيدلة 223, صيدله 223
      if ((m = clean.match(/^صيدل[ةه]\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الصيدلة ${m[1]}`;
      }
      if (/^صيدل[ةه]$/iu.test(clean)) return 'الصيدلة';

      // 8. اللغات: ل.ز 102, ل.ز102, مركز اللغات 102
      if ((m = clean.match(/^(?:ل\s*[\.0٠]?\s*ز|مركز\s+اللغات)\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `اللغات ${m[1]}`;
      }
      if (/^(?:ل\s*[\.0٠]?\s*ز|مركز\s+اللغات)$/iu.test(clean)) return 'اللغات';

      // 9. طبية مساندة: ع ط 104, ع.ط 104
      if ((m = clean.match(/^ع\s*[\.0٠]?\s*ط\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `طبية مساندة ${m[1]}`;
      }
      if (/^ع\s*[\.0٠]?\s*ط$/iu.test(clean)) return 'طبية مساندة';

      // 10. التمريض: ت م 103, ت.م 103
      if ((m = clean.match(/^ت\s*[\.0٠]?\s*م\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `التمريض ${m[1]}`;
      }
      if (/^ت\s*[\.0٠]?\s*م$/iu.test(clean)) return 'التمريض';

      // 11. الهندسة: هـ 101, هـ2002, ه 101
      if ((m = clean.match(/^(?:هـ|ه)\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الهندسة ${m[1]}`;
      }
      if (/^هـ$/iu.test(clean)) return 'الهندسة';

      // 12. الموارد: ع 204, ع204
      if ((m = clean.match(/^ع\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الموارد ${m[1]}`;
      }

      // 13. الرياضة: ص.ك.ر 101, ض 101
      if ((m = clean.match(/^(?:ص\s*[\.0٠]?\s*ك\s*[\.0٠]?\s*ر|ض)\s*\(?([\w\d\u0660-\u0669]+)\)?/iu))) {
        return `الرياضة ${m[1]}`;
      }
      if (/^(?:ص\s*[\.0٠]?\s*ك\s*[\.0٠]?\s*ر|ض)$/iu.test(clean)) return 'الرياضة';

      // 14. الرياضيات: ر 201, ر201
      if ((m = clean.match(/^ر\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الرياضيات ${m[1]}`;
      }

      // 15. الاقتصاد: ق 313, ق313
      if ((m = clean.match(/^ق\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الاقتصاد ${m[1]}`;
      }

      // 16. الفيزياء: ف 101, ف101
      if ((m = clean.match(/^ف\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الفيزياء ${m[1]}`;
      }

      // 17. الكيمياء: ك 202, ك202
      if ((m = clean.match(/^ك\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الكيمياء ${m[1]}`;
      }

      // 18. الأحياء: ح 105, ح105
      if ((m = clean.match(/^ح\s*\(?([\d\u0660-\u0669]+)\)?/iu))) {
        return `الأحياء ${m[1]}`;
      }

      return clean;
    }

    function formatBlockLocation(m) {
      if (!m) return '';
      if (m.locationStatus === 'tbd' || m.locationStatus === 'unrecognized') return '';
      const isRemote = Boolean(m.remote || m.attendanceMode === 'remote' || m.displayMode === 'remote'
        || m.locationStatus === 'remote_platform' || m.locationStatus === 'remote_no_platform');
      if (isRemote) {
        if (m.onlinePlatform) {
          if (/teams/i.test(m.onlinePlatform)) return 'Teams';
          if (/moodle/i.test(m.onlinePlatform)) return 'Moodle';
          return cleanText(m.onlinePlatform).split(/[,،]/)[0].trim();
        }
        return '';
      }
      if (m.locationStatus === 'assigned' || m.locationStatus === 'room_only') {
        if (m.room) return formatFriendlyRoomCode(m.room);
      }
      return '';
    }

    function formatMeetingTooltipLocation(meeting) {
      if (!meeting) return 'لم يحدد';
      if (meeting.isUnscheduled) return 'لم يحدد';

      const isRemote = Boolean(meeting.remote || meeting.attendanceMode === 'remote' || meeting.displayMode === 'remote'
        || meeting.locationStatus === 'remote_platform' || meeting.locationStatus === 'remote_no_platform');
      if (isRemote) {
        if (meeting.onlinePlatform) {
          return `منصة ${cleanText(meeting.onlinePlatform)}`;
        }
        return 'عن بعد';
      }

      const b = cleanText(meeting.building || '');
      const r = cleanText(meeting.room || '');
      const friendly = r ? getRoomFriendlyMeaning(r) : '';

      if (b && r) {
        const isAlreadyMentioned = b.includes(friendly) || (friendly === 'الصيدلة' && b.includes('صيدل'));
        if (friendly && !isAlreadyMentioned) {
          return `${b} (${friendly}) — ${r}`;
        }
        return `${b} — ${r}`;
      }
      if (b) {
        return b;
      }
      if (r) {
        if (friendly) {
          return `${friendly} — ${r}`;
        }
        return r;
      }
      if (meeting.locationStatus === 'unrecognized' && meeting.rawLocation) {
        const raw = cleanText(meeting.rawLocation);
        if (raw) return raw;
      }
      return 'لم يحدد';
    }

    function formatSectionMeetings(sec) {
      if (sec?.isUnscheduled || sec?.timingType === 'unscheduled') return 'بدون موعد مجدول';
      const meetings = sec?.meetings || [];
      if (!meetings.length) return sec?.statusLabel || 'بدون موعد مجدول';

      const hasBlended = sec.deliveryScheme === 'blended' || meetings.some(m => m.displayMode === 'blended');
      const hasRemote = meetings.some(m => m.displayMode === 'remote' || m.remote);
      const isMultiMode = (hasBlended || hasRemote) && meetings.some(m => (m.displayMode === 'campus' || (!m.remote && m.displayMode !== 'blended')));

      const grouped = new Map();

      for (const m of meetings) {
        const mode = m.displayMode || (m.remote ? 'remote' : 'campus');
        const key = `${m.start}-${m.end}-${mode}-${Boolean(m.excepted)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(m.day);
      }

      return [...grouped.entries()].map(([key, days]) => {
        const parts = key.split("-");
        const start = Number(parts[0]);
        const end = Number(parts[1]);
        const mode = parts[2];
        const isExcepted = parts[3] === 'true';

        let modeSuffix = '';
        if (mode === 'blended') {
          modeSuffix = ' (مدمج)';
        } else if (mode === 'remote') {
          modeSuffix = ' (عن بعد)';
        } else if (mode === 'campus' && isMultiMode) {
          modeSuffix = ' (وجاهي)';
        }

        const exNote = isExcepted ? ' (مستثنى من التخطيط باختيار الطالب)' : '';
        return `${days.join("، ")} ${formatTimeRange(start, end)}${modeSuffix}${exNote}`;
      }).join(" | ");
    }

    function formatSectionMeetingsHtml(sec) {
      if (sec?.isUnscheduled || sec?.timingType === 'unscheduled') return escapeHtml('بدون موعد مجدول');
      const meetings = sec?.meetings || [];
      if (!meetings.length) return escapeHtml(sec?.statusLabel || 'بدون موعد مجدول');

      const hasBlended = sec.deliveryScheme === 'blended' || meetings.some(m => m.displayMode === 'blended');
      const hasRemote = meetings.some(m => m.displayMode === 'remote' || m.remote);
      const isMultiMode = (hasBlended || hasRemote) && meetings.some(m => (m.displayMode === 'campus' || (!m.remote && m.displayMode !== 'blended')));

      const grouped = new Map();

      for (const m of meetings) {
        const mode = m.displayMode || (m.remote ? 'remote' : 'campus');
        const key = `${m.start}-${m.end}-${mode}-${Boolean(m.excepted)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(m.day);
      }

      return [...grouped.entries()].map(([key, days]) => {
        const parts = key.split("-");
        const start = Number(parts[0]);
        const end = Number(parts[1]);
        const mode = parts[2];
        const isExcepted = parts[3] === 'true';

        let modeSuffix = '';
        if (mode === 'blended') {
          modeSuffix = ' (مدمج)';
        } else if (mode === 'remote') {
          modeSuffix = ' (عن بعد)';
        } else if (mode === 'campus' && isMultiMode) {
          modeSuffix = ' (وجاهي)';
        }

        const daysEscaped = escapeHtml(days.join("، "));
        const rangeHtml = formatTimeRangeHtml(start, end);
        const suffixEscaped = escapeHtml(modeSuffix);
        const exNote = isExcepted ? ' <span class="exception-note">(مستثنى من التخطيط باختيار الطالب)</span>' : '';

        return `${daysEscaped} ${rangeHtml}${suffixEscaped}${exNote}`;
      }).join(" | ");
    }

    function describeExportExceptionHtml(ex) {
      const parts = [];
      if (ex.types?.includes('daysOff')) {
        const days = ex.days || [];
        const dayPhrase = days.length === 1 ? 'يوم ' + days[0]
          : days.length === 2 ? 'يومي ' + days.join(' و')
          : 'أيام ' + days.join('، ');
        const pronoun = days.length === 1 ? 'فيه' : days.length === 2 ? 'فيهما' : 'فيها';
        parts.push(`تتضمن دواماً ${escapeHtml(dayPhrase)} رغم اختيارك عدم الدوام ${pronoun}.`);
      }
      if (ex.types?.includes('notAfter')) {
        parts.push(`تنتهي المحاضرة بعد وقت النهاية المختار (<bdi dir="ltr">${minutesToTime(ex.endLimit)}</bdi>).`);
      }
      if (ex.types?.includes('notBefore')) {
        parts.push(`تبدأ المحاضرة قبل وقت البدء المختار (<bdi dir="ltr">${minutesToTime(ex.startLimit)}</bdi>).`);
      }
      return `<b>${escapeHtml(ex.courseName)}</b> — ${parts.join(' ')}`;
    }

    function renderTimetableTable(sections, colors, exceptionIdentities = new Set()) {
      if (!sections || !sections.length) return '';
      const meetings = sections.flatMap(sec => (sec.meetings || []).filter(m => !m.excepted).map(m => ({ ...m, section: sec })));
      if (!meetings.length) return '';

      const minStart = Math.floor(Math.min(...meetings.map(m => m.start)) / 60) * 60;
      const maxEnd = Math.ceil(Math.max(...meetings.map(m => m.end)) / 60) * 60;

      // A fixed time scale keeps half-hour starts and multi-hour meetings exact.
      // Full text is repeated in the details table when a short box cannot fit it.
      const hasSaturday = meetings.some(m => m.day === 'السبت');
      const activeDays = hasSaturday ? [...DAY_ORDER, 'السبت'] : DAY_ORDER;
      const scale = Math.min(1.5, 560 / (maxEnd - minStart));
      let html = `<div class="timetable-wrap ${hasSaturday ? 'has-saturday' : ''}" style="--print-calendar-days:${activeDays.length}"><div class="print-week-header"><span>الوقت</span>`;
      html += activeDays.map(day => `<span>${day}</span>`).join('');
      html += `</div><div class="print-week-body" style="height:${(maxEnd - minStart) * scale}px;--hour-height:${60 * scale}px"><div class="print-time-axis">`;
      for (let time = minStart; time <= maxEnd; time += 30) {
        const isMajor = time % 60 === 0;
        const isFirst = time === minStart;
        const isLast = time === maxEnd;
        const tickClasses = [
          'print-time-tick',
          isMajor ? 'print-tick-major' : 'print-tick-minor',
          isFirst ? 'first-tick' : '',
          isLast ? 'last-tick' : ''
        ].filter(Boolean).join(' ');
        html += `<span class="${tickClasses}" style="top:${(time - minStart) * scale}px"><bdi dir="ltr">${minutesToTime(time)}</bdi></span>`;
      }
      html += '</div>';
      for (const day of activeDays) {
        html += `<div class="print-week-day" data-day="${day}">`;
        for (const m of meetings.filter(m => m.day === day)) {
            const sec = m.section;
            let colorIdx = 0;
            if (typeof sec.colorIndex === 'number') {
              colorIdx = sec.colorIndex;
            } else if (colors) {
              const num = String(sec.courseNumber || '').trim();
              const identity = sec.courseIdentity || (num ? 'number:' + num : null) || sec.courseKey || sec.courseLabel;
              colorIdx = colors.get(identity) ?? (num ? colors.get('number:' + num) : null) ?? colors.get(sec.courseKey || sec.courseLabel) ?? 0;
            }
            const isExMeeting = Boolean(exceptionIdentities && (exceptionIdentities.has(sec.courseIdentity) || exceptionIdentities.has(sec.courseKey) || exceptionIdentities.has(sec.courseLabel)));
            const isBlended = m.displayMode === 'blended';
            const isRemote = !isBlended && (m.displayMode === 'remote' || m.remote);
            const badgeHtml = isBlended
              ? ' <span class="export-badge badge-blended">🔄 مدمج</span>'
              : (isRemote ? ' <span class="export-badge badge-remote">🌐 عن بعد</span>' : '');
            const boxHeight = (m.end - m.start) * scale;
            const tier = meetingTier(boxHeight);
            const fullInstructor = (sec.instructors || []).join('، ');
            const shownInstructor = blockInstructorText(fullInstructor, tier);
            const titleHtml = `<div class="meeting-title">${escapeHtml(sec.courseLabel)}</div>`;
            const sectionHtml = `<span class="meeting-section">شعبة ${escapeHtml(sec.section)}</span>`;
            const timeHtml = `<bdi class="meeting-time" dir="ltr">${formatTimeRange(m.start, m.end)}</bdi>`;
            const instructorHtml = `<div class="meeting-instructor" title="${escapeHtml(fullInstructor || 'غير معلن')}">${escapeHtml(shownInstructor)}</div>`;
            const blockLoc = formatBlockLocation(m);
            const roomHtml = (blockLoc && tier !== 'compact')
              ? `<span class="meeting-room">${escapeHtml(blockLoc)}</span>`
              : '';
            const body = tier === 'compact'
              ? `${titleHtml}
              <div class="meeting-meta">${sectionHtml}${timeHtml}${badgeHtml}</div>
              ${instructorHtml}`
              : `${titleHtml}
              <div class="meeting-meta">${sectionHtml}${roomHtml}${badgeHtml}</div>
              ${instructorHtml}
              <div class="meeting-time-row">${timeHtml}</div>`;
            const locDesc = formatMeetingTooltipLocation(m);
            const locText = (locDesc && locDesc !== 'لم يحدد') ? ` — المكان: ${locDesc}` : '';
            const titleAttr = `${sec.courseLabel} — شعبة ${sec.section}${fullInstructor ? ' — ' + fullInstructor : ''} — ${m.day} ${formatTimeRange(m.start, m.end)}${locText}`;
            html += `<div class="timetable-meeting meeting-${tier} ${isRemote ? 'remote' : ''} ${isBlended ? 'blended' : ''}${isExMeeting ? ' meeting-exception' : ''} course-color-${colorIdx}" data-start="${m.start}" data-end="${m.end}" title="${escapeHtml(titleAttr)}" aria-label="${escapeHtml(titleAttr)}" style="top:${(m.start - minStart) * scale}px;height:${boxHeight}px;">
              ${body}
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
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('huSmartScheduleExport');
        if (raw) {
          try { return JSON.parse(raw); } catch (e) {}
        }
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
      document.getElementById('metaDate').textContent = formatReportDate(payload.timestamp);

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
            <span>📅 ${payload.isManualSchedule ? `جدول مبني يدوياً${payload.excludedCourses?.length ? ' (للمواد المشمولة)' : ''}` : (mode === 'single' ? `اقتراح الجدول رقم ${singleIndex + 1}` : `أفضل الجداول المقترحة (${toShow.length})`)}</span>
            ${toShow.length ? '<span class="badge badge-blue">بدون أي تعارض</span>' : ''}
            ${payload.excludedCourses?.length ? `<span class="badge badge-warn">${escapeHtml(payload.includedCourseCount)} من أصل ${escapeHtml(payload.originalSelectedCourseCount)} مواد</span>` : ''}
          </h2>`;

        if (!toShow.length) {
          contentHtml += `<p style="color:#718096;">لا توجد جداول مقترحة متوفرة حالياً للعرض.</p>`;
        } else {
          let colors = null;
          if (payload.courseColors && typeof payload.courseColors === 'object') {
            colors = new Map(Object.entries(payload.courseColors));
          } else {
            // Backward compatibility fallback using payload.schedules (all proposals, not just toShow)
            const allCourseKeys = [...new Set((payload.schedules || toShow).flatMap(s => (s.sections || []).map(sec => {
              const num = String(sec.courseNumber || '').trim();
              return sec.courseIdentity || (num ? 'number:' + num : (sec.courseKey || sec.courseLabel || ''));
            })))].sort();
            colors = new Map(allCourseKeys.map((k, i) => [k, getCourseColorIndex(i)]));
          }

          toShow.forEach((sched, idx) => {
            const num = mode === 'single' ? singleIndex + 1 : idx + 1;
            const metrics = sched.metrics || {};
            const gapsByDay = (metrics.gapsByDay instanceof Map || (metrics.gapsByDay && typeof metrics.gapsByDay.get === 'function')) ? metrics.gapsByDay : new Map(Object.entries(metrics.gapsByDay || {}));
            const exceptionIdentities = new Set((sched.appliedExceptions || []).map(ex => ex.courseIdentity || ex.courseKey || ex.courseName));

            const schedMeetings = (sched.sections || []).flatMap(sec => (sec.meetings || []).filter(m => !m.excepted)).filter(m => typeof m.start === 'number' && typeof m.end === 'number');
            const earliestMin = (typeof metrics.earliest === 'number' && metrics.earliest > 0)
              ? metrics.earliest
              : (schedMeetings.length ? Math.min(...schedMeetings.map(m => m.start)) : 0);
            const latestMin = (typeof metrics.latest === 'number' && metrics.latest > 0)
              ? metrics.latest
              : (schedMeetings.length ? Math.max(...schedMeetings.map(m => m.end)) : 0);

            const patternBadges = [];
            const dp = metrics.dayPatterns;
            if (dp) {
              if (dp.stt?.hasClasses) {
                patternBadges.push(`<span class="badge">${dp.stt.label}: <bdi dir="ltr">${minutesToTime(dp.stt.earliest)} – ${minutesToTime(dp.stt.latest)}</bdi></span>`);
              }
              if (dp.mw?.hasClasses) {
                patternBadges.push(`<span class="badge">${dp.mw.label}: <bdi dir="ltr">${minutesToTime(dp.mw.earliest)} – ${minutesToTime(dp.mw.latest)}</bdi></span>`);
              }
            }

            const summaryBadges = [
              `<span class="badge badge-blue">${metrics.days ?? 0} أيام دوام</span>`,
              `<span class="badge badge-warn">إجمالي الفراغات: ${formatDurationArabic(metrics.gap ?? 0)}</span>`,
              `<span class="badge">أول محاضرة: <bdi dir="ltr">${minutesToTime(earliestMin)}</bdi></span>`,
              `<span class="badge">آخر محاضرة: <bdi dir="ltr">${minutesToTime(latestMin)}</bdi></span>`
            ];

            contentHtml += `<div class="schedule-card-print ${idx > 0 && mode !== 'single' ? 'page-break' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h3 style="margin:0;font-size:16px;color:#1e3a63;">${payload.isManualSchedule ? `جدول مبني يدوياً${payload.excludedCourses?.length ? ' (للمواد المشمولة)' : ''}` : `اقتراح ${num}`}</h3>
                <div class="schedule-meta-bar">
                  ${summaryBadges.join('\n                  ')}
                  ${patternBadges.join('\n                  ')}
                  ${payload.excludedCourses?.length ? `<span class="badge badge-warn">${escapeHtml(payload.includedCourseCount)} من أصل ${escapeHtml(payload.originalSelectedCourseCount)} مواد</span>` : ''}
                </div>
              </div>

              <div class="daily-breaks-list">
                <span style="font-weight:700;">فراغات الأيام:</span>
                ${(((sched.sections || []).some(sec => (sec.meetings || []).filter(m => !m.excepted).some(m => m.day === 'السبت'))) ? [...DAY_ORDER, 'السبت'] : DAY_ORDER).map(d => {
                  const m = gapsByDay.get(d) ?? 0;
                  const dayMeetings = (sched.sections || []).flatMap(sec => (sec.meetings || []).filter(m => !m.excepted)).filter(meeting => meeting.day === d);
                  const isOff = !dayMeetings.length;
                  const isRemoteOnly = !isOff && dayMeetings.every(meeting => meeting.remote);
                  const hasGap = !isOff && !isRemoteOnly && m > 0;

                  let label = 'متواصل';
                  let statusClass = 'break-pill-solid';

                  if (isOff) {
                    label = 'عطلة';
                    statusClass = 'break-pill-off';
                  } else if (isRemoteOnly) {
                    label = 'عن بعد فقط';
                    statusClass = 'break-pill-remote';
                  } else if (hasGap) {
                    label = `${m} د`;
                    statusClass = 'break-pill-warn warn';
                  }
                  return `<span class="break-pill ${statusClass}">${d}: ${label}</span>`;
                }).join(' ')}
              </div>

              ${payload.excludedCourses?.length ? `
                <div class="print-omitted-bar">
                  📌 <b>${payload.isManualSchedule ? 'المواد المستبعدة من الجدول اليدوي بطلبك:' : 'المواد المستبعدة من هذا التوليد بطلبك:'}</b> ${payload.excludedCourses.map(c => escapeHtml(c.courseLabel)).join('، ')}
                </div>
              ` : ''}

              ${sched.appliedExceptions?.length ? `
                <div class="print-exceptions-bar">
                  <div style="font-weight:700;margin-bottom:2px;">⚠️ استثناء مطبق:</div>
                  ${sched.appliedExceptions.map(ex => `<div style="margin-top:2px;">${describeExportExceptionHtml(ex)}</div>`).join('')}
                </div>
              ` : ''}

              ${sched.appliedMeetingExceptions?.length ? `
                <div class="print-exception-banner">
                  ⚠️ يتضمن هذا الجدول استثناء موعد غير ملزم باختيار الطالب لأغراض التخطيط
                </div>
              ` : ''}

              ${renderTimetableTable(sched.sections, colors, exceptionIdentities)}
              ${(() => {
                const unscheduled = (sched.sections || []).filter(sec => sec.isUnscheduled || (!sec.meetings?.length && sec.timingType === 'unscheduled'));
                if (!unscheduled.length) return '';
                const names = unscheduled.map(s => escapeHtml(s.courseLabel)).join('، ');
                return `<div class="print-unscheduled-bar">📌 مواد بدون موعد مجدول: <b>${names}</b></div>`;
              })()}

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
                    const isUnscheduled = sec.isUnscheduled || sec.timingType === 'unscheduled' || (!sec.meetings?.length && (!sec.deliveryScheme || sec.deliveryScheme === 'unspecified'));
                    const scheme = sec.deliveryScheme || (
                      sec.meetings?.some(m => m.displayMode === 'blended' || m.blended) ? 'blended' :
                      sec.meetings?.length && sec.meetings.every(m => m.remote) ? 'remote' :
                      sec.meetings?.some(m => m.remote) ? 'mixed' : (isUnscheduled ? 'unspecified' : 'campus')
                    );

                    const hasCampus = (sec.meetings || []).some(m => !m.remote && m.attendanceMode !== 'remote');
                    const hasRemote = (sec.meetings || []).some(m => Boolean(m.remote || m.attendanceMode === 'remote'));

                    let badgeHtml = '<span class="badge badge-green">وجاهي 🏫</span>';
                    if (scheme === 'unspecified' || (isUnscheduled && scheme === 'campus')) {
                      badgeHtml = '<span class="badge badge-neutral">غير محدد</span>';
                    } else if (scheme === 'blended') {
                      badgeHtml = (hasCampus && hasRemote)
                        ? '<span class="badge badge-blue">مدمج (وجاهي + عن بعد)</span>'
                        : '<span class="badge badge-blue">مدمج</span>';
                    } else if (scheme === 'remote') {
                      badgeHtml = '<span class="badge badge-remote">عن بعد 🌐</span>';
                    } else if (scheme === 'mixed') {
                      badgeHtml = '<span class="badge badge-remote">وجاهي وعن بعد</span>';
                    }

                    const hasEx = (sched.appliedExceptions || []).some(ex => ex.courseKey === sec.courseKey || ex.courseIdentity === sec.courseIdentity || ex.courseName === sec.courseLabel);
                    if (hasEx) {
                      badgeHtml += ' <span class="badge badge-warn">استثناء مطبق</span>';
                    }
                    if ((sec.meetings || []).some(m => m.excepted)) {
                      badgeHtml += ' <span class="badge badge-warn">موعد مستثنى</span>';
                    }

                    let rowColorIdx = 0;
                    if (typeof sec.colorIndex === 'number') {
                      rowColorIdx = sec.colorIndex;
                    } else if (colors) {
                      const num = String(sec.courseNumber || '').trim();
                      const identity = sec.courseIdentity || (num ? 'number:' + num : null) || sec.courseKey || sec.courseLabel;
                      rowColorIdx = colors.get(identity) ?? (num ? colors.get('number:' + num) : null) ?? colors.get(sec.courseKey || sec.courseLabel) ?? 0;
                    }

                    const meetsHtml = formatSectionMeetingsHtml(sec);
                    const locHtml = `<div class="export-detail-location">المكان: ${formatSectionLocationsHtml(sec)}</div>`;
                    return `<tr>
                      <td class="course-color-${rowColorIdx} course-label-cell"><b>${escapeHtml(sec.courseLabel)}</b>${hasEx ? ' <span class="badge badge-warn">استثناء</span>' : ''}</td>
                      <td><bdi dir="ltr">${escapeHtml(sec.courseNumber || '—')}</bdi></td>
                      <td><b>شعبة ${escapeHtml(sec.section)}</b></td>
                      <td>${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td>${meetsHtml}${locHtml}</td>
                      <td>${badgeHtml}</td>
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
                    const overlapsHtml = (pair.overlaps || []).map(o => `${escapeHtml(o.day)} ${formatTimeRangeHtml(o.start, o.end)}`).join('، ');
                    return `<tr>
                      <td><b>${escapeHtml(group.first.label)}</b> — شعبة ${escapeHtml(pair.first.section)}</td>
                      <td>${escapeHtml((pair.first.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td><b>${escapeHtml(group.second.label)}</b> — شعبة ${escapeHtml(pair.second.section)}</td>
                      <td>${escapeHtml((pair.second.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td><span class="badge badge-warn">${overlapsHtml}</span></td>
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
                    const meetsHtml = formatSectionMeetingsHtml(sec);
                    const locHtml = `<div class="export-detail-location">المكان: ${formatSectionLocationsHtml(sec)}</div>`;
                    return `<tr>
                      <td><b>شعبة ${escapeHtml(sec.section)}</b></td>
                      <td><bdi dir="ltr">${escapeHtml(sec.courseNumber || '—')}</bdi></td>
                      <td>${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</td>
                      <td>${meetsHtml}${locHtml}</td>
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

    let prePrintScrollY = 0;
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeprint', () => {
        prePrintScrollY = typeof window.scrollY === 'number' ? window.scrollY : 0;
      });
      window.addEventListener('afterprint', () => {
        if (typeof prePrintScrollY === 'number') {
          window.scrollTo(0, prePrintScrollY);
        }
      });
    }

    document.getElementById('printReport')?.addEventListener('click', (event) => {
      event?.currentTarget?.blur?.();
      window.print?.();
    });
    document.getElementById('closeReport')?.addEventListener('click', () => window.close?.());
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('DOMContentLoaded', init);
    }

