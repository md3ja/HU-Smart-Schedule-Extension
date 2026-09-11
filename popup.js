
"use strict";

const BASE = "https://hu.edu.jo/unitCenter/";
const URL_BY_NUMBER = BASE + "CourseNumber_a.aspx";
const URL_BY_NAME = BASE + "Course_Name_a.aspx";
// HU's own "حسب اسم المادة" navigation currently redirects to this spelling.
const URL_BY_NAME_LEGACY = BASE + "Corse_Name_a.aspx";
const documentUrls = new WeakMap();

const DAY_ORDER = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"
];

const FULL_DAY_ALIASES = new Map([
  ["السبت", "السبت"],
  ["سبت", "السبت"],
  ["الأحد", "الأحد"],
  ["الاحد", "الأحد"],
  ["احد", "الأحد"],
  ["الاثنين", "الاثنين"],
  ["الإثنين", "الاثنين"],
  ["الاثنـين", "الاثنين"],
  ["اثنين", "الاثنين"],
  ["الثلاثاء", "الثلاثاء"],
  ["ثلاثاء", "الثلاثاء"],
  ["الأربعاء", "الأربعاء"],
  ["الاربعاء", "الأربعاء"],
  ["اربعاء", "الأربعاء"],
  ["الخميس", "الخميس"],
  ["خميس", "الخميس"],
  ["الجمعة", "الجمعة"],
  ["الجمعه", "الجمعة"],
  ["جمعة", "الجمعة"]
]);

const SHORT_DAY_ALIASES = new Map([
  ["س", "السبت"],
  ["ح", "الأحد"],
  ["ن", "الاثنين"],
  ["ث", "الثلاثاء"],
  ["ر", "الأربعاء"],
  ["خ", "الخميس"],
  ["ج", "الجمعة"]
]);

const $ = (id) => document.getElementById(id);

function normalizeArabic(s) {
  return (s || "")
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function arabicDigitsToAscii(s) {
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
    "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"
  };
  return String(s || "").replace(/[٠-٩]/g, d => map[d])
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0));
}

function cleanText(s) {
  return (s || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
}

function parseCourseLine(line) {
  const raw = cleanText(line);
  if (!raw) return null;

  const parts = raw.split("|").map(x => cleanText(x));
  const first = arabicDigitsToAscii(parts[0]);
  const label = parts.slice(1).join(" | ");

  if (/^\d{6,}$/.test(first)) {
    return {
      kind: "number",
      query: first,
      label: label || first,
      original: raw
    };
  }

  return {
    kind: "name",
    query: first,
    label: label || first,
    original: raw
  };
}

function optionTextMatch(optionText, wanted) {
  const a = normalizeArabic(optionText);
  const b = normalizeArabic(wanted);
  return !!a && !!b && a === b;
}

async function fetchDoc(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
    ...options
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} من ${url}`);
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  documentUrls.set(doc, response.url || url);
  return doc;
}

function findForm(doc) {
  return doc.querySelector("form#aspnetForm") || doc.querySelector("form");
}

function formPayload(doc) {
  const form = findForm(doc);
  if (!form) throw new Error("لم أجد نموذج ASP.NET.");

  const params = new URLSearchParams();

  for (const input of form.querySelectorAll("input[name]")) {
    if (input.matches(':disabled')) continue;
    const type = (input.type || "text").toLowerCase();

    if (["hidden", "text", "search", "number"].includes(type)) {
      params.append(input.name, input.value || "");
    } else if (["checkbox", "radio"].includes(type) && input.checked) {
      params.append(input.name, input.value);
    }
  }

  for (const select of form.querySelectorAll("select[name]")) {
    if (!select.matches(':disabled')) {
      for (const option of select.selectedOptions) {
        if (!option.disabled) params.append(select.name, option.value);
      }
    }
  }
  for (const el of form.querySelectorAll('textarea[name]:not(:disabled)')) params.append(el.name, el.value);

  return params;
}

function actionUrl(doc, currentUrl) {
  currentUrl = documentUrls.get(doc) || currentUrl;
  const form = findForm(doc);
  const action = form?.getAttribute("action") || currentUrl;
  const url = new URL(action, currentUrl);
  if (url.origin !== new URL(BASE).origin) throw new Error('وجهة نموذج الجامعة غير متوقعة.');
  return url.href;
}

async function postBack(doc, currentUrl, eventTarget, overrides = {}, eventArgument = "") {
  const body = formPayload(doc);
  body.set("__EVENTTARGET", eventTarget);
  body.set("__EVENTARGUMENT", eventArgument);

  for (const [k, v] of Object.entries(overrides)) {
    body.set(k, v);
  }

  return await fetchDoc(actionUrl(doc, currentUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString()
  });
}

async function submitForm(doc, currentUrl, buttonName, buttonValue, overrides = {}) {
  const body = formPayload(doc);
  body.set("__EVENTTARGET", "");
  body.set("__EVENTARGUMENT", "");
  body.set(buttonName, buttonValue || "بحث");

  for (const [k, v] of Object.entries(overrides)) {
    body.set(k, v);
  }

  return await fetchDoc(actionUrl(doc, currentUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString()
  });
}

function findSelect(doc, suffix) {
  const suffixLower = suffix.toLowerCase();
  const all = [...doc.querySelectorAll("select")];

  return all.find(el =>
    (el.name || "").toLowerCase().endsWith(suffixLower) ||
    (el.id || "").toLowerCase().endsWith(suffixLower)
  ) || all.find(el =>
    (el.name || "").toLowerCase().includes(suffixLower) ||
    (el.id || "").toLowerCase().includes(suffixLower)
  );
}

async function setSelect(doc, currentUrl, suffix, wanted) {
  const select = findSelect(doc, suffix);
  if (!select) throw new Error(`لم أجد القائمة ${suffix}.`);
  if (select.disabled) throw new Error(`القائمة ${suffix} غير مفعلة بعد.`);

  const options = [...select.options];
  const match = options.find(o => o.value === wanted) ||
                options.find(o => optionTextMatch(o.textContent, wanted));

  if (!match) {
    throw new Error(`الخيار "${wanted}" غير موجود في ${suffix}.`);
  }

  if (select.value === match.value) return doc;

  const onchange = select.getAttribute('onchange') || '';
  const event = readPostBack(onchange);
  if (!event) {
    if (/postback|callback/i.test(onchange)) throw new Error(`صيغة postback غير مدعومة في ${suffix}.`);
    // Ordinary selects are successful controls on the subsequent search submit.
    select.value = match.value;
    return doc;
  }

  const updated = await postBack(doc, currentUrl, event.target, {
    [select.name]: match.value
  }, event.argument);
  if (findSelect(updated, suffix)?.value !== match.value) {
    throw new Error(`لم يحتفظ الموقع بالخيار المطلوب في ${suffix}.`);
  }
  return updated;
}

function readPostBack(script) {
  // WebForms emits both direct calls and setTimeout('...') with escaped quotes.
  // Decode only a static string wrapper, never execute page JavaScript.
  const delayed = script.match(/^\s*(?:javascript:\s*)?setTimeout\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*,\s*\d+\s*\)\s*;?\s*$/);
  if (delayed) script = delayed[1].slice(1, -1).replace(/\\(['"\\])/g, '$1');
  const m = script.match(/(?:__doPostBack|WebForm_PostBackOptions)\(\s*(['"])([^'"\\]+)\1\s*,\s*(['"])([^'"\\]*)\3/);
  return m ? {target: m[2], argument: m[4]} : null;
}

async function setYearSemester(doc, currentUrl, year, semester) {
  doc = await setSelect(doc, currentUrl, "l_year", year);
  const selectedYear = findSelect(doc, 'l_year').value;
  doc = await setSelect(doc, currentUrl, "l_sem", semester);
  if (findSelect(doc, 'l_year')?.value !== selectedYear) {
    throw new Error('لم يحتفظ الموقع بالسنة المطلوبة بعد تغيير الفصل.');
  }
  return doc;
}

function findSearchInput(doc) {
  const inputs = [...doc.querySelectorAll(
    'form input:not([type]), form input[type="text"], form input[type="search"], form input[type="number"]'
  )].filter(el => !el.matches(':disabled'));

  if (!inputs.length) throw new Error("لم أجد خانة البحث.");

  function score(input) {
    const key = `${input.name || ""} ${input.id || ""}`.toLowerCase();
    let s = 0;
    if (key.includes("txtcrsname")) s += 200;
    if (key.includes("txtcrs")) s += 150;
    if (key.includes("course") || key.includes("crs")) s += 70;
    if (key.includes("contentplaceholder1")) s += 20;
    return s;
  }

  return inputs.sort((a, b) => score(b) - score(a))[0];
}

function findSearchButton(doc) {
  const buttons = [
    ...doc.querySelectorAll('form input[type="submit"], form input[type="button"], form input[type="image"], form button, form a[href]')
  ];

  for (const btn of buttons) {
    if (btn.matches(':disabled')) continue;
    const value = cleanText(btn.value || btn.textContent || btn.getAttribute('alt'));
    if (value.includes("بحث") || value.toLowerCase().includes("search")) {
      return {
        name: btn.name,
        value: btn.value ?? value,
        event: readPostBack((btn.getAttribute('href') || '') + ' ' + (btn.getAttribute('onclick') || '')),
        type: btn.type
      };
    }
  }

  throw new Error("لم أجد زر البحث.");
}

function tableScore(table) {
  const text = normalizeArabic(table.innerText || table.textContent || "");
  const tokens = [
    "رقم الماده", "اسم الماده", "الشعبه", "الساعات",
    "المدرس", "الموعد", "وقت", "اليوم"
  ];
  return tokens.reduce((sum, t) => sum + (text.includes(normalizeArabic(t)) ? 1 : 0), 0);
}

function findResultTable(doc) {
  const byId = doc.querySelector(
    '#ctl00_ContentPlaceHolder1_GridView1, table[id$="GridView1"]'
  );
  if (byId) return byId;

  const tables = [...doc.querySelectorAll("table")].filter(t => !t.querySelector('table'));
  const scored = tables
    .map(t => ({t, score: tableScore(t), len: (t.innerText || "").length}))
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.len - a.len);

  return scored[0]?.t || null;
}

function uniqueHeaders(headers) {
  const counts = {};
  return headers.map((h, i) => {
    const base = cleanText(h) || `column_${i + 1}`;
    counts[base] = (counts[base] || 0) + 1;
    return counts[base] === 1 ? base : `${base}_${counts[base]}`;
  });
}

function cellText(cell) {
  const copy = cell.cloneNode(true);
  copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  copy.querySelectorAll('div,p,li').forEach(el => el.append('\n'));
  return copy.textContent.split(/\n/).map(cleanText).filter(Boolean).join('\n');
}

function parseResultTable(doc) {
  const table = findResultTable(doc);
  if (!table) return {headers: [], rows: []};
  // Ignore nested layout/pager rows; expand rowspans before mapping columns.
  const trs = [...table.querySelectorAll('tr')].filter(tr => tr.closest('table') === table);
  const matrix = [];
  const pending = [];
  for (const tr of trs) {
    const cells = [...tr.children].filter(c => /^(TD|TH)$/.test(c.tagName));
    if (!cells.length || cells.some(c => c.querySelector('a[href*="Page$"]'))) continue;
    if (cells.length === 1 && cells[0].colSpan > 1) continue;
    const row = [];
    for (let i = 0; i < pending.length; i++) {
      if (pending[i]?.left > 0) {
        row[i] = pending[i].text;
        pending[i].left--;
      }
    }
    let col = 0;
    for (const cell of cells) {
      while (row[col] !== undefined) col++;
      for (let span = 0; span < cell.colSpan; span++) {
        row[col] = cellText(cell);
        if (cell.rowSpan > 1) pending[col] = {text: row[col], left: cell.rowSpan - 1};
        col++;
      }
    }
    matrix.push(row);
  }
  const headerIndex = matrix.findIndex(row => {
    const text = normalizeArabic(row.join(' '));
    return ['رقم المادة', 'اسم المادة', 'الشعبة', 'الساعات'].filter(h => text.includes(normalizeArabic(h))).length >= 2;
  });
  if (headerIndex < 0) throw new Error('لم أتعرف على أعمدة جدول النتائج.');
  const headers = uniqueHeaders(matrix[headerIndex]);
  if (matrix.slice(headerIndex + 1).some(row => row.length !== headers.length)) {
    throw new Error('صف نتائج لا يطابق أعمدة الجدول؛ لا يمكن تأكيد اكتمال الشعب.');
  }
  const rows = matrix.slice(headerIndex + 1).filter(row =>
    row.some(Boolean) &&
    !row.every((c, i) => normalizeArabic(c) === normalizeArabic(headers[i]))
  );
  return {headers, rows};
}

function nameKey(value) {
  return normalizeArabic(arabicDigitsToAscii(value)).replace(/[()[\]{}]/g, ' ')
    .replace(/(^|\s)و\s+/g, '$1و').replace(/\s+/g, ' ').trim();
}

function matchCourseRows(course, parsed) {
  const numberIdx = findColumn(parsed.headers, ['رقم المادة', 'course number', 'course no']);
  const nameIdx = findColumn(parsed.headers, ['اسم المادة', 'course name']);
  if (!parsed.rows.length) return [];
  if (numberIdx < 0 || (course.kind === 'name' && nameIdx < 0)) {
    throw new Error('أعمدة تعريف المادة مفقودة؛ لا يمكن تأكيد نتائج البحث.');
  }
  if (parsed.rows.some(row => !cleanText(row[numberIdx]))) {
    throw new Error('صف بدون رقم مادة؛ لا يمكن ربط مواعيد الصف بالمادة بأمان.');
  }
  if (course.kind === 'number') {
    return parsed.rows.filter(row => arabicDigitsToAscii(cleanText(row[numberIdx])) === course.query);
  }
  const query = nameKey(course.query);
  const exact = parsed.rows.filter(row => nameKey(row[nameIdx]) === query);
  const rows = exact.length ? exact : parsed.rows.filter(row => nameKey(row[nameIdx]).includes(query));
  const identities = new Set(rows.map(row => cleanText(row[numberIdx]) || nameKey(row[nameIdx])));
  if (identities.size > 1) {
    const names = [...new Set(rows.map(row => row[numberIdx] + ' — ' + row[nameIdx]))];
    const error = new Error('الاسم يطابق أكثر من مادة؛ استخدم رقم المادة:\n' + names.join('\n'));
    error.courseCandidates = [...new Map(rows.map(row => [cleanText(row[numberIdx]), {
      courseNumber: arabicDigitsToAscii(cleanText(row[numberIdx])), officialName: cleanText(row[nameIdx])
    }])).values()].filter(c => /^\d{6,}$/.test(c.courseNumber));
    throw error;
  }
  return rows;
}

async function searchCourse(course, year, semester, serverQuery = course.query) {
  let url = course.kind === 'number' ? URL_BY_NUMBER : URL_BY_NAME;
  let doc;
  try { doc = await fetchDoc(url); }
  catch (error) {
    if (course.kind !== 'name' || error.status !== 404) throw error;
    url = URL_BY_NAME_LEGACY;
    doc = await fetchDoc(url);
  }
  doc = await setYearSemester(doc, url, year, semester);
  const expectedYear = findSelect(doc, 'l_year').value;
  const expectedSemester = findSelect(doc, 'l_sem').value;
  const input = findSearchInput(doc);
  if (!input.name) throw new Error('خانة البحث لا تحتوي name.');
  const button = findSearchButton(doc);
  const overrides = {[input.name]: serverQuery};
  if (button.type === 'submit' && button.name) {
    doc = await submitForm(doc, url, button.name, button.value, overrides);
  } else if (button.event) {
    doc = await postBack(doc, url, button.event.target, overrides, button.event.argument);
  } else if (button.type === 'image' && button.name) {
    doc = await postBack(doc, url, '', {...overrides, [button.name + '.x']: '1', [button.name + '.y']: '1'});
  } else throw new Error('نوع زر البحث غير مدعوم.');

  let headers;
  const rows = [];
  const seenPages = new Set();
  let currentPage = 1;
  while (true) {
    if (!findForm(doc) || !findSelect(doc, 'l_year')) throw new Error('استجابة البحث ليست صفحة جدول الجامعة.');
    if (findSelect(doc, 'l_year').value !== expectedYear || findSelect(doc, 'l_sem')?.value !== expectedSemester) {
      throw new Error('لم يحتفظ الموقع بالسنة والفصل المطلوبين.');
    }
    const parsed = parseResultTable(doc);
    if (!headers) headers = parsed.headers;
    else if (JSON.stringify(headers) !== JSON.stringify(parsed.headers)) throw new Error('تغيرت أعمدة النتائج أثناء التصفح.');
    const signature = JSON.stringify(parsed.rows);
    if (seenPages.has(signature)) throw new Error('تكررت صفحة النتائج؛ تعذر جلب جميع الشعب.');
    seenPages.add(signature);
    rows.push(...parsed.rows);
    const table = findResultTable(doc);
    const handlers = [...(table?.querySelectorAll('a[href],a[onclick]') || [])]
      .map(a => (a.getAttribute('href') || '') + ' ' + (a.getAttribute('onclick') || ''));
    // The captured pages initialize a callback GridView, but contain no rendered
    // callback pager to establish its response protocol. Do not silently drop it.
    if (handlers.some(script => /\.callback\s*\(|\bWebForm_DoCallback\s*\(/.test(script))) {
      throw new Error('الجدول يستخدم صفحات callback غير مدعومة؛ لا يمكن تأكيد اكتمال الشعب.');
    }
    const events = handlers.map(readPostBack)
      .filter(e => e && /^Page\$/i.test(e.argument));
    const next = events.find(e => e.argument === 'Page$' + (currentPage + 1)) ||
      events.find(e => e.argument.toLowerCase() === 'page$next');
    if (!next) {
      if (events.some(e => e.argument.toLowerCase() === 'page$last' || /^Page\$\d+$/.test(e.argument) && Number(e.argument.slice(5)) > currentPage)) {
        throw new Error('تعذر تحديد الصفحة التالية؛ النتائج غير مكتملة.');
      }
      break;
    }
    if (currentPage >= 200) throw new Error('تجاوز البحث حد صفحات النتائج؛ استخدم رقم المادة.');
    doc = await postBack(doc, url, next.target, {}, next.argument);
    currentPage++;
  }
  const parsed = {headers, rows};
  const matched = matchCourseRows(course, parsed);
  // HU's server search is spelling-sensitive (ة/ه, attached/separate و).
  // One broader request is filtered against the ORIGINAL name, never accepted wholesale.
  const firstWord = cleanText(course.query).split(' ')[0];
  if (!matched.length && course.kind === 'name' && serverQuery === course.query && firstWord !== course.query) {
    return searchCourse(course, year, semester, firstWord);
  }
  return {...course, headers, rows: matched};
}

let smartSearchIndexPromise;
async function getSmartSearchIndex() {
  if (!smartSearchIndexPromise) {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('smart-search-catalog.json') : 'smart-search-catalog.json';
    smartSearchIndexPromise = fetch(url).then(response => {
      if (!response.ok) throw new Error('تعذر تحميل فهرس المواد.');
      return response.json();
    }).then(data => HUSmartSearch.createIndex(data)).catch(error => {
      smartSearchIndexPromise = null;
      throw error;
    });
  }
  return smartSearchIndexPromise;
}

function chooseSmartCourse(query, candidates, mode = 'ambiguous') {
  if (!candidates.length) return Promise.resolve(null);
  const panel = $('smartSearchChoice'), options = $('smartSearchOptions');
  $('smartSearchTitle').textContent = mode === 'suggestions' ? 'اقتراحات — اختر المادة المقصودة' : 'حدد المادة المقصودة';
  $('smartSearchPrompt').textContent = `البحث: ${query}. ` + (mode === 'ambiguous_alias'
    ? 'هذا الاختصار غير معتمد للاختيار التلقائي. راجع الاسم والرقم قبل المتابعة.'
    : 'لن يستمر البحث إلا بعد اختيارك؛ يمكنك الإلغاء وتعديل الاسم أو الرقم.');
  options.replaceChildren();
  panel.classList.remove('hidden');
  return new Promise(resolve => {
    const finish = course => {
      panel.classList.add('hidden');
      options.replaceChildren();
      $('smartSearchCancel').onclick = null;
      resolve(course);
    };
    for (const course of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.courseNumber = course.courseNumber;
      const name = document.createElement('strong');
      name.textContent = course.officialName;
      const number = document.createElement('bdi');
      number.textContent = course.courseNumber;
      button.append(name, number);
      if (course.context?.length) {
        const context = document.createElement('small');
        context.textContent = course.context.join(' / ');
        button.append(context);
      }
      button.onclick = () => finish(course);
      options.append(button);
    }
    $('smartSearchCancel').onclick = () => finish(null);
    options.querySelector('button')?.focus();
  });
}

async function searchSmartCourse(course, year, semester) {
  let index;
  try { index = await getSmartSearchIndex(); }
  catch (error) {
    // Without the catalog we cannot distinguish Arabic aliases from official names safely.
    if (course.kind !== 'number') throw new Error('تعذر تحميل فهرس المواد؛ أعد المحاولة أو استخدم رقم المادة مباشرة.');
  }
  let resolution = index ? HUSmartSearch.resolve(index, course.query) : {state: 'unknown', suggestions: []};
  if (course.kind === 'number') resolution = {state: 'resolved', courseNumber: course.query, course: index?.byNumber.get(course.query)};
  if (resolution.state === 'ambiguous' || resolution.suggestions?.length) {
    const chosen = await chooseSmartCourse(course.query, resolution.candidates || resolution.suggestions,
      resolution.state === 'ambiguous' ? resolution.match : 'suggestions');
    if (!chosen) return {...course, headers: [], rows: [], searchState: resolution.state,
      searchMessage: 'لم يتم اختيار مادة؛ أدخل الاسم الرسمي أو رقم المادة.'};
    resolution = {state: 'resolved', courseNumber: chosen.courseNumber, course: chosen};
  }
  if (resolution.state !== 'resolved' && (resolution.reviewRequired || !/[\u0600-\u06ff]/.test(course.query) || course.query.length < 3)) {
    return {...course, headers: [], rows: [], searchState: 'unknown', searchMessage: resolution.reviewRequired
      ? 'الاختصار غير معتمد بعد؛ استخدم الاسم الرسمي أو رقم المادة.' : 'لم أجد تطابقًا آمنًا؛ استخدم الاسم الرسمي أو رقم المادة.'};
  }
  const request = resolution.state === 'resolved'
    ? {...course, kind: 'number', query: resolution.courseNumber, label: resolution.course?.officialName || course.label}
    : course;
  let result;
  try { result = await searchCourse(request, year, semester); }
  catch (error) {
    if (!error.courseCandidates?.length) throw error;
    const chosen = await chooseSmartCourse(course.query, error.courseCandidates.map(c => index?.byNumber.get(c.courseNumber) || c));
    if (!chosen) return {...course, headers: [], rows: [], searchState: 'ambiguous', searchMessage: 'لم يتم اختيار مادة.'};
    resolution = {course: index?.byNumber.get(chosen.courseNumber) || chosen};
    result = await searchCourse({...course, kind: 'number', query: chosen.courseNumber, label: chosen.officialName}, year, semester);
  }
  result.searchState = HUSmartSearch.liveState(resolution.course, result.rows);
  if (result.searchState === 'known_not_offered') {
    result.searchMessage = 'المادة معروفة، لكنها غير مطروحة في الفصل المحدد.';
    const hint = HUSmartSearch.historicalHint(resolution.course);
    if (hint) result.searchMessage += ' ' + hint;
  } else if (result.searchState === 'unknown') result.searchMessage = 'لا توجد نتائج مطابقة؛ لم يتم تأكيد المادة في الفصل المحدد.';
  return result;
}



// ----------------------------- Meeting parsing -----------------------------

function canonicalDay(word) {
  const raw = cleanText(word);
  if (FULL_DAY_ALIASES.has(raw)) return FULL_DAY_ALIASES.get(raw);

  const normalized = normalizeArabic(raw);
  for (const [key, value] of FULL_DAY_ALIASES.entries()) {
    if (normalizeArabic(key) === normalized) return value;
  }

  if (SHORT_DAY_ALIASES.has(raw)) return SHORT_DAY_ALIASES.get(raw);
  return null;
}

function timeToMinutes(raw) {
  const s = cleanText(arabicDigitsToAscii(raw)).toLowerCase().replace(/[.,،]/g, ':');
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  if (minute > 59 || hour > 23 || (m[3] && (hour < 1 || hour > 12))) return null;
  if (m[3]) hour = hour % 12 + (/^(pm|م)$/.test(m[3]) ? 12 : 0);
  // No afternoon guess: HTML time inputs and HU's timetable use 24-hour time.
  return hour * 60 + minute;
}

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function extractRanges(text) {
  const s = arabicDigitsToAscii(text || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[–—−]/g, '-').replace(/(\d)[.,،](\d{2})/g, '$1:$2');
  const re = /(?<![\d:])(\d{1,2}(?::\d{2})?\s*(?:am|pm|ص|م)?)\s*(?:-|إلى|الى|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|ص|م)?)(?![\d:])/gi;
  const out = [];
  for (const m of s.matchAll(re)) {
    let from = m[1].trim(), to = m[2].trim();
    const endPeriod = to.match(/(am|pm|ص|م)$/i)?.[1];
    if (endPeriod && !/(am|pm|ص|م)$/i.test(from)) {
      // Shared suffix: 1-2 pm. Do not guess for 11-1 pm across noon.
      if (Number(from.split(':')[0]) <= Number(to.match(/^\d+/)[0])) from += ' ' + endPeriod;
      else { out.push({start: null, end: null, index: m.index, length: m[0].length, raw: m[0]}); continue; }
    }
    const start = timeToMinutes(from), end = timeToMinutes(to);
    out.push({start: start != null && end > start ? start : null,
      end: start != null && end > start ? end : null, index: m.index, length: m[0].length, raw: m[0]});
  }
  return out;
}

function explicitDaysInText(text) {
  const clean = arabicDigitsToAscii(text || "")
    .replace(/(^|\s)و(?=ال)/g, '$1')
    .replace(/[،,;/|()[\]{}:]+/g, " ");

  const tokens = clean.split(/\s+/).filter(Boolean);
  const days = [];

  for (const token of tokens) {
    const day = canonicalDay(token);
    if (day) days.push(day);
    else if (/^[سحنثرخج]{2,7}$/.test(token)) {
      for (const letter of token) days.push(SHORT_DAY_ALIASES.get(letter));
    }
  }

  return [...new Set(days)];
}

function hasUnknownDays(text) {
  return cleanText(text).replace(/(^|\s)و(?=ال)/g, '$1').split(/[\s،,;/|()[\]{}:]+/).filter(Boolean)
    .some(token => token !== 'و' && !canonicalDay(token) && !/^[سحنثرخج]{2,7}$/.test(token));
}

function isDayHeader(header) {
  return canonicalDay(cleanText(header)) !== null;
}

function parseMeetingDetails(headers, cells) {
  const meetings = [];
  const warnings = [];
  const empty = text => !cleanText(text) || /^[-—–]+$/.test(cleanText(text));
  const add = (days, range, remote = false) => {
    if (!days.length || range.start == null || range.end == null) { warnings.push('يوم أو وقت غير معروف'); return; }
    days.forEach(day => meetings.push({day, start: range.start, end: range.end, ...(remote ? {remote:true} : {})}));
  };
  const dayIdx = findColumn(headers, ['الأيام', 'اليوم', 'days', 'day']);
  const timeIndexes = headers.map((h, i) => ({h: normalizeArabic(h), i})).filter(({h}) =>
    /موعد|وقت|توقيت|محاضر|schedule|time/.test(h)
  ).map(x => x.i);
  const weekdayIndexes = headers.map((h,i) => canonicalDay(h) ? i : -1).filter(i=>i>=0);
  const indexes = [...new Set([...weekdayIndexes, ...timeIndexes])];
  if (!indexes.length) warnings.push('أعمدة المواعيد غير معروفة');
  for (const i of indexes) {
    const text = cells[i] || '';
    if (empty(text)) continue;
    const headerDay = canonicalDay(headers[i]);
    const externalDays = dayIdx >= 0 ? explicitDaysInText(cells[dayIdx]) : [];
    const chunks = text.split(/\*\*+|\n|;|؛|\|/).filter(t => !empty(t));
    for (const chunk of chunks) {
      const remote = /تدرس عن بعد/.test(chunk);
      const ranges = extractRanges(chunk);
      if (!ranges.length) { warnings.push('موعد غير مقروء: ' + cleanText(chunk)); continue; }
      if (headerDay) { ranges.forEach(r => add([headerDay], r, remote)); continue; }
      // HU puts time first, then day abbreviations, then '/' and room text.
      // For day-first text, each range belongs only to its preceding day group.
      const normalized = arabicDigitsToAscii(chunk).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/[–—−]/g, '-').replace(/(\d)[.,،](\d{2})/g, '$1:$2');
      const beforeFirst = normalized.slice(0, ranges[0].index);
      const dayFirst = explicitDaysInText(beforeFirst).length > 0;
      ranges.forEach((range, index) => {
        const dayText = dayFirst
          ? normalized.slice(index ? ranges[index-1].index + ranges[index-1].length : 0, range.index)
          : normalized.slice(range.index + range.length, ranges[index+1]?.index ?? normalized.length).split('/')[0];
        const days = explicitDaysInText(dayText);
        if (hasUnknownDays(dayText) || (!days.length && dayIdx >= 0 && hasUnknownDays(cells[dayIdx] || ''))) {
          warnings.push('رمز يوم غير معروف');
        }
        add(days.length ? days : (ranges.length === 1 ? externalDays : []), range, remote);
      });
      // A second malformed range or TBD meeting must not be silently dropped.
      const uncovered = normalized.split('/')[0];
      let rest = uncovered;
      for (const r of ranges) rest = rest.replace(r.raw, '');
      if (/\d|غير محدد|يحدد|tba|tbd/i.test(rest)) warnings.push('جزء من الموعد غير مقروء');
    }
  }
  const unique = [...new Map(meetings.map(m => [m.day + '-' + m.start + '-' + m.end, m])).values()];
  for (let i = 0; i < unique.length; i++) {
    if (unique.slice(i+1).some(m => conflicts(unique[i], m))) warnings.push('تعارض داخل الشعبة');
  }
  if (!unique.length) warnings.push('لا يوجد موعد مؤكد');
  return {meetings: unique, warnings: [...new Set(warnings)], complete: warnings.length === 0};
}

function parseMeetings(headers, cells) {
  return parseMeetingDetails(headers, cells).meetings;
}

function findColumn(headers, words) {
  return headers.findIndex(h => {
    const n = normalizeArabic(h);
    return words.some(w => n.includes(normalizeArabic(w)));
  });
}

function buildSections(courseResult) {
  const {headers, rows} = courseResult;
  const sectionIdx = findColumn(headers, ['الشعبة', 'section']);
  const numberIdx = findColumn(headers, ['رقم المادة', 'course no', 'course number']);
  const nameIdx = findColumn(headers, ['اسم المادة', 'course name']);
  const instructorIdx = findColumn(headers, ['المدرس', 'المحاضر', 'instructor']);
  const groups = new Map();
  rows.forEach((cells, idx) => {
    const section = cleanText(cells[sectionIdx] || '');
    const detectedNumber = arabicDigitsToAscii(cleanText(cells[numberIdx] || ''));
    const detectedName = cleanText(cells[nameIdx] || '');
    const details = parseMeetingDetails(headers, cells);
    if (!section) { details.complete = false; details.warnings.push('رقم الشعبة مفقود'); }
    const key = detectedNumber + '|' + (section || 'unknown-' + idx);
    if (!groups.has(key)) groups.set(key, {
      courseKey: courseResult.original, courseLabel: detectedName || courseResult.label || courseResult.query,
      query: courseResult.query, section: section || 'غير معروفة', courseNumber: detectedNumber,
      detectedName, meetings: [], warnings: [], complete: true, instructors: [], cells, headers, raw: ''
    });
    const group = groups.get(key);
    group.meetings.push(...details.meetings);
    group.complete &&= details.complete;
    group.warnings.push(...details.warnings);
    if (cells[instructorIdx]) group.instructors.push(cleanText(cells[instructorIdx]));
    group.raw += (group.raw ? '\n' : '') + cells.join(' | ');
  });
  return [...groups.values()].map(group => {
    group.meetings = [...new Map(group.meetings.map(m => [JSON.stringify(m), m])).values()];
    group.instructors = [...new Set(group.instructors)];
    if (group.meetings.some((m,i) => group.meetings.slice(i+1).some(n => conflicts(m,n)))) {
      group.complete = false; group.warnings.push('تعارض داخل الشعبة');
    }
    group.warnings = [...new Set(group.warnings)];
    return group;
  });
}



// ----------------------------- Schedule engine -----------------------------

function validWeekMeeting(meeting) {
  return DAY_ORDER.includes(meeting.day) && Number.isFinite(meeting.start) &&
    Number.isFinite(meeting.end) && meeting.start >= 0 && meeting.end <= 1440 &&
    meeting.end > meeting.start;
}

function hasCompleteTiming(section) {
  return section.complete === true && section.meetings.length > 0 &&
    section.meetings.every(validWeekMeeting);
}

function courseIdentity(section, fallback = '') {
  const number = arabicDigitsToAscii(cleanText(section.courseNumber || ''));
  return number ? 'number:' + number : 'name:' + nameKey(
    section.detectedName || section.courseLabel || section.courseKey || fallback
  );
}

// Count a section pair once, with its distinct overlapping intervals underneath.
// All fetched alternatives participate, regardless of the user's time filters.
function collectSectionConflicts(allSections) {
  const courses = new Map();
  for (const [fallback, sections] of allSections) {
    for (const section of sections) {
      const key = courseIdentity(section, fallback);
      if (!courses.has(key)) courses.set(key, {key, label:section.courseLabel || fallback, sections:new Map()});
      const course = courses.get(key);
      const sectionKey = arabicDigitsToAscii(cleanText(section.section));
      if (!course.sections.has(sectionKey)) course.sections.set(sectionKey, {...section, meetings:[], complete:true, instructors:[]});
      const entry = course.sections.get(sectionKey);
      entry.meetings.push(...section.meetings);
      entry.complete &&= section.complete === true;
      if (section.instructors?.length) {
        entry.instructors = [...new Set([...(entry.instructors || []), ...section.instructors])];
      }
      if (!entry.courseNumber && section.courseNumber) entry.courseNumber = section.courseNumber;
      if (!entry.courseLabel && section.courseLabel) entry.courseLabel = section.courseLabel;
    }
  }
  const ordered = [...courses.values()].sort((a, b) => a.key.localeCompare(b.key));
  const groups = [];
  let total = 0, unknown = 0, outsideWeek = 0;
  for (const course of ordered) {
    for (const section of course.sections.values()) {
      if (!section.complete || !section.meetings.length) unknown++;
      if (section.meetings.some(m => !DAY_ORDER.includes(m.day))) outsideWeek++;
    }
  }
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const first = ordered[i], second = ordered[j], pairs = [];
      for (const a of first.sections.values()) {
        for (const b of second.sections.values()) {
          const found = [];
          for (const x of a.meetings.filter(validWeekMeeting)) {
            for (const y of b.meetings.filter(validWeekMeeting)) {
              if (conflicts(x, y)) found.push({day:x.day, start:Math.max(x.start, y.start), end:Math.min(x.end, y.end)});
            }
          }
          found.sort((x, y) => DAY_ORDER.indexOf(x.day) - DAY_ORDER.indexOf(y.day) || x.start - y.start || x.end - y.end);
          const overlaps = [];
          for (const overlap of found) {
            const last = overlaps[overlaps.length - 1];
            if (last && last.day === overlap.day && overlap.start <= last.end) last.end = Math.max(last.end, overlap.end);
            else overlaps.push({...overlap});
          }
          if (overlaps.length) pairs.push({first:a, second:b, overlaps});
        }
      }
      if (pairs.length) {
        groups.push({first, second, pairs});
        total += pairs.length;
      }
    }
  }
  return {groups, total, unknown, outsideWeek};
}

function conflicts(a, b) {
  return a.day === b.day &&
         Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function sectionConflicts(section, chosen) {
  const existing = chosen.flatMap(x => x.meetings);
  return section.meetings.some(m => existing.some(e => conflicts(m, e)));
}

function isAllowed(section, prefs) {
  if (!hasCompleteTiming(section)) return false;
  for (const m of section.meetings) {
    if (prefs.offDays.has(m.day)) return false;
    if (prefs.notBefore != null && m.start < prefs.notBefore) return false;
    if (prefs.notAfter != null && m.end > prefs.notAfter) return false;
  }
  return true;
}

function formatDurationArabic(minutes) {
  if (!minutes || minutes <= 0) return "0 دقيقة";
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

function scheduleMetrics(chosen) {
  const byDay = new Map();

  for (const section of chosen) {
    for (const meeting of section.meetings) {
      if (!validWeekMeeting(meeting)) throw new Error('موعد غير صالح أو خارج أسبوع الدوام.');
      if (!byDay.has(meeting.day)) byDay.set(meeting.day, []);
      byDay.get(meeting.day).push({...meeting, section});
    }
  }

  let totalGap = 0;
  let earliest = Infinity;
  let latest = -Infinity;
  const gapsByDay = new Map();
  const campusBreaksByDay = new Map();

  for (const day of DAY_ORDER) {
    const meetings = byDay.get(day) || [];
    if (!meetings.length) {
      gapsByDay.set(day, 0);
      campusBreaksByDay.set(day, []);
      continue;
    }

    meetings.sort((a, b) => a.start - b.start);
    earliest = Math.min(earliest, meetings[0].start);
    latest = Math.max(latest, meetings[meetings.length - 1].end);

    // Break calculation rules:
    // 1. Break = gap between consecutive IN-PERSON classes on the same day.
    // 2. No Break before first class or after last in-person class.
    // 3. Online classes do not create or extend campus Break.
    const inPerson = meetings.filter(m => !m.remote).sort((a, b) => a.start - b.start);
    const remote = meetings.filter(m => m.remote).sort((a, b) => a.start - b.start);

    let dayGap = 0;
    const dayBreaks = [];

    for (let i = 1; i < inPerson.length; i++) {
      const prev = inPerson[i - 1];
      const curr = inPerson[i];
      const winStart = prev.end;
      const winEnd = curr.start;

      if (winEnd > winStart) {
        let cursor = winStart;
        for (const rem of remote) {
          const overlapStart = Math.max(winStart, rem.start);
          const overlapEnd = Math.min(winEnd, rem.end);
          if (overlapEnd > overlapStart) {
            if (overlapStart > cursor) {
              dayBreaks.push({start: cursor, end: overlapStart, duration: overlapStart - cursor});
            }
            cursor = Math.max(cursor, overlapEnd);
          }
        }
        if (cursor < winEnd) {
          dayBreaks.push({start: cursor, end: winEnd, duration: winEnd - cursor});
        }
      }
    }

    dayGap = dayBreaks.reduce((sum, interval) => sum + interval.duration, 0);
    gapsByDay.set(day, dayGap);
    campusBreaksByDay.set(day, dayBreaks);
    totalGap += dayGap;
  }

  if (!isFinite(earliest)) earliest = 0;
  if (!isFinite(latest)) latest = 0;

  return {
    // Explicitly remote lectures still block time but do not require a campus day.
    // Blended/unspecified delivery is conservatively counted as attendance.
    days: [...byDay.values()].filter(meetings => meetings.some(m => !m.remote)).length,
    gap: totalGap,
    gapsByDay,
    campusBreaksByDay,
    earliest,
    latest,
    byDay: new Map(DAY_ORDER.filter(day => byDay.has(day)).map(day => [day, byDay.get(day)]))
  };
}

function compareSchedules(a, b, ranking = 'balanced') {
  const x = a.metrics, y = b.metrics;
  const comparisons = {days: x.days-y.days, gaps: x.gap-y.gap, late: y.earliest-x.earliest, earlyEnd: x.latest-y.latest};
  const order = ['days', 'gaps', 'late', 'earlyEnd'];
  if (ranking !== 'balanced' && order.includes(ranking)) order.unshift(...order.splice(order.indexOf(ranking), 1));
  return order.map(k => comparisons[k]).find(n => n !== 0) || 0;
}

function generateSchedules(courseSections, prefs, maxResults = 80, maxNodes = 50000) {
  const courseKeys = [...courseSections.keys()].sort((a,b) => courseSections.get(a).length-courseSections.get(b).length);
  const results = [];
  let nodes = 0, truncated = false, totalFound = 0;
  function dfs(index, chosen) {
    if (nodes >= maxNodes) { truncated = true; return; }
    nodes++;
    if (index === courseKeys.length) {
      totalFound++;
      results.push({sections: [...chosen], metrics: scheduleMetrics(chosen)});
      results.sort((a,b) => compareSchedules(a,b,prefs.ranking));
      if (results.length > maxResults) results.pop();
      return;
    }
    for (const section of courseSections.get(courseKeys[index])) {
      if (truncated) break;
      if (!isAllowed(section,prefs) || sectionConflicts(section,chosen)) continue;
      if (section.meetings.some((m,i) => section.meetings.slice(i+1).some(n => conflicts(m,n)))) continue;
      if (chosen.some(s => s.courseNumber && s.courseNumber === section.courseNumber)) continue;
      chosen.push(section); dfs(index+1,chosen); chosen.pop();
    }
  }
  if (courseKeys.length) dfs(0, []);
  results.truncated = truncated;
  results.nodes = nodes;
  results.totalFound = totalFound;
  return results;
}



// ----------------------------- UI rendering -----------------------------

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function meetingText(meetings) {
  if (!meetings.length) return "موعد غير منشور";

  const grouped = new Map();

  for (const m of meetings) {
    const key = `${m.start}-${m.end}-${m.remote ? 'remote' : 'campus'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m.day);
  }

  return [...grouped.entries()].map(([key, days]) => {
    const [start, end] = key.split("-").map(Number);
    return `${days.join("، ")} ${minutesToTime(start)}–${minutesToTime(end)}${key.endsWith('remote') ? ' (عن بعد)' : ''}`;
  }).join(" | ");
}

function sectionTimingLabel(section) {
  if (!section.meetings.length) {
    // Distinguish an empty HU meeting cell from a published but unreadable time.
    const timeText = (section.headers || []).flatMap((header, i) =>
      /موعد|وقت|توقيت|schedule|time/.test(normalizeArabic(header)) || canonicalDay(header)
        ? [(section.cells?.[i] || '').split('/')[0]] : []).join(' ');
    return /[0-9٠-٩۰-۹]/.test(timeText) ? 'تعذر قراءة الموعد المنشور' : 'موعد غير منشور';
  }
  if (section.meetings.some(m => !DAY_ORDER.includes(m.day))) return 'خارج أسبوع الدوام المحدد';
  if (!hasCompleteTiming(section)) return 'الموعد غير مكتمل أو غير مؤكد';
  return '';
}

let currentAllSections = new Map();
let currentSchedules = [];
let lastConflictReport = null;
let currentResultTerm = null;

async function openExport(type, scheduleIndex = 0) {
  const year = currentResultTerm?.year ?? cleanText($("year").value);
  const semester = currentResultTerm?.semester ?? $("semester").value;

  const serializableSections = [];
  for (const [key, sections] of currentAllSections.entries()) {
    const label = sections[0]?.courseLabel || key;
    serializableSections.push({
      key,
      label,
      sections: sections.map(sec => ({
        section: sec.section,
        courseNumber: sec.courseNumber,
        courseLabel: sec.courseLabel,
        instructors: sec.instructors || [],
        meetings: sec.meetings || [],
        complete: hasCompleteTiming(sec),
        statusLabel: sectionTimingLabel(sec),
        warnings: sec.warnings || []
      }))
    });
  }

  const serializableSchedules = (currentSchedules || []).map(s => ({
    sections: (s.sections || []).map(sec => ({
      section: sec.section,
      courseNumber: sec.courseNumber,
      courseLabel: sec.courseLabel,
      instructors: sec.instructors || [],
      meetings: sec.meetings || [],
      complete: sec.complete
    })),
    metrics: {
      days: s.metrics.days,
      gap: s.metrics.gap,
      earliest: s.metrics.earliest,
      latest: s.metrics.latest,
      gapsByDay: Object.fromEntries(s.metrics.gapsByDay || [])
    }
  }));

  const serializableConflicts = lastConflictReport ? {
    total: lastConflictReport.total,
    unknown: lastConflictReport.unknown,
    outsideWeek: lastConflictReport.outsideWeek,
    groups: (lastConflictReport.groups || []).map(g => ({
      first: { label: g.first.label, key: g.first.key },
      second: { label: g.second.label, key: g.second.key },
      pairs: g.pairs.map(p => ({
        first: { section: p.first.section, instructors: p.first.instructors || [], courseNumber: p.first.courseNumber },
        second: { section: p.second.section, instructors: p.second.instructors || [], courseNumber: p.second.courseNumber },
        overlaps: p.overlaps
      }))
    }))
  } : { total: 0, groups: [] };

  const payload = {
    type,
    scheduleIndex,
    timestamp: new Date().toISOString(),
    year,
    semester,
    schedules: serializableSchedules,
    allSections: serializableSections,
    conflicts: serializableConflicts
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ huSmartScheduleExport: payload });
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem('huSmartScheduleExport', JSON.stringify(payload));
  }

  const exportUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL(`export.html?type=${type}&index=${scheduleIndex}`)
    : `export.html?type=${type}&index=${scheduleIndex}`;

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    await chrome.tabs.create({ url: exportUrl });
  } else {
    window.open(exportUrl, '_blank');
  }
}

async function copyScheduleText(scheduleIndex) {
  const sched = currentSchedules[scheduleIndex];
  if (!sched) return;
  const lines = [
    `الجامعة الهاشمية — اقتراح جدول ${scheduleIndex + 1}`,
    `أيام الدوام: ${sched.metrics.days} أيام | إجمالي الفراغات: ${formatDurationArabic(sched.metrics.gap)}`,
    `أول محاضرة: ${minutesToTime(sched.metrics.earliest)} | آخر محاضرة: ${minutesToTime(sched.metrics.latest)}`,
    '',
    'المواد المسجلة:'
  ];
  for (const sec of sched.sections) {
    const meets = meetingText(sec.meetings);
    lines.push(`- ${sec.courseLabel} (شعبة ${sec.section}): ${meets}`);
    if (sec.instructors?.length) lines.push(`  المدرس: ${sec.instructors.join('، ')}`);
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(lines.join('\n'));
    setStatus(`تم نسخ تفاصيل اقتراح ${scheduleIndex + 1} إلى الحافظة 📋`, 'ok');
  }
}

function renderSectionConflicts(allSections) {
  const report = collectSectionConflicts(allSections);
  lastConflictReport = report;
  const container = $('sectionConflicts');
  container.innerHTML = `
    <div class="panel-toolbar">
      <button type="button" class="export-btn" id="exportConflictsBtn">🖨️ تصدير الشعب المتعارضة (PDF)</button>
    </div>
    <p class="conflict-total">تم العثور على ${report.total} تعارض بين الشعب</p>
    <p class="small">يُحسب كل زوج من الشعب مرة واحدة، مع جميع أوقات تداخله. الفحص يشمل الشعب المجلوبة ضمن أسبوع الأحد–الخميس، قبل تطبيق تفضيلاتك.</p>
    ${report.unknown ? `<p class="notice warn">${report.unknown} شعبة ذات موعد غير منشور أو غير مكتمل؛ لا يمكن تأكيد خلوها من التعارضات.</p>` : ''}
    ${report.outsideWeek ? `<p class="notice warn">${report.outsideWeek} شعبة تتضمن مواعيد خارج أسبوع الدوام المحدد، وتُستبعد من الاقتراحات.</p>` : ''}
    ${!report.total ? '<p class="small">لا توجد تداخلات بين المواعيد المقروءة ضمن هذا الأسبوع.</p>' : ''}
    ${report.groups.map(group => `
      <details class="conflict-group">
        <summary><span>${escapeHtml(group.first.label)} ↔ ${escapeHtml(group.second.label)}</span><span class="badge">${group.pairs.length} تعارضات</span></summary>
        <div class="conflict-list">${group.pairs.map(pair => {
          const firstInst = (pair.first.instructors || []).join('، ');
          const secondInst = (pair.second.instructors || []).join('، ');
          return `
            <div class="conflict-pair">
              <div>${escapeHtml(group.first.label)} — <b>شعبة ${escapeHtml(pair.first.section)}</b>${firstInst ? ` (${escapeHtml(firstInst)})` : ''}</div>
              <div class="small">${escapeHtml(meetingText(pair.first.meetings || []))}</div>
              <div style="margin-top:4px;">${escapeHtml(group.second.label)} — <b>شعبة ${escapeHtml(pair.second.section)}</b>${secondInst ? ` (${escapeHtml(secondInst)})` : ''}</div>
              <div class="small">${escapeHtml(meetingText(pair.second.meetings || []))}</div>
              <div class="conflict-intervals">${pair.overlaps.map(overlap => `
                <span>⚠️ تداخل: ${escapeHtml(overlap.day)} <bdi dir="ltr">${minutesToTime(overlap.start)}–${minutesToTime(overlap.end)}</bdi></span>
              `).join('')}</div>
            </div>
          `;
        }).join('')}</div>
      </details>
    `).join('')}
  `;
  $('conflictsPanel').classList.remove('hidden');
  $('exportConflictsBtn')?.addEventListener('click', () => openExport('conflicts'));
}

function renderSections(allSections) {
  currentAllSections = allSections;
  const container = $("sections");
  container.innerHTML = `
    <div class="panel-toolbar">
      <button type="button" class="export-btn" id="exportSectionsBtn">🖨️ تصدير كل الشعب والتواقيت (PDF)</button>
    </div>
  `;

  for (const [courseKey, sections] of allSections.entries()) {
    const title = sections[0]?.courseLabel || courseKey;

    const card = document.createElement("details");
    card.className = "course-card";

    const parsedCount = sections.filter(hasCompleteTiming).length;

    card.innerHTML = `
      <summary class="course-title">
        ${escapeHtml(title)}
        <span class="badge">${sections.length} شعب/خيارات</span>
        <span class="badge">${parsedCount} وقت مقروء</span>
        ${sections.some(sec => sectionTimingLabel(sec) === 'موعد غير منشور') ? '<span class="badge warn">موعد غير منشور</span>' : ''}
      </summary>
      ${sections.map(sec => `
        <div class="section">
          <div>
            <b>الشعبة:</b> ${escapeHtml(sec.section)}
            ${sec.courseNumber ? `<span class="badge">${escapeHtml(sec.courseNumber)}</span>` : ""}
          </div>
          <div><b>المدرس:</b> ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
          <div class="meet ${hasCompleteTiming(sec) ? "good" : "warn"}">
            ${escapeHtml(sec.meetings.length ? meetingText(sec.meetings) : sectionTimingLabel(sec))}
          </div>
          ${hasCompleteTiming(sec) ? '' : `<div class="notice warn">مستبعدة من الجدولة: ${escapeHtml(sectionTimingLabel(sec))}${sec.warnings?.length ? ' — ' + escapeHtml(sec.warnings.join('؛ ')) : ''}</div>`}
          <div class="raw">${escapeHtml(sec.raw)}</div>
        </div>
      `).join("")}
    `;

    container.appendChild(card);
  }

  $("sectionsPanel").classList.remove("hidden");
  $('exportSectionsBtn')?.addEventListener('click', () => openExport('sections'));
}

function calendarLayout(sections) {
  if (!sections.length || sections.some(section => !hasCompleteTiming(section))) {
    throw new Error('لا يمكن رسم جدول مؤكد بدون مواعيد كاملة ضمن أسبوع الدوام.');
  }
  const meetings = sections.flatMap(section => section.meetings.map(meeting => ({...meeting, section})));
  if (meetings.some((meeting, i) => meetings.slice(i + 1).some(other => conflicts(meeting, other)))) {
    throw new Error('الجدول يحتوي مواعيد متداخلة.');
  }
  const start = Math.floor(Math.min(...meetings.map(m => m.start)) / 60) * 60;
  const end = Math.ceil(Math.max(...meetings.map(m => m.end)) / 60) * 60;
  // Keep even short meetings readable without inflating boxes into adjacent slots.
  const scale = Math.max(1.2, 72 / Math.min(...meetings.map(m => m.end - m.start)));

  const metrics = scheduleMetrics(sections);

  return {
    start, end, scale, height:(end - start) * scale,
    days:DAY_ORDER.map(day => {
      const dayMeetings = meetings.filter(m => m.day === day)
        .sort((a, b) => a.start - b.start)
        .map(m => ({...m, top:(m.start - start) * scale, height:(m.end - m.start) * scale}));
      const dayBreaks = (metrics.campusBreaksByDay?.get(day) || [])
        .filter(b => b.duration >= 30)
        .map(b => ({
          ...b,
          top: (b.start - start) * scale,
          height: (b.end - b.start) * scale
        }));
      return {
        day,
        meetings: dayMeetings,
        breaks: dayBreaks,
        breakMinutes: metrics.gapsByDay?.get(day) || 0
      };
    })
  };
}

function renderWeeklyCalendar(sections, colors, index) {
  const layout = calendarLayout(sections);
  const ticks = [];
  for (let time = layout.start; time <= layout.end; time += 60) {
    ticks.push(`<span class="time-tick ${time === layout.start ? 'first-tick' : time === layout.end ? 'last-tick' : ''}" style="top:${(time - layout.start) * layout.scale}px"><bdi dir="ltr">${minutesToTime(time)}</bdi></span>`);
  }
  return `
    <div class="calendar-scroll" tabindex="0" role="region" aria-label="التقويم الأسبوعي للاقتراح ${index + 1}">
      <div class="weekly-calendar" style="--calendar-height:${layout.height}px;--hour-height:${60 * layout.scale}px">
        <div class="calendar-header">
          <span>الوقت</span>
          ${layout.days.map(({day, breakMinutes, meetings}) => `
            <div class="calendar-day-heading-wrap">
              <span class="calendar-day-heading">${day}</span>
              <span class="day-break-badge ${breakMinutes > 0 ? 'has-break' : (meetings.length ? 'solid' : 'off')}">
                ${!meetings.length ? 'عطلة' : meetings.every(m => m.remote) ? 'عن بعد فقط' : breakMinutes > 0 ? `فراغ ${breakMinutes}د` : 'متواصل'}
              </span>
            </div>
          `).join('')}
        </div>
        <div class="calendar-body">
          <div class="time-axis" aria-hidden="true">${ticks.join('')}</div>
          ${layout.days.map(({day, meetings, breaks}) => `<div class="calendar-day" data-day="${day}" aria-label="${day}">
            ${(breaks || []).map(b => `
              <div class="calendar-break" style="top:${b.top}px;height:${b.height}px" title="استراحة ${formatDurationArabic(b.duration)} بين المحاضرات الوجاهية">
                <span class="break-label">☕ ${b.duration} د</span>
              </div>
            `).join('')}
            ${meetings.map(meeting => {
              const sec = meeting.section;
              const instructors = (sec.instructors || []).join('، ');
              const time = `${minutesToTime(meeting.start)}–${minutesToTime(meeting.end)}`;
              const description = `${sec.courseLabel} — شعبة ${sec.section}${instructors ? ' — ' + instructors : ''} — ${day} ${time}${meeting.remote ? ' — عن بعد' : ''}`;
              return `<button type="button" class="calendar-meeting course-color-${colors.get(courseIdentity(sec)) ?? 0} ${meeting.remote ? 'meeting-remote' : ''}" style="top:${meeting.top}px;height:${meeting.height}px" data-start="${meeting.start}" data-end="${meeting.end}" data-course="${escapeHtml(courseIdentity(sec))}" title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}" aria-controls="schedule-details-${index}">
                <span class="meeting-course">${escapeHtml(sec.courseLabel)}</span>
                <span class="meeting-section">شعبة ${escapeHtml(sec.section)}${meeting.remote ? ' <span class="remote-badge">🌐 عن بعد</span>' : ''}</span>
                ${instructors ? `<span class="meeting-instructor">${escapeHtml(instructors)}</span>` : ''}
                <bdi class="meeting-time" dir="ltr">${time}</bdi>
              </button>`;
            }).join('')}
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderSchedules(schedules) {
  currentSchedules = schedules;
  const container = $("schedules");
  container.innerHTML = "";

  if (!schedules.length) {
    container.innerHTML = `
      <div class="section warn">
        ${schedules.truncated ? 'البحث غير مكتمل؛ لم يعثر على جدول ضمن حد البحث.' : 'لم أجد تركيبة كاملة من الشعب المقروءة بدون تعارض ضمن شروط الوقت الحالية. جرّب توسيع حدود الوقت أو تغيير الأيام المستبعدة.'}
      </div>
    `;
    $("schedulesPanel").classList.remove("hidden");
    return;
  }

  // Global export toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "panel-toolbar";
  toolbar.innerHTML = `
    <button type="button" class="export-btn" id="exportAllSchedulesBtn">🖨️ تصدير كل الجداول (PDF)</button>
    <button type="button" class="export-btn export-full-btn" id="exportFullReportBtn">📑 التقرير الشامل (PDF)</button>
  `;
  container.appendChild(toolbar);

  toolbar.querySelector('#exportAllSchedulesBtn')?.addEventListener('click', () => openExport('schedules'));
  toolbar.querySelector('#exportFullReportBtn')?.addEventListener('click', () => openExport('full'));

  const identities = [...new Set(schedules.flatMap(result => result.sections.map(section => courseIdentity(section))))].sort();
  const colors = new Map(identities.map((key, index) => [key, index % 6]));
  schedules.slice(0, 10).forEach((result, index) => {
    const card = document.createElement("div");
    card.className = "schedule-card";

    const calendar = renderWeeklyCalendar(result.sections, colors, index);

    card.innerHTML = `
      <div class="schedule-title">
        <div class="schedule-title-top">
          <h3>اقتراح ${index + 1}</h3>
          <button type="button" class="print-card-btn" data-index="${index}" title="طباعة أو تصدير هذا الجدول إلى PDF">🖨️ طباعة الجدول (PDF)</button>
        </div>
        <div class="metrics">
          <span class="badge">${result.metrics.days} أيام دوام</span>
          <span class="badge">أول محاضرة <bdi dir="ltr">${minutesToTime(result.metrics.earliest)}</bdi></span>
          <span class="badge">آخر محاضرة <bdi dir="ltr">${minutesToTime(result.metrics.latest)}</bdi></span>
          <span class="badge">إجمالي الفراغات: ${formatDurationArabic(result.metrics.gap)}</span>
        </div>
        <div class="daily-breaks-summary">
          <span class="daily-breaks-label">الفراغات اليومية:</span>
          ${DAY_ORDER.map(d => {
            const mins = result.metrics.gapsByDay?.get(d) || 0;
            const meetings = result.metrics.byDay.get(d) || [];
            if (!meetings.length) return '';
            const label = meetings.every(m => m.remote) ? 'عن بعد فقط' : mins > 0 ? mins + ' د' : 'متواصل';
            return `<span class="day-break-pill ${mins > 0 ? 'warn-break' : 'no-break'}">${d}: ${label}</span>`;
          }).filter(Boolean).join(' ') || '<span class="day-break-pill no-break">لا توجد فراغات</span>'}
        </div>
      </div>
      <div class="schedule-body">
        ${calendar}
        <p class="calendar-help small">اضغط على المحاضرة لعرض بياناتها كاملة. المواعيد عن بعد محسوبة ضمن التعارضات.</p>
        <div class="schedule-action-bar">
          <button type="button" class="details-toggle" aria-expanded="false" aria-controls="schedule-details-${index}">عرض تفاصيل الجدول</button>
          <button type="button" class="copy-btn" data-index="${index}">📋 نسخ تفاصيل الجدول</button>
        </div>
        <div id="schedule-details-${index}" class="schedule-details" hidden>
          ${result.sections.map(sec => `<div class="schedule-section-detail course-color-${colors.get(courseIdentity(sec))}" tabindex="-1" data-course="${escapeHtml(courseIdentity(sec))}">
            <h4>${escapeHtml(sec.courseLabel)}</h4>
            <div>شعبة ${escapeHtml(sec.section)}${sec.courseNumber ? ' · ' + escapeHtml(sec.courseNumber) : ''}</div>
            <div>المدرس: ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
            <div class="detail-meetings">${escapeHtml(meetingText(sec.meetings))}</div>
          </div>`).join('')}
        </div>
      </div>
    `;
    const toggle = card.querySelector('.details-toggle');
    const details = card.querySelector('.schedule-details');
    const setExpanded = expanded => {
      details.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'إخفاء تفاصيل الجدول' : 'عرض تفاصيل الجدول';
    };
    toggle.addEventListener('click', () => setExpanded(details.hidden));
    card.querySelector('.print-card-btn')?.addEventListener('click', () => openExport('single', index));
    card.querySelector('.copy-btn')?.addEventListener('click', () => copyScheduleText(index));
    for (const meeting of card.querySelectorAll('.calendar-meeting')) {
      meeting.addEventListener('click', () => {
        setExpanded(true);
        const detail = [...details.children].find(el => el.dataset.course === meeting.dataset.course);
        detail?.focus();
      });
    }
    container.appendChild(card);
  });

  $("schedulesPanel").classList.remove("hidden");
}

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function getPrefs() {
  const parseInput = id => {
    const v = $(id).value;
    if (!v) return null;
    return timeToMinutes(v);
  };

  const prefs = {
    notBefore: parseInput("notBefore"),
    notAfter: parseInput("notAfter"),
    ranking: $("ranking").value,
    offDays: new Set(
      [...document.querySelectorAll(".offday:checked")].map(x => x.value)
    )
  };
  if (prefs.notBefore != null && prefs.notAfter != null && prefs.notBefore >= prefs.notAfter) {
    throw new Error('وقت البداية يجب أن يسبق وقت النهاية.');
  }
  return prefs;
}

async function saveSettings() {
  const data = {
    year: $("year").value,
    semester: $("semester").value,
    courses: $("courses").value,
    notBefore: $("notBefore").value,
    notAfter: $("notAfter").value,
    ranking: $("ranking").value,
    offDays: [...document.querySelectorAll(".offday:checked")].map(x => x.value)
  };
  await chrome.storage.local.set({huSmartSchedule: data});
}

async function loadSettings() {
  const obj = await chrome.storage.local.get("huSmartSchedule");
  const data = obj.huSmartSchedule;
  if (!data) return;

  if (data.year) $("year").value = data.year;
  if (data.semester) $("semester").value = data.semester;
  if (data.courses) $("courses").value = data.courses;
  if (typeof data.notBefore === 'string') $("notBefore").value = data.notBefore;
  if (typeof data.notAfter === 'string') $("notAfter").value = data.notAfter;
  if (data.ranking) $("ranking").value = data.ranking;

  const off = new Set(data.offDays || []);
  for (const box of document.querySelectorAll(".offday")) {
    box.checked = off.has(box.value);
  }
}

async function run() {
  const button = $("run");
  button.disabled = true;
  currentSchedules = [];
  currentAllSections = new Map();
  lastConflictReport = null;
  currentResultTerm = null;

  $("sectionsPanel").classList.add("hidden");
  $("schedulesPanel").classList.add("hidden");
  $('conflictsPanel').classList.add('hidden');
  $("sections").innerHTML = "";
  $("schedules").innerHTML = "";
  $('sectionConflicts').innerHTML = '';

  try {
    await saveSettings();

    const year = arabicDigitsToAscii(cleanText($("year").value));
    const semester = $("semester").value;
    if (!/^\d{4}$/.test(year)) throw new Error('أدخل سنة صحيحة من أربع خانات.');
    const prefs = getPrefs();

    const courses = $("courses").value
      .split(/\r?\n/)
      .map(parseCourseLine)
      .filter(Boolean);

    if (!courses.length) {
      throw new Error("اكتب مادة واحدة على الأقل.");
    }
    const requested = new Set();
    for (const course of courses) {
      const key = course.kind + ':' + HUSmartSearch.normalize(course.query);
      if (requested.has(key)) throw new Error('المادة مكررة: ' + course.label);
      requested.add(key);
    }

    setStatus(`بدأت البحث عن ${courses.length} مواد...`);
    currentResultTerm = {year, semester};

    const results = [];

    // Sequential requests are intentional: WebForms is stateful and this is
    // also gentler on the university website.
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      setStatus(`جاري البحث ${i + 1}/${courses.length}: ${course.label}`);

      try {
        results.push(await searchSmartCourse(course, year, semester));
      } catch (error) {
        results.push({...course, headers: [], rows: [], error: error.message});
      }
    }

    const allSections = new Map();
    const missing = [];

    for (const result of results) {
      const sections = buildSections(result);

      if (!sections.length) {
        missing.push(result.label + (result.error ? ': ' + result.error : ' — ' + (result.searchMessage || 'لا توجد نتائج مطابقة')));
        allSections.set(result.original, []);
      } else {
        allSections.set(result.original, sections);
      }
    }

    renderSections(allSections);
    renderSectionConflicts(allSections);

    const identities = new Set();
    for (const sections of allSections.values()) {
      const number = sections[0]?.courseNumber;
      if (number && identities.has(number)) throw new Error('تم طلب نفس المادة بالاسم والرقم: ' + number);
      if (number) identities.add(number);
    }

    if (missing.length) {
      setStatus(
        `تم البحث، لكن لم تظهر شعب لهذه المواد:\n- ${missing.join("\n- ")}`,
        "error"
      );
      return;
    }

    const unparseableCourses = [...allSections.entries()]
      .filter(([, sections]) => !sections.some(hasCompleteTiming))
      .map(([, sections]) => sections[0]?.courseLabel || "مادة غير معروفة");

    if (unparseableCourses.length) {
      setStatus(
        "لا توجد مواعيد مكتملة ضمن أسبوع الدوام لبعض المواد (موعد غير منشور أو غير مقروء أو خارج الأسبوع):\n" +
        unparseableCourses.map(x => `- ${x}`).join("\n") +
        "\n\nالشعب الخام وأسباب استبعادها معروضة أعلاه؛ لا يمكن تأكيد جدول بدون مواعيد كاملة.",
        "error"
      );
      return;
    }

    // Use only parseable sections when building schedules.
    const parseable = new Map(
      [...allSections.entries()].map(([key, sections]) => [
        key,
        sections.filter(hasCompleteTiming)
      ])
    );

    const schedules = generateSchedules(parseable, prefs);
    const excluded = [...allSections.values()].flat().filter(s => !hasCompleteTiming(s)).length;

    renderSchedules(schedules);

    if (schedules.truncated) {
      setStatus(`بلغ البحث حد ${schedules.nodes} خطوة. النتائج جزئية؛ لا يمكن تأكيد أفضل جدول أو عدم وجود حل. عُرض ${Math.min(10, schedules.length)} اقتراح.`, 'error');
    } else if (schedules.length) {
      setStatus(
        `تم ✅ وجدت ${schedules.totalFound} جدولاً صالحاً من الشعب المقروءة. المعروض أفضل ${Math.min(10, schedules.length)}. استُبعدت ${excluded} شعبة ذات مواعيد غير مؤكدة.`,
        "ok"
      );
    } else {
      setStatus(
        "تم جلب الشعب، لكن ما في جدول كامل يطابق الشروط الحالية.",
        "error"
      );
    }
  } catch (err) {
    console.error(err);
    setStatus(
      `صار خطأ: ${err?.message || err}\n\nإذا الجامعة غيّرت أسماء الحقول، ابعثلي Screenshot أو HTML للنتيجة.`,
      "error"
    );
  } finally {
    button.disabled = false;
  }
}

function openInTab() {
  const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('popup.html?tab=1')
    : 'popup.html?tab=1';

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

function initTabMode() {
  const isFullPage = (typeof window !== 'undefined' && typeof URLSearchParams !== 'undefined')
    ? new URLSearchParams(window.location.search).get('tab') === '1'
    : false;

  if (isFullPage && typeof document !== 'undefined') {
    document.documentElement.classList.add('standalone-tab');
    document.body.classList.add('standalone-tab');
    const btn = $('openTab');
    if (btn) btn.style.display = 'none';
  }
}

const openTabBtn = $("openTab");
if (openTabBtn) {
  openTabBtn.addEventListener("click", openInTab);
}
initTabMode();

$("run").disabled = true;
loadSettings().catch(console.error).finally(() => { $("run").disabled = false; });
$("run").addEventListener("click", run);
