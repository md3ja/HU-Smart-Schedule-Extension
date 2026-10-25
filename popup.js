
"use strict";

const BASE = "https://hu.edu.jo/unitCenter/";
const URL_BY_NUMBER = BASE + "CourseNumber_a.aspx?t=0";
const URL_BY_NAME = BASE + "Corse_Name_a.aspx?t=0";
// HU's own "حسب اسم المادة" navigation currently redirects to this spelling.
const URL_BY_NAME_LEGACY = BASE + "Corse_Name_a.aspx";
const documentUrls = new WeakMap();

const DAY_ORDER = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"
];

const VALID_DAYS = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "السبت"
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
  const {verificationBudget, ...fetchOptions} = options;
  if (verificationBudget && verificationBudget.remaining-- <= 0) {
    throw new Error('انتهى حد طلبات التحقق الاختياري.');
  }
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
    ...fetchOptions
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} من ${url}`);
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  const cleanText = text.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<link[^>]*>/gi, '');
  const doc = new DOMParser().parseFromString(cleanText, "text/html");
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

async function postBack(doc, currentUrl, eventTarget, overrides = {}, eventArgument = "", options = {}) {
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
    body: body.toString(),
    ...options
  });
}

async function submitForm(doc, currentUrl, buttonName, buttonValue, overrides = {}, options = {}) {
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
    body: body.toString(),
    ...options
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

async function setSelect(doc, currentUrl, suffix, wanted, options = {}) {
  const select = findSelect(doc, suffix);
  if (!select) throw new Error(`لم أجد القائمة ${suffix}.`);
  if (select.disabled) throw new Error(`القائمة ${suffix} غير مفعلة بعد.`);

  const optionsList = [...select.options];
  const match = optionsList.find(o => o.value === wanted) ||
                optionsList.find(o => optionTextMatch(o.textContent, wanted));

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
  }, event.argument, options);
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

async function setYearSemester(doc, currentUrl, year, semester, options = {}) {
  doc = await setSelect(doc, currentUrl, "l_year", year, options);
  const selectedYear = findSelect(doc, 'l_year').value;
  doc = await setSelect(doc, currentUrl, "l_sem", semester, options);
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
  return HUSmartSearch.normalize(value).replace(/[()[\]{}]/g, ' ')
    .replace(/(^|\s)و\s+/g, '$1و').replace(/\s+/g, ' ').trim();
}

function groupCourseCandidates(headers, rows, index) {
  const numberIdx = findColumn(headers, ['رقم المادة', 'course number', 'course no']);
  const nameIdx = findColumn(headers, ['اسم المادة', 'course name']);
  const groups = new Map();
  for (const row of rows) {
    const courseNumber = arabicDigitsToAscii(cleanText(row[numberIdx]));
    if (!/^\d{6,}$/.test(courseNumber)) throw new Error('رقم مادة غير صالح في نتائج الجامعة.');
    const title = cleanText(row[nameIdx]);
    const base = title.replace(/\s*\/\s*(?:عملي|نظري)\s*$/, '').trim();
    if (!groups.has(courseNumber)) groups.set(courseNumber, {
      courseNumber, officialName: base, ...index?.byNumber.get(courseNumber), offered: true, components: []
    });
    const candidate = groups.get(courseNumber);
    if (!candidate.components.includes(title)) candidate.components.push(title);
  }
  return [...groups.values()];
}

function matchCourseRows(course, parsed, collectCandidates = false) {
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
  const rows = exact.length && !collectCandidates ? exact : parsed.rows.filter(row => nameKey(row[nameIdx]).includes(query));
  const identities = new Set(rows.map(row => cleanText(row[numberIdx]) || nameKey(row[nameIdx])));
  if (identities.size > 1 && !collectCandidates) {
    const names = [...new Set(rows.map(row => row[numberIdx] + ' — ' + row[nameIdx]))];
    const error = new Error('الاسم يطابق أكثر من مادة؛ استخدم رقم المادة:\n' + names.join('\n'));
    error.courseCandidates = groupCourseCandidates(parsed.headers, rows);
    throw error;
  }
  return rows;
}

async function searchCourse(course, year, semester, serverQuery = course.query, collectCandidates = false, options = {}) {
  let url = course.kind === 'number' ? URL_BY_NUMBER : URL_BY_NAME;
  let doc;
  try { doc = await fetchDoc(url, options); }
  catch (error) {
    if (course.kind !== 'name' || error.status !== 404) throw error;
    url = URL_BY_NAME_LEGACY;
    doc = await fetchDoc(url, options);
  }
  doc = await setYearSemester(doc, url, year, semester, options);
  const expectedYear = findSelect(doc, 'l_year').value;
  const expectedSemester = findSelect(doc, 'l_sem').value;
  const input = findSearchInput(doc);
  if (!input.name) throw new Error('خانة البحث لا تحتوي name.');
  const button = findSearchButton(doc);
  const overrides = {[input.name]: serverQuery};
  if (button.type === 'submit' && button.name) {
    doc = await submitForm(doc, url, button.name, button.value, overrides, options);
  } else if (button.event) {
    doc = await postBack(doc, url, button.event.target, overrides, button.event.argument, options);
  } else if (button.type === 'image' && button.name) {
    doc = await postBack(doc, url, '', {...overrides, [button.name + '.x']: '1', [button.name + '.y']: '1'}, '', options);
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
    doc = await postBack(doc, url, next.target, {}, next.argument, options);
    currentPage++;
  }
  const parsed = {headers, rows};
  const matched = matchCourseRows(course, parsed, collectCandidates);
  // HU's server search is spelling-sensitive (ة/ه, attached/separate و).
  // One broader request is filtered against the ORIGINAL name, never accepted wholesale.
  const firstWord = cleanText(course.query).split(' ')[0];
  if (!matched.length && course.kind === 'name' && serverQuery === course.query && firstWord !== course.query) {
    return searchCourse(course, year, semester, firstWord, collectCandidates, options);
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

const BROAD_TERMS = new Map([
  ...['تدريب','التدريب','Internship','Field Training'].map(q=>[HUSmartSearch.normalize(q),'training']),
  ...['مشروع','مشروع تخرج','Project','Graduation Project'].map(q=>[HUSmartSearch.normalize(q),'project']),
  ...['مختبر','لاب','Lab'].map(q=>[HUSmartSearch.normalize(q),'lab']),
  ...['مواضيع خاصة','Special Topics'].map(q=>[HUSmartSearch.normalize(q),'topics'])
]);
const MAX_OPTIONAL_CANDIDATE_VERIFICATIONS = 4;
const CANDIDATE_VERIFICATION_BUDGET_MS = 4000;
const CANDIDATE_REQUEST_TIMEOUT_MS = 2500;
const CANDIDATE_HTTP_REQUEST_LIMIT = 6;
const smartAvailabilityCache = new Map();
const smartAvailabilityRequests = new Map();
let activeSmartSearchChoice = null;
let smartSearchRevision = 0;

function smartAvailabilityKey(number, year, semester) {
  return JSON.stringify([String(number), String(year), String(semester)]);
}

function cachedSmartAvailability(number, year, semester) {
  const key = smartAvailabilityKey(number, year, semester);
  const cached = smartAvailabilityCache.get(key);
  if (!cached || Date.now() - cached.time > 300000) {
    smartAvailabilityCache.delete(key);
    return null;
  }
  return cached.result;
}

// Deduplicate completed and in-flight number lookups. The explicit timer bounds
// the entire WebForms transaction even if a transport fails to honor abort.
function verifySmartAvailability(course, year, semester, {optional = false, timeoutMs = CANDIDATE_REQUEST_TIMEOUT_MS, forceRefresh = false} = {}) {
  const key = smartAvailabilityKey(course.query, year, semester);
  if (forceRefresh) {
    smartAvailabilityCache.delete(key);
    smartAvailabilityRequests.get(key)?.cancel();
  } else {
    const cached = cachedSmartAvailability(course.query, year, semester);
    if (cached) return Promise.resolve(cached);
    if (smartAvailabilityRequests.has(key)) {
      const existing = smartAvailabilityRequests.get(key);
      // Selection joins the running lookup; a failed optional check can still
      // be retried as the student's explicit request, after that lookup ends.
      return !optional && existing.optional ? existing.promise.catch(() =>
        verifySmartAvailability(course, year, semester)) : existing.promise;
    }
  }
  const controller = new AbortController();
  const entry = {cancel: () => controller.abort(), promise: null, optional};
  let timer;
  const aborted = new Promise((resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('تم إيقاف التحقق.')), {once: true});
    timer = setTimeout(entry.cancel, optional ? timeoutMs : 30000);
  });
  const requestOptions = {signal: controller.signal};
  if (optional) requestOptions.verificationBudget = {remaining: CANDIDATE_HTTP_REQUEST_LIMIT};
  entry.promise = Promise.race([
    Promise.resolve().then(() => searchCourse(course, year, semester, course.query, false, requestOptions)),
    aborted
  ]).then(result => {
    if (controller.signal.aborted || !Array.isArray(result?.rows) || result.error || result.verified === false || result.searchState === 'unknown') throw new Error('تعذر تأكيد طرح المادة.');
    if (smartAvailabilityRequests.get(key) === entry) {
      smartAvailabilityCache.set(key, {result, time: Date.now()});
      if (smartAvailabilityCache.size > 200) smartAvailabilityCache.delete(smartAvailabilityCache.keys().next().value);
    }
    return result;
  }).finally(() => {
    clearTimeout(timer);
    if (smartAvailabilityRequests.get(key) === entry) smartAvailabilityRequests.delete(key);
  });
  smartAvailabilityRequests.set(key, entry);
  return entry.promise;
}
let broadFacultyChoice;
function broadTermFamily(query) { return BROAD_TERMS.get(HUSmartSearch.normalize(query)); }

function getCollegeDisplayName(choice) {
  if (!choice) return '';
  return choice === '*' ? 'كل الكليات' : choice;
}

function updateSharedCollegeUI() {
  const row = $('sharedCollegeRow');
  if (!row) return;
  if (broadFacultyChoice === undefined) {
    row.classList.add('hidden');
    return;
  }
  const nameEl = $('currentCollegeName');
  if (nameEl) {
    nameEl.textContent = getCollegeDisplayName(broadFacultyChoice);
  }
  const feedbackEl = $('sharedCollegeFeedback');
  if (feedbackEl) {
    feedbackEl.classList.add('hidden');
    feedbackEl.textContent = '';
  }
  row.classList.remove('hidden');
}

function chooseCollege(index, forcePrompt = false) {
  if (!forcePrompt && broadFacultyChoice !== undefined) return Promise.resolve(broadFacultyChoice);
  const panel = $('collegePrompt'), options = $('collegeOptions');
  const title = $('collegePromptTitle'), cancelBtn = $('cancelCollege');
  if (title) {
    title.textContent = forcePrompt
      ? 'اختر كلية المواد المشتركة:'
      : 'هذا البحث موجود في أكثر من كلية. اختر كليتك لعرض المواد المناسبة:';
  }
  if (cancelBtn) {
    cancelBtn.textContent = forcePrompt ? 'إلغاء' : 'إلغاء البحث';
  }
  options.replaceChildren();
  panel.classList.remove('hidden');
  panel.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  return new Promise(resolve => {
    const finish = value => {
      panel.classList.add('hidden');
      if (title) title.textContent = 'هذا البحث موجود في أكثر من كلية. اختر كليتك لعرض المواد المناسبة:';
      if (cancelBtn) cancelBtn.textContent = 'إلغاء البحث';
      $('cancelCollege').onclick = null;
      if (value !== null) {
        broadFacultyChoice = value;
        updateSharedCollegeUI();
      }
      resolve(value);
    };
    for (const faculty of [...new Set(index.courses.flatMap(c => c.faculties || []))].sort()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = faculty;
      button.dataset.faculty = faculty;
      button.onclick = () => finish(faculty);
      options.append(button);
    }
    const all = document.createElement('button');
    all.type = 'button';
    all.textContent = 'كل الكليات — قد يستغرق البحث وقتًا أطول';
    all.dataset.faculty = '*';
    all.onclick = () => finish('*');
    options.append(all);
    $('cancelCollege').onclick = () => finish(null);
    options.querySelector('button')?.focus();
  });
}

function chooseSmartCourse(query, candidates, mode = 'ambiguous', verification = null) {
  if (!candidates.length) return Promise.resolve(null);
  activeSmartSearchChoice?.cancel();
  const panel = $('smartSearchChoice'), options = $('smartSearchOptions');
  $('smartSearchTitle').textContent = mode === 'suggestions' ? 'اقتراحات — اختر المادة المقصودة' : 'حدد المادة المقصودة';
  $('smartSearchPrompt').textContent = `البحث: ${query}. ` + (mode === 'ambiguous_alias'
    ? 'هذا الاختصار غير معتمد للاختيار التلقائي. راجع الاسم والرقم قبل المتابعة.'
    : 'لن يستمر البحث إلا بعد اختيارك؛ يمكنك الإلغاء وتعديل الاسم أو الرقم.');
  options.replaceChildren();
  panel.classList.remove('hidden');
  return new Promise(resolve => {
    let active = true, stopped = false, count = 0, startTimer, budgetTimer;
    const pending = new Map(), buttons = new Map(), badges = new Map();
    const inputs = [$('year'), $('semester'), $('courses')].filter(Boolean);
    const originalValues = inputs.map(input => input.value);
    const deadline = Date.now() + CANDIDATE_VERIFICATION_BUDGET_MS;
    const isCurrent = () => {
      if (!active) return false;
      if (panel.classList.contains('hidden') || inputs.some((input, i) => input.value !== originalValues[i])) {
        finish(null);
        return false;
      }
      return true;
    };
    const stopVerification = selected => {
      stopped = true;
      clearTimeout(startTimer);
      clearTimeout(budgetTimer);
      for (const [number, request] of pending) if (number !== selected) request.cancel();
    };
    const finish = course => {
      if (!active) return;
      active = false;
      stopVerification(course?.courseNumber);
      for (const input of inputs) {
        input.removeEventListener('input', changed);
        input.removeEventListener('change', changed);
      }
      options.removeEventListener('scroll', pump);
      if (activeSmartSearchChoice?.cancel === changed) activeSmartSearchChoice = null;
      panel.classList.add('hidden');
      options.replaceChildren();
      $('smartSearchCancel').onclick = null;
      resolve(course);
    };
    const changed = () => finish(null);
    const update = (course, state) => {
      const button = buttons.get(course.courseNumber), badge = badges.get(course.courseNumber);
      button.dataset.availability = state;
      button.classList.toggle('candidate-offered', state === 'offered');
      button.classList.toggle('candidate-missing', state === 'not_offered');
      badge.className = 'badge availability-' + (state === 'offered' ? 'offered' : state === 'not_offered' ? 'missing' : state);
      badge.textContent = {offered: 'متاح هذا الفصل', not_offered: 'غير مطروح هذا الفصل',
        verifying: 'جاري التحقق من الطرح…', unknown: 'لم يُتحقق من الطرح', failed: 'تعذر التحقق من الطرح'}[state];
    };
    const checked = new Set();
    const pump = () => {
      if (!verification || stopped || !isCurrent() || pending.size || count >= MAX_OPTIONAL_CANDIDATE_VERIFICATIONS) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const bounds = options.getBoundingClientRect();
      const visible = course => {
        const rect = buttons.get(course.courseNumber).getBoundingClientRect();
        return bounds.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
      };
      const prioritized = candidates.filter(c => typeof c.offered !== 'boolean' && !checked.has(c.courseNumber)).sort((a, b) =>
        Number(visible(b)) - Number(visible(a)) ||
        Number(!!b.faculties?.includes(verification.faculty)) - Number(!!a.faculties?.includes(verification.faculty)) ||
        HUSmartSearch.candidateRank(verification.index, query, a) - HUSmartSearch.candidateRank(verification.index, query, b) ||
        candidates.indexOf(a) - candidates.indexOf(b));
      const candidate = prioritized[0];
      if (!candidate) return;
      checked.add(candidate.courseNumber);
      count++;
      update(candidate, 'verifying');
      const key = smartAvailabilityKey(candidate.courseNumber, verification.year, verification.semester);
      const promise = verifySmartAvailability({...verification.course, kind: 'number', query: candidate.courseNumber},
        verification.year, verification.semester, {optional: true, timeoutMs: Math.min(remaining, CANDIDATE_REQUEST_TIMEOUT_MS)});
      pending.set(candidate.courseNumber, smartAvailabilityRequests.get(key) || {cancel() {}});
      promise.then(result => {
        if (!isCurrent()) return;
        candidate.offered = result.rows.length > 0;
        candidate.verifiedResult = result;
        candidate.verifiedTerm = {year: String(verification.year), semester: String(verification.semester)};
        update(candidate, candidate.offered ? 'offered' : 'not_offered');
      }).catch(() => {
        if (isCurrent()) update(candidate, 'failed');
      }).finally(() => {
        pending.delete(candidate.courseNumber);
        pump();
      });
    };
    activeSmartSearchChoice = {cancel: changed};
    for (const input of inputs) {
      input.addEventListener('input', changed);
      input.addEventListener('change', changed);
    }
    for (const course of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.courseNumber = course.courseNumber;
      button.className = 'candidate-card' + (course.offered === true ? ' candidate-offered' : (course.offered === false ? ' candidate-missing' : ''));
      const name = document.createElement('strong');
      name.className = 'candidate-name';
      name.textContent = course.officialName;
      const number = document.createElement('bdi');
      number.className = 'candidate-number';
      number.textContent = course.courseNumber;
      button.append(name, number);
      const availability = document.createElement('small');
      availability.setAttribute('role', 'status');
      buttons.set(course.courseNumber, button);
      badges.set(course.courseNumber, availability);
      update(course, course.offered === true ? 'offered' : course.offered === false ? 'not_offered' : 'unknown');
      button.append(availability);
      if (course.context?.length) {
        const context = document.createElement('small');
        context.className = 'candidate-context';
        context.textContent = course.context.join(' / ');
        button.append(context);
      }
      button.onclick = () => { if (isCurrent()) finish(course); };
      options.append(button);
    }
    $('smartSearchCancel').onclick = () => finish(null);
    options.querySelector('button')?.focus();
    options.addEventListener('scroll', pump);
    if (verification) {
      startTimer = setTimeout(pump, 0);
      budgetTimer = setTimeout(() => stopVerification(), CANDIDATE_VERIFICATION_BUDGET_MS);
    }
  });
}

async function searchSmartCourse(course, year, semester, options = {}) {
  const revision = ++smartSearchRevision;
  activeSmartSearchChoice?.cancel();
  const inputs = [$('year'), $('semester'), $('courses')].filter(Boolean);
  const values = inputs.map(input => input.value);
  const isCurrentSearch = () => revision === smartSearchRevision && inputs.every((input, i) => input.value === values[i]);
  const cancelled = () => ({...course, headers: [], rows: [], searchState: 'unknown', searchMessage: 'تم إلغاء البحث السابق.'});
  let index;
  try { index = await getSmartSearchIndex(); }
  catch (error) {
    if (course.kind !== 'number') throw new Error('تعذر تحميل فهرس المواد؛ أعد المحاولة أو استخدم رقم المادة مباشرة.');
  }
  let resolution = index ? HUSmartSearch.resolve(index, course.query) : {state: 'unknown', suggestions: []};
  const family=course.kind==='name'&&broadTermFamily(course.query);
  let faculty='*';
  if(family) {
    faculty=await chooseCollege(index);
    if(faculty===null)return {...course,headers:[],rows:[],searchState:'unknown',searchMessage:'تم إلغاء اختيار الكلية.'};
  }
  const inFaculty=c=>faculty==='*'||c?.faculties?.includes(faculty);
  if (!isCurrentSearch()) return cancelled();
  if (course.kind === 'number') resolution = {state: 'resolved', courseNumber: course.query, course: index?.byNumber.get(course.query)};
  if (resolution.rejected) return {...course,headers:[],rows:[],searchState:'unknown',searchMessage:'مصطلح البحث غير معتمد؛ استخدم اسم المادة أو رقمها.'};
  // Approved aliases have an explicit identity. All other names use both sources.
  if (course.kind !== 'number' && (family || !(resolution.state === 'resolved' && ['approved_alias','exact_alias'].includes(resolution.match)))) {
    let live;
    try {
      const found = await searchCourse(course, year, semester, course.query, true);
      live = groupCourseCandidates(found.headers, found.rows, index).filter(inFaculty);
    } catch (error) {
      if (!error.courseCandidates) throw error;
      live = error.courseCandidates.map(c => ({...c, ...index.byNumber.get(c.courseNumber), offered: true})).filter(inFaculty);
    }
    if (!isCurrentSearch()) return cancelled();
    let local = resolution.course ? [resolution.course] : resolution.candidates || resolution.suggestions || [];
    if(family) {
      const pattern={training:/تدريب/,project:/مشروع/,lab:/مختبر/,topics:/(مواضيع|موضوعات) خاصه/}[family];
      local=[...new Map([...local,...index.courses.filter(c=>pattern.test(c.normalizedName))].map(c=>[c.courseNumber,c])).values()];
    }
    local=local.filter(inFaculty);
    const merged = new Map(live.map(c => [c.courseNumber, c]));
    // Retain all local catalog matches; capping verification must not drop valid courses.
    for (const candidate of local) {
      if (!merged.has(candidate.courseNumber)) {
        merged.set(candidate.courseNumber, {...candidate});
      }
    }
    const normalizedQuery = HUSmartSearch.normalize(course.query);
    for (const candidate of merged.values()) {
      const cached = !options.forceRefresh && cachedSmartAvailability(candidate.courseNumber, year, semester);
      // Newly published live matches supersede an earlier cached absence.
      if (cached && candidate.offered === true && !cached.rows.length) {
        smartAvailabilityCache.delete(smartAvailabilityKey(candidate.courseNumber, year, semester));
      }
      if (cached && candidate.offered !== true) Object.assign(candidate, {
        offered: cached.rows.length > 0, verifiedResult: cached,
        verifiedTerm: {year: String(year), semester: String(semester)}
      });
    }
    const fullNameMatch = candidate => HUSmartSearch.normalize(candidate.officialName) === normalizedQuery;
    const offerScore = c => (c.offered === true ? 1 : (c.offered === false ? -1 : 0));
    const candidates = [...merged.values()].sort((a,b) =>
      HUSmartSearch.candidateRank(index,course.query,a)-HUSmartSearch.candidateRank(index,course.query,b) ||
      offerScore(b) - offerScore(a) ||
      a.courseNumber.localeCompare(b.courseNumber)
    );
    const exact = candidates.filter(fullNameMatch);
    const forceChoice = family || resolution.requiresChoice || resolution.match === 'ambiguous_alias' || resolution.reviewRequired;
    let chosen;
    if (exact.length === 1 && !forceChoice) chosen = exact[0];
    else if (candidates.length && revision === smartSearchRevision) chosen = await chooseSmartCourse(course.query, candidates, resolution.match,
      {course, index, year, semester, faculty: faculty === '*' ? broadFacultyChoice : faculty});
    if (!chosen) return {...course, headers: [], rows: [], searchState: candidates.length ? 'ambiguous' : 'unknown',
      searchMessage: candidates.length ? 'لم يتم اختيار مادة؛ أدخل الاسم الرسمي أو رقم المادة.' : 'لم أجد تطابقًا آمنًا؛ استخدم الاسم الرسمي أو رقم المادة.'};
    resolution = {state: 'resolved', courseNumber: chosen.courseNumber, course: chosen};
  }
  if (!isCurrentSearch()) return cancelled();

  const isConfirmedNotOffered = Boolean(
    !options?.forceRefresh &&
    resolution.course &&
    resolution.course.courseNumber === resolution.courseNumber &&
    resolution.course.offered === false &&
    resolution.course.verifiedResult &&
    resolution.course.verifiedTerm &&
    String(resolution.course.verifiedTerm.year) === String(year) &&
    String(resolution.course.verifiedTerm.semester) === String(semester)
  );

  let result;
  if (isConfirmedNotOffered) {
    result = {
      ...resolution.course.verifiedResult,
      ...course,
      kind: 'number',
      query: resolution.courseNumber,
      label: resolution.course?.officialName || course.label,
      original: course.original || course.label
    };
  } else {
    const request = {...course, kind: 'number', query: resolution.courseNumber, label: resolution.course?.officialName || course.label};
    result = await verifySmartAvailability(request, year, semester, {forceRefresh: !!options.forceRefresh});
  }
  if (!isCurrentSearch()) return cancelled();
  result = {...result, ...course, kind: 'number', query: resolution.courseNumber,
    label: resolution.course?.officialName || course.label, original: course.original || course.label};
  result.resolvedCourseNumber = resolution.courseNumber;
  result.canonicalName = resolution.course?.officialName;
  result.searchState = HUSmartSearch.liveState(resolution.course, result.rows);
  if (result.searchState === 'known_not_offered') {
    result.searchMessage = 'المادة معروفة، لكنها غير مطروحة في الفصل المحدد.';
    result.historicalHint = HUSmartSearch.historicalHint(resolution.course);
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

function to24HourTime(hour12, minute, period) {
  let h = Number(hour12);
  let m = Number(minute);
  if (isNaN(h) || isNaN(m)) return null;
  const p = String(period || '').toUpperCase();
  if (p === 'AM') {
    h = h === 12 ? 0 : h;
  } else if (p === 'PM') {
    h = h === 12 ? 12 : h + 12;
  }
  const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, m))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function from24HourTime(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  const h24 = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h24) || isNaN(m) || h24 < 0 || h24 > 23 || m < 0 || m > 59) return null;
  let period = 'AM';
  let hour = h24;
  if (h24 === 0) {
    hour = 12;
    period = 'AM';
  } else if (h24 === 12) {
    hour = 12;
    period = 'PM';
  } else if (h24 > 12) {
    hour = h24 - 12;
    period = 'PM';
  } else {
    hour = h24;
    period = 'AM';
  }
  return {
    hour,
    minute: String(m).padStart(2, '0'),
    period
  };
}

function validateAndNormalizeMinute(rawVal) {
  if (typeof rawVal !== 'string' && typeof rawVal !== 'number') return null;
  const str = String(rawVal).trim();
  if (!/^\d{1,2}$/.test(str)) return null;
  const num = parseInt(str, 10);
  if (isNaN(num) || num < 0 || num > 59) return null;
  return String(num).padStart(2, '0');
}

function commitMinuteInput(id) {
  const minEl = $(id + 'Minute');
  const canonicalEl = $(id);
  if (!minEl || !canonicalEl) return;

  const normalized = validateAndNormalizeMinute(minEl.value);
  if (normalized === null) {
    // If invalid: restore previous valid canonical minute, do not update canonical, do not regenerate
    const parsed = from24HourTime(canonicalEl.value);
    minEl.value = parsed ? parsed.minute : '00';
    return;
  }

  // Update visual input with normalized 2-digit format (e.g. 7 -> 07)
  minEl.value = normalized;

  // Sync to canonical and trigger change if canonical time actually changed
  syncCanonicalFromTimePicker(id, true);
}

function validateAndNormalizeHour(rawVal) {
  if (typeof rawVal !== 'string' && typeof rawVal !== 'number') return null;
  const str = String(rawVal).trim();
  if (!/^\d{1,2}$/.test(str)) return null;
  const num = parseInt(str, 10);
  if (isNaN(num) || num < 1 || num > 12) return null;
  return String(num);
}

function commitHourInput(id) {
  const hourInput = $(id + 'HourInput') || $(id + 'Hour');
  const canonicalEl = $(id);
  const hourSelect = $(id + 'Hour');
  const triggerVal = $(id + 'HourVal');
  if (!hourInput || !canonicalEl) return;

  const normalized = validateAndNormalizeHour(hourInput.value);
  if (normalized === null) {
    // If invalid: restore previous valid canonical hour, do not update canonical, do not regenerate
    const parsed = from24HourTime(canonicalEl.value);
    const prevHour = parsed ? String(parsed.hour) : (hourSelect ? hourSelect.value : '8');
    hourInput.value = prevHour;
    if (hourSelect) hourSelect.value = prevHour;
    if (triggerVal) triggerVal.textContent = prevHour;
    return;
  }

  hourInput.value = normalized;
  if (hourSelect) hourSelect.value = normalized;
  if (triggerVal) triggerVal.textContent = normalized;

  // Sync to canonical and trigger change if canonical time actually changed
  syncCanonicalFromTimePicker(id, true);
  syncHourDropdownSelected(id);
}

function positionDropdown(menu, trigger) {
  if (!menu || !trigger) return;
  const menuHeight = menu.offsetHeight || 120;
  let triggerRect;
  if (typeof trigger.getBoundingClientRect === 'function') {
    triggerRect = trigger.getBoundingClientRect();
  } else {
    menu.classList.remove('opens-down');
    menu.classList.add('opens-up');
    return;
  }

  let containerTop = 0;
  let containerBottom = (typeof window !== 'undefined' ? (window.innerHeight || document.documentElement?.clientHeight || 600) : 600);
  let containerLeft = 8;
  let containerRight = (typeof window !== 'undefined' ? (window.innerWidth || document.documentElement?.clientWidth || 720) : 720) - 8;

  let parent = trigger.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(parent) : null;
    if (style && (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden')) {
      const rect = parent.getBoundingClientRect();
      if (rect.top > containerTop) containerTop = rect.top;
      if (rect.bottom < containerBottom) containerBottom = rect.bottom;
    }
    parent = parent.parentElement;
  }

  const spaceAbove = triggerRect.top - containerTop;
  const spaceBelow = containerBottom - triggerRect.bottom;

  // Prefer upward opening: open upwards if space above is sufficient or >= space below
  if (spaceAbove >= menuHeight + 8 || spaceAbove >= spaceBelow) {
    menu.classList.remove('opens-down');
    menu.classList.add('opens-up');
  } else {
    menu.classList.remove('opens-up');
    menu.classList.add('opens-down');
  }

  // Horizontal positioning: Ensure the 4x3 grid stays completely inside visible popup boundaries
  const menuWidth = menu.offsetWidth || 160;
  if (triggerRect.left + menuWidth > containerRight) {
    if (triggerRect.right - menuWidth >= containerLeft) {
      menu.style.left = 'auto';
      menu.style.right = '0px';
    } else {
      const overflow = (triggerRect.left + menuWidth) - containerRight;
      menu.style.left = `-${Math.max(0, overflow)}px`;
      menu.style.right = 'auto';
    }
  } else {
    menu.style.left = '0px';
    menu.style.right = 'auto';
  }
}

function scrollHourMenuToSelected(id) {
  const menu = $(id + 'HourMenu');
  if (!menu) return;
  const selectedItem = menu.querySelector('.hour-dropdown-item.is-selected, .hour-grid-item.is-selected');
  if (selectedItem && menu.clientHeight && (menu.scrollHeight > menu.clientHeight || selectedItem.offsetTop > menu.clientHeight / 2)) {
    const itemOffset = selectedItem.offsetTop;
    const itemHeight = selectedItem.offsetHeight || 28;
    const menuHeight = menu.clientHeight;
    menu.scrollTop = Math.max(0, itemOffset - (menuHeight / 2) + (itemHeight / 2));
  } else if (menu.scrollTop) {
    menu.scrollTop = 0;
  }
}

function syncHourDropdownSelected(id, explicitHour = null) {
  const menu = $(id + 'HourMenu');
  const hourSelect = $(id + 'Hour');
  const hourInput = $(id + 'HourInput');
  const canonicalEl = $(id);
  let currentHour = explicitHour;
  if (!currentHour) {
    if (hourInput && hourInput === document.activeElement) {
      currentHour = hourInput.value;
    } else if (hourSelect && hourSelect.value) {
      currentHour = hourSelect.value;
    } else if (hourInput && hourInput.value) {
      currentHour = hourInput.value;
    } else if (canonicalEl) {
      const parsed = from24HourTime(canonicalEl.value);
      if (parsed) currentHour = String(parsed.hour);
    }
  }
  if (!currentHour) currentHour = '8';

  if (hourSelect) hourSelect.value = currentHour;
  if (hourInput && hourInput !== document.activeElement) {
    hourInput.value = currentHour;
  }

  const triggerVal = $(id + 'HourVal');
  if (triggerVal) {
    triggerVal.textContent = currentHour;
  }

  if (!menu) return;
  const items = menu.querySelectorAll('.hour-dropdown-item, .hour-grid-item');
  for (const item of items) {
    const val = item.getAttribute('data-value');
    const isSelected = (val === String(currentHour));
    item.classList.toggle('is-selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  }
}

function openHourDropdown(id) {
  for (const otherId of ['notBefore', 'notAfter']) {
    closeMinuteDropdown(otherId);
    if (otherId !== id) {
      closeHourDropdown(otherId);
    }
  }

  const menu = $(id + 'HourMenu');
  const toggle = $(id + 'HourToggle') || $(id + 'HourTrigger');
  const input = $(id + 'HourInput');
  const combobox = $(id + 'HourCombobox');
  if (!menu) return;

  menu.classList.remove('hidden');
  menu.classList.add('is-open');
  if (toggle) {
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  }
  if (input) {
    input.setAttribute('aria-expanded', 'true');
  }
  if (combobox) {
    combobox.classList.add('is-open');
  }

  syncHourDropdownSelected(id);
  positionDropdown(menu, toggle || input || combobox);
}

function closeHourDropdown(id) {
  const menu = $(id + 'HourMenu');
  const toggle = $(id + 'HourToggle') || $(id + 'HourTrigger');
  const input = $(id + 'HourInput');
  const combobox = $(id + 'HourCombobox');
  if (!menu) return;

  menu.classList.add('hidden');
  menu.classList.remove('is-open');
  if (toggle) {
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false');
  }
  if (combobox) {
    combobox.classList.remove('is-open');
  }

  const items = menu.querySelectorAll('.hour-dropdown-item, .hour-grid-item');
  for (const item of items) {
    item.classList.remove('is-focused');
  }
}

function toggleHourDropdown(id) {
  const menu = $(id + 'HourMenu');
  if (menu && !menu.classList.contains('hidden')) {
    closeHourDropdown(id);
  } else {
    openHourDropdown(id);
  }
}

function isHourDropdownOpen(id) {
  const menu = $(id + 'HourMenu');
  return Boolean(menu && !menu.classList.contains('hidden'));
}

function selectHourDropdownValue(id, value) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1 || num > 12) return;

  const hourInput = $(id + 'HourInput');
  const hourSelect = $(id + 'Hour');
  const triggerVal = $(id + 'HourVal');

  if (hourInput) hourInput.value = String(num);
  if (hourSelect) hourSelect.value = String(num);
  if (triggerVal) triggerVal.textContent = String(num);

  closeHourDropdown(id);
  syncCanonicalFromTimePicker(id, true);
  syncHourDropdownSelected(id);

  if (hourInput && typeof hourInput.focus === 'function') {
    hourInput.focus();
  }
}

function navigateHourGrid(id, key) {
  const menu = $(id + 'HourMenu');
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll('.hour-dropdown-item, .hour-grid-item'));
  if (!items.length) return;

  let currentIdx = items.findIndex(it => it.classList.contains('is-focused'));
  if (currentIdx === -1) {
    currentIdx = items.findIndex(it => it.classList.contains('is-selected'));
  }
  if (currentIdx === -1) currentIdx = 0;

  const totalCols = 4;
  const totalRows = 3;
  let col = Math.floor(currentIdx / totalRows);
  let row = currentIdx % totalRows;

  if (key === 'ArrowDown') {
    row = (row + 1) % totalRows;
  } else if (key === 'ArrowUp') {
    row = (row - 1 + totalRows) % totalRows;
  } else if (key === 'ArrowLeft') {
    // In RTL, ArrowLeft moves to next column to the left: +1 column
    col = (col + 1) % totalCols;
  } else if (key === 'ArrowRight') {
    // In RTL, ArrowRight moves to previous column to the right: -1 column
    col = (col - 1 + totalCols) % totalCols;
  }

  const nextIdx = col * totalRows + row;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('is-focused', i === nextIdx);
  }
}

function navigateHourDropdownItems(id, direction) {
  navigateHourGrid(id, direction > 0 ? 'ArrowDown' : 'ArrowUp');
}

function openMinuteDropdown(id) {
  for (const otherId of ['notBefore', 'notAfter']) {
    closeHourDropdown(otherId);
    if (otherId !== id) {
      closeMinuteDropdown(otherId);
    }
  }

  const menu = $(id + 'MinuteMenu');
  const toggle = $(id + 'MinuteToggle');
  const input = $(id + 'Minute');
  if (!menu) return;

  menu.classList.remove('hidden');
  menu.classList.add('is-open');
  if (toggle) {
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  }
  if (input) {
    input.setAttribute('aria-expanded', 'true');
  }

  syncMinuteDropdownSelected(id);
  positionDropdown(menu, toggle || input || menu.parentElement);
}

function closeMinuteDropdown(id) {
  const menu = $(id + 'MinuteMenu');
  const toggle = $(id + 'MinuteToggle');
  const input = $(id + 'Minute');
  if (!menu) return;

  menu.classList.add('hidden');
  menu.classList.remove('is-open');
  if (toggle) {
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false');
  }

  const items = menu.querySelectorAll('.minute-dropdown-item');
  for (const item of items) {
    item.classList.remove('is-focused');
  }
}

function toggleMinuteDropdown(id) {
  const menu = $(id + 'MinuteMenu');
  if (menu && !menu.classList.contains('hidden')) {
    closeMinuteDropdown(id);
  } else {
    openMinuteDropdown(id);
  }
}

function isMinuteDropdownOpen(id) {
  const menu = $(id + 'MinuteMenu');
  return Boolean(menu && !menu.classList.contains('hidden'));
}

function syncMinuteDropdownSelected(id) {
  const menu = $(id + 'MinuteMenu');
  const minEl = $(id + 'Minute');
  if (!menu || !minEl) return;
  const currentVal = minEl.value;
  const items = menu.querySelectorAll('.minute-dropdown-item');
  for (const item of items) {
    const val = item.getAttribute('data-value');
    const isSelected = (val === currentVal);
    item.classList.toggle('is-selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  }
}

function selectMinuteDropdownValue(id, value) {
  const minEl = $(id + 'Minute');
  if (!minEl) return;

  minEl.value = value;
  closeMinuteDropdown(id);
  commitMinuteInput(id);
  syncMinuteDropdownSelected(id);
}

function navigateMinuteDropdownItems(id, direction) {
  const menu = $(id + 'MinuteMenu');
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll('.minute-dropdown-item'));
  if (!items.length) return;

  const currentIdx = items.findIndex(it => it.classList.contains('is-focused'));
  let nextIdx = 0;
  if (currentIdx !== -1) {
    nextIdx = (currentIdx + direction + items.length) % items.length;
  } else if (direction === -1) {
    nextIdx = items.length - 1;
  }

  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('is-focused', i === nextIdx);
  }
}

function populateTimePickerOptions(id) {
  const hourEl = $(id + 'Hour');
  const minEl = $(id + 'Minute');
  const perEl = $(id + 'Period');

  if (hourEl && hourEl.options && hourEl.options.length === 0) {
    for (let h = 1; h <= 12; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = String(h);
      hourEl.appendChild(opt);
    }
  }

  const hourMenu = $(id + 'HourMenu');
  if (hourMenu && hourMenu.children.length === 0) {
    for (let h = 1; h <= 12; h++) {
      const item = document.createElement('div');
      item.className = 'hour-dropdown-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', String(h));
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
      item.textContent = String(h);
      hourMenu.appendChild(item);
    }
  }

  const menu = $(id + 'MinuteMenu');
  if (menu && menu.children.length === 0) {
    for (const m of ['00', '15', '30', '45']) {
      const item = document.createElement('div');
      item.className = 'minute-dropdown-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', m);
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
      item.textContent = m;
      menu.appendChild(item);
    }
  }

  const datalist = $(id + 'MinuteSuggestions') || (minEl && minEl.getAttribute && $(minEl.getAttribute('list')));
  if (datalist && datalist.options && datalist.options.length === 0) {
    for (const m of ['00', '15', '30', '45']) {
      const opt = document.createElement('option');
      opt.value = m;
      datalist.appendChild(opt);
    }
  }

  if (minEl && minEl.tagName === 'SELECT' && minEl.options && minEl.options.length === 0) {
    for (const m of ['00', '15', '30', '45']) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      minEl.appendChild(opt);
    }
  }

  if (perEl && perEl.options && perEl.options.length === 0) {
    const optAm = document.createElement('option');
    optAm.value = 'AM';
    optAm.textContent = 'صباحاً';
    perEl.appendChild(optAm);

    const optPm = document.createElement('option');
    optPm.value = 'PM';
    optPm.textContent = 'مساءً';
    perEl.appendChild(optPm);
  }
}

function formatTime12hArabic(hour, minute, period) {
  const pText = (String(period || '').toUpperCase() === 'PM') ? 'مساءً' : 'صباحاً';
  return `${hour}:${minute} ${pText}`;
}

function syncTimePickerFromCanonical(id) {
  const canonicalEl = $(id);
  if (!canonicalEl) return;
  const parsed = from24HourTime(canonicalEl.value);
  if (!parsed) return;

  const hourEl = $(id + 'Hour');
  const hourInput = $(id + 'HourInput');
  const minEl = $(id + 'Minute');
  const perEl = $(id + 'Period');

  if (hourEl) hourEl.value = String(parsed.hour);
  if (hourInput && hourInput !== document.activeElement) {
    hourInput.value = String(parsed.hour);
  }
  if (minEl) minEl.value = parsed.minute;
  if (perEl) perEl.value = parsed.period;

  syncHourDropdownSelected(id, String(parsed.hour));
  syncMinuteDropdownSelected(id);

  const toggle = $(id + 'PeriodToggle') || $(id + 'Popover') || $(id + 'Picker');
  if (toggle) {
    const buttons = toggle.querySelectorAll('.period-btn');
    for (const btn of buttons) {
      const p = btn.getAttribute('data-period');
      const isActive = (p === parsed.period);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  const displayBtn = $(id + 'Display');
  if (displayBtn) {
    const valEl = displayBtn.querySelector('.time-display-val');
    const perTextEl = displayBtn.querySelector('.time-display-period');
    const pText = (parsed.period === 'PM') ? 'مساءً' : 'صباحاً';
    if (valEl) valEl.textContent = `${parsed.hour}:${parsed.minute}`;
    if (perTextEl) perTextEl.textContent = pText;
    const labelPrefix = id === 'notBefore' ? 'لا يبدأ قبل: ' : 'لا ينتهي بعد: ';
    displayBtn.setAttribute('aria-label', `${labelPrefix}${parsed.hour}:${parsed.minute} ${pText}`);
  }
}

function syncCanonicalFromTimePicker(id, triggerChange = true) {
  const canonicalEl = $(id);
  const hourSelect = $(id + 'Hour');
  const hourInput = $(id + 'HourInput');
  const minEl = $(id + 'Minute');

  if (!canonicalEl || !minEl) return;

  let hourVal = '8';
  if (hourInput && hourInput === document.activeElement) {
    hourVal = hourInput.value;
  } else if (hourSelect && hourSelect.value) {
    hourVal = hourSelect.value;
  } else if (hourInput && hourInput.value) {
    hourVal = hourInput.value;
  }

  const activeBtn = $(id + 'PeriodToggle')?.querySelector('.period-btn.is-active')
    || $(id + 'Popover')?.querySelector('.period-btn.is-active')
    || $(id + 'Picker')?.querySelector('.period-btn.is-active');
  let period = activeBtn ? activeBtn.getAttribute('data-period') : null;
  if (!period) {
    const perEl = $(id + 'Period');
    period = perEl ? perEl.value : 'AM';
  }

  const normMin = validateAndNormalizeMinute(minEl.value);
  if (!normMin) {
    const parsed = from24HourTime(canonicalEl.value);
    minEl.value = parsed ? parsed.minute : '00';
    return;
  }

  const normHour = validateAndNormalizeHour(hourVal);
  if (!normHour) {
    const parsed = from24HourTime(canonicalEl.value);
    const fallbackHour = parsed ? String(parsed.hour) : '8';
    if (hourInput && hourInput !== document.activeElement) hourInput.value = fallbackHour;
    if (hourSelect) hourSelect.value = fallbackHour;
    return;
  }

  if (hourSelect) hourSelect.value = normHour;
  if (hourInput && hourInput !== document.activeElement) {
    hourInput.value = normHour;
  }

  const hhmm = to24HourTime(normHour, normMin, period);
  if (!hhmm) return;

  const previousVal = canonicalEl.value;
  canonicalEl.value = hhmm;
  syncTimePickerFromCanonical(id);

  if (triggerChange && previousVal !== hhmm) {
    const EventCtor = typeof Event !== 'undefined'
      ? Event
      : canonicalEl.ownerDocument?.defaultView?.Event;
    if (EventCtor) {
      canonicalEl.dispatchEvent(new EventCtor('change', { bubbles: true }));
    }
  }
}

function closeTimePickerPopover(id, returnFocus = false) {
  closeHourDropdown(id);
  closeMinuteDropdown(id);
  const popover = $(id + 'Popover');
  const displayBtn = $(id + 'Display');
  if (popover && !popover.classList.contains('hidden')) {
    popover.classList.add('hidden');
    popover.classList.remove('is-open');
    if (displayBtn) {
      displayBtn.setAttribute('aria-expanded', 'false');
      displayBtn.classList.remove('is-open');
      if (returnFocus && typeof displayBtn.focus === 'function') {
        displayBtn.focus();
      }
    }
  }
}

function openTimePickerPopover(id) {
  const pickerIds = ['notBefore', 'notAfter'];
  for (const otherId of pickerIds) {
    if (otherId !== id) {
      closeTimePickerPopover(otherId, false);
    }
  }
  const popover = $(id + 'Popover');
  const displayBtn = $(id + 'Display');
  if (popover) {
    popover.classList.remove('hidden');
    popover.classList.add('is-open');
    if (displayBtn) {
      displayBtn.setAttribute('aria-expanded', 'true');
      displayBtn.classList.add('is-open');
    }
  }
}

function toggleTimePickerPopover(id) {
  const popover = $(id + 'Popover');
  if (popover && !popover.classList.contains('hidden')) {
    closeTimePickerPopover(id, false);
  } else {
    openTimePickerPopover(id);
  }
}

function closeAllTimePickerPopovers(returnFocusId = null) {
  const pickerIds = ['notBefore', 'notAfter'];
  for (const id of pickerIds) {
    closeTimePickerPopover(id, returnFocusId === id);
  }
}

let timePickerDocListenersBound = false;

function initCustomTimePickers() {
  const pickerIds = ['notBefore', 'notAfter'];
  for (const id of pickerIds) {
    populateTimePickerOptions(id);
    syncTimePickerFromCanonical(id);

    const displayBtn = $(id + 'Display');
    if (displayBtn && !displayBtn._popoverBound) {
      displayBtn._popoverBound = true;
      displayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleTimePickerPopover(id);
      });
    }

    const popover = $(id + 'Popover');
    if (popover && !popover._popoverBound) {
      popover._popoverBound = true;
      popover.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    const hourEl = $(id + 'Hour');
    const minEl = $(id + 'Minute');
    const perEl = $(id + 'Period');

    if (hourEl && !hourEl._changeBound) {
      hourEl._changeBound = true;
      hourEl.addEventListener('change', () => {
        const hourInput = $(id + 'HourInput');
        if (hourInput && hourInput !== document.activeElement) {
          hourInput.value = hourEl.value;
        }
        syncCanonicalFromTimePicker(id, true);
        syncHourDropdownSelected(id, hourEl.value);
      });
    }

    const hourInput = $(id + 'HourInput');
    if (hourInput && !hourInput._bound) {
      hourInput._bound = true;
      hourInput.addEventListener('focus', () => {
        closeMinuteDropdown(id);
        if (typeof hourInput.select === 'function') {
          hourInput.select();
        }
      });
      hourInput.addEventListener('change', () => {
        commitHourInput(id);
      });
      hourInput.addEventListener('blur', () => {
        closeHourDropdown(id);
        commitHourInput(id);
      });
      hourInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (isHourDropdownOpen(id)) {
            const focusedItem = $(id + 'HourMenu')?.querySelector('.hour-dropdown-item.is-focused, .hour-grid-item.is-focused');
            if (focusedItem) {
              e.preventDefault();
              const val = focusedItem.getAttribute('data-value');
              selectHourDropdownValue(id, val);
              return;
            }
          }
          e.preventDefault();
          closeHourDropdown(id);
          commitHourInput(id);
          if (typeof hourInput.blur === 'function') {
            hourInput.blur();
          }
        } else if (e.key === 'Escape' || e.key === 'Esc') {
          if (isHourDropdownOpen(id)) {
            e.preventDefault();
            e.stopPropagation();
            closeHourDropdown(id);
          }
        } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          if (!isHourDropdownOpen(id)) {
            openHourDropdown(id);
          }
          navigateHourGrid(id, e.key);
        }
      });
    }

    const hourToggle = $(id + 'HourToggle') || $(id + 'HourTrigger');
    if (hourToggle && !hourToggle._bound) {
      hourToggle._bound = true;
      hourToggle.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      hourToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMinuteDropdown(id);
        toggleHourDropdown(id);
      });
      hourToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (isHourDropdownOpen(id)) {
            const focusedItem = $(id + 'HourMenu')?.querySelector('.hour-dropdown-item.is-focused, .hour-grid-item.is-focused');
            if (focusedItem) {
              const val = focusedItem.getAttribute('data-value');
              selectHourDropdownValue(id, val);
              return;
            }
          }
          toggleHourDropdown(id);
        } else if (e.key === 'Escape' || e.key === 'Esc') {
          if (isHourDropdownOpen(id)) {
            e.preventDefault();
            e.stopPropagation();
            closeHourDropdown(id);
          }
        } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          if (!isHourDropdownOpen(id)) {
            openHourDropdown(id);
          }
          navigateHourGrid(id, e.key);
        }
      });
    }

    const hourMenu = $(id + 'HourMenu');
    if (hourMenu && !hourMenu._menuBound) {
      hourMenu._menuBound = true;
      hourMenu.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.hour-dropdown-item, .hour-grid-item');
        if (item) e.preventDefault();
      });
      hourMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.hour-dropdown-item, .hour-grid-item');
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          const val = item.getAttribute('data-value');
          selectHourDropdownValue(id, val);
        }
      });
    }

    const toggleBtn = $(id + 'MinuteToggle');
    if (toggleBtn && !toggleBtn._toggleBound) {
      toggleBtn._toggleBound = true;
      toggleBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeHourDropdown(id);
        toggleMinuteDropdown(id);
      });
    }

    const minuteMenu = $(id + 'MinuteMenu');
    if (minuteMenu && !minuteMenu._menuBound) {
      minuteMenu._menuBound = true;
      const items = minuteMenu.querySelectorAll('.minute-dropdown-item');
      for (const item of items) {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const val = item.getAttribute('data-value');
          selectMinuteDropdownValue(id, val);
        });
      }
    }

    if (minEl && !minEl._changeBound) {
      minEl._changeBound = true;
      minEl.addEventListener('change', () => {
        commitMinuteInput(id);
        syncMinuteDropdownSelected(id);
      });
      minEl.addEventListener('blur', () => {
        closeMinuteDropdown(id);
        commitMinuteInput(id);
        syncMinuteDropdownSelected(id);
      });
      minEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (isMinuteDropdownOpen(id)) {
            const focusedItem = $(id + 'MinuteMenu')?.querySelector('.minute-dropdown-item.is-focused');
            if (focusedItem) {
              e.preventDefault();
              const val = focusedItem.getAttribute('data-value');
              selectMinuteDropdownValue(id, val);
              return;
            }
          }
          e.preventDefault();
          closeMinuteDropdown(id);
          commitMinuteInput(id);
          if (typeof minEl.blur === 'function') {
            minEl.blur();
          }
        } else if (e.key === 'Escape' || e.key === 'Esc') {
          if (isMinuteDropdownOpen(id)) {
            e.preventDefault();
            e.stopPropagation();
            closeMinuteDropdown(id);
            return;
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!isMinuteDropdownOpen(id)) {
            openMinuteDropdown(id);
          }
          navigateMinuteDropdownItems(id, 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isMinuteDropdownOpen(id)) {
            openMinuteDropdown(id);
          }
          navigateMinuteDropdownItems(id, -1);
        }
      });
      minEl.addEventListener('focus', () => {
        closeHourDropdown(id);
        if (typeof minEl.select === 'function') {
          minEl.select();
        }
      });
    }
    if (perEl && !perEl._changeBound) {
      perEl._changeBound = true;
      perEl.addEventListener('change', () => {
        const targetPeriod = perEl.value;
        const toggle = $(id + 'PeriodToggle') || $(id + 'Popover') || $(id + 'Picker');
        if (toggle) {
          const buttons = toggle.querySelectorAll('.period-btn');
          for (const b of buttons) {
            const isActive = (b.getAttribute('data-period') === targetPeriod);
            b.classList.toggle('is-active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        }
        syncCanonicalFromTimePicker(id, true);
      });
    }

    const toggle = $(id + 'PeriodToggle') || $(id + 'Popover') || $(id + 'Picker');
    if (toggle && !toggle._clickBound) {
      toggle._clickBound = true;
      const buttons = toggle.querySelectorAll('.period-btn');
      for (const btn of buttons) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetPeriod = btn.getAttribute('data-period');
          const currentActive = toggle.querySelector('.period-btn.is-active');
          if (currentActive && currentActive.getAttribute('data-period') === targetPeriod) {
            return;
          }
          for (const b of buttons) {
            const isActive = (b === btn);
            b.classList.toggle('is-active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
          if (perEl) perEl.value = targetPeriod;
          syncCanonicalFromTimePicker(id, true);
        });
      }
    }

    const canonicalEl = $(id);
    if (canonicalEl && !canonicalEl._pickerSyncBound) {
      canonicalEl._pickerSyncBound = true;
      canonicalEl.addEventListener('change', () => {
        syncTimePickerFromCanonical(id);
      });
    }
  }

  if (!timePickerDocListenersBound && typeof document !== 'undefined') {
    timePickerDocListenersBound = true;
    document.addEventListener('click', (e) => {
      for (const id of ['notBefore', 'notAfter']) {
        const hourCombobox = $(id + 'HourCombobox');
        if (hourCombobox && !hourCombobox.contains(e.target)) {
          closeHourDropdown(id);
        }
        const combobox = $(id + 'MinuteCombobox');
        if (combobox && !combobox.contains(e.target)) {
          closeMinuteDropdown(id);
        }
      }
      closeAllTimePickerPopovers();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        let closedDropdown = false;
        for (const id of ['notBefore', 'notAfter']) {
          if (isHourDropdownOpen(id)) {
            closeHourDropdown(id);
            closedDropdown = true;
          }
          if (isMinuteDropdownOpen(id)) {
            closeMinuteDropdown(id);
            closedDropdown = true;
          }
        }
        if (closedDropdown) {
          e.stopPropagation();
          return;
        }

        for (const id of ['notBefore', 'notAfter']) {
          const pop = $(id + 'Popover');
          if (pop && !pop.classList.contains('hidden')) {
            closeTimePickerPopover(id, true);
            break;
          }
        }
      }
    });
  }
}

function syncRankingChipsFromCanonical() {
  const rankingEl = $('ranking');
  if (!rankingEl) return;
  const currentVal = rankingEl.value || 'balanced';
  const chips = document.querySelectorAll('.ranking-chip');
  for (const c of chips) {
    const isSelected = (c.getAttribute('data-ranking') === currentVal);
    c.classList.toggle('is-active', isSelected);
    c.classList.toggle('active', isSelected);
    c.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    c.setAttribute('tabindex', isSelected ? '0' : '-1');
  }
}

function selectRankingChip(rankingValue, focusTarget = false) {
  const rankingEl = $('ranking');
  if (!rankingEl) return;
  if (rankingEl.value === rankingValue) {
    if (focusTarget) {
      const chip = document.querySelector(`.ranking-chip[data-ranking="${rankingValue}"]`);
      if (chip && typeof chip.focus === 'function') chip.focus();
    }
    return;
  }
  rankingEl.value = rankingValue;
  syncRankingChipsFromCanonical();
  if (focusTarget) {
    const chip = document.querySelector(`.ranking-chip[data-ranking="${rankingValue}"]`);
    if (chip && typeof chip.focus === 'function') chip.focus();
  }
  const EventCtor = typeof Event !== 'undefined'
    ? Event
    : rankingEl.ownerDocument?.defaultView?.Event;
  if (EventCtor) {
    rankingEl.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }
}

function initRankingChips() {
  syncRankingChipsFromCanonical();

  const chips = Array.from(document.querySelectorAll('.ranking-chip'));
  for (const chip of chips) {
    if (chip._boundRankingChip) continue;
    chip._boundRankingChip = true;

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const val = chip.getAttribute('data-ranking');
      selectRankingChip(val, false);
    });

    chip.addEventListener('keydown', (e) => {
      const currentList = Array.from(document.querySelectorAll('.ranking-chip'));
      const currentIndex = currentList.indexOf(chip);
      if (currentIndex === -1) return;

      let nextIndex = -1;
      // In RTL layout: ArrowLeft moves visually forward (next), ArrowRight moves visually backward (prev)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % currentList.length;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + currentList.length) % currentList.length;
      } else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault();
        selectRankingChip(chip.getAttribute('data-ranking'), true);
        return;
      }

      if (nextIndex !== -1) {
        const nextChip = currentList[nextIndex];
        const nextVal = nextChip.getAttribute('data-ranking');
        selectRankingChip(nextVal, true);
      }
    });
  }

  const rankingEl = $('ranking');
  if (rankingEl && !rankingEl._rankingChipsBound) {
    rankingEl._rankingChipsBound = true;
    rankingEl.addEventListener('change', () => {
      syncRankingChipsFromCanonical();
    });
  }
}

function formatTimeRange(start, end) {
  return `${minutesToTime(start)}–${minutesToTime(end)}`;
}

function formatTimeRangeHtml(start, end) {
  return `<bdi dir="ltr">${formatTimeRange(start, end)}</bdi>`;
}

function formatTimeRangeText(start, end) {
  const LRM = '\u200E';
  return `${LRM}${formatTimeRange(start, end)}${LRM}`;
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

function determineMeetingDelivery(day, isChunkRemote, isSectionBlended, isChunkBlended, daysInChunk) {
  if (isChunkRemote) {
    return { attendanceMode: 'remote', remote: true, displayMode: 'remote' };
  }
  if (isSectionBlended || isChunkBlended) {
    if (day === 'الخميس') {
      // Standard HU rule: Thursday in a blended course is the remote meeting
      return { attendanceMode: 'remote', remote: true, displayMode: 'blended' };
    }
    const isSTT = daysInChunk.length > 0 && daysInChunk.every(d => ['الأحد', 'الثلاثاء', 'الخميس'].includes(d));
    if (isSTT && (day === 'الأحد' || day === 'الثلاثاء')) {
      return { attendanceMode: 'campus', remote: false, displayMode: 'campus' };
    }
    const isMW = daysInChunk.length > 0 && daysInChunk.every(d => ['الاثنين', 'الأربعاء'].includes(d));
    if (isMW) {
      if (day === 'الاثنين') {
        return { attendanceMode: 'campus', remote: false, displayMode: 'campus' };
      }
      if (day === 'الأربعاء') {
        return { attendanceMode: 'remote', remote: true, displayMode: 'blended' };
      }
    }
    if (daysInChunk.length > 0 && daysInChunk.every(d => d === 'السبت')) {
      return { attendanceMode: 'campus', remote: false, displayMode: 'blended' };
    }
    // Ambiguous non-standard blended:
    // Conservatively treat as campus attendance for metrics, but preserve blended displayMode.
    return { attendanceMode: 'campus', remote: false, displayMode: 'blended' };
  }
  return { attendanceMode: 'campus', remote: false, displayMode: 'campus' };
}

function parseMeetingDetails(headers, cells) {
  const meetings = [];
  const warnings = [];
  const empty = text => {
    const cl = cleanText(text).replace(/&nbsp;/gi, ' ').trim();
    return !cl || /^[-—–]+$/.test(cl);
  };
  const dayIdx = findColumn(headers, ['الأيام', 'اليوم', 'days', 'day']);
  const timeIndexes = headers.map((h, i) => ({h: normalizeArabic(h), i})).filter(({h}) =>
    /موعد|وقت|توقيت|محاضر|schedule|time/.test(h)
  ).map(x => x.i);
  const weekdayIndexes = headers.map((h,i) => canonicalDay(h) ? i : -1).filter(i=>i>=0);
  const indexes = [...new Set([...weekdayIndexes, ...timeIndexes])];
  if (!indexes.length) warnings.push('أعمدة المواعيد غير معروفة');

  const fullText = indexes.map(i => cells[i] || '').join(' ');
  const isSectionBlended = /بشكل مدمج|مدمج/.test(fullText);

  const add = (days, range, meta = false) => {
    if (!days.length || range.start == null || range.end == null) { warnings.push('يوم أو وقت غير معروف'); return; }
    const isRemote = typeof meta === 'boolean' ? meta : !!meta?.remote;
    const isBlended = typeof meta === 'object' && !!meta?.blended;
    days.forEach(day => {
      const delivery = (typeof meta === 'object' && meta?.explicitDelivery)
        ? meta.explicitDelivery
        : determineMeetingDelivery(day, isRemote, isSectionBlended, isBlended, days);
      meetings.push({
        day,
        start: range.start,
        end: range.end,
        attendanceMode: delivery.attendanceMode,
        remote: delivery.remote,
        displayMode: delivery.displayMode,
        ...meta.location
      });
    });
  };

  for (const i of indexes) {
    const text = cells[i] || '';
    if (empty(text)) continue;
    const headerDay = canonicalDay(headers[i]);
    const externalDays = dayIdx >= 0 ? explicitDaysInText(cells[dayIdx]) : [];
    const chunks = HURoomLocationParser.splitMeetingChunks(text)
      .flatMap(chunk => chunk.split(/;|؛|\|/)).filter(t => !empty(t));
    for (const chunk of chunks) {
      const isChunkRemote = /تدرس عن بعد/.test(chunk);
      const isChunkBlended = isSectionBlended || /بشكل مدمج|مدمج/.test(chunk);
      // Timing-only cells contain no location payload to classify as unknown.
      const locationSource = chunk.includes('/') || /(?:^|\s)في(?:\s|$)/u.test(chunk) ? chunk : '';
      const chunkMeta = { remote: isChunkRemote, blended: isChunkBlended,
        location: HURoomLocationParser.parseMeetingLocation(locationSource) };
      const ranges = extractRanges(chunk);
      if (!ranges.length) {
        const timingPart = chunk.split('/')[0];
        const stripped = cleanText(timingPart)
          .replace(/&nbsp;/gi, ' ')
          .replace(/(?:المادة\s+)?(?:تدرس\s+)?(?:وجاهي(?:ا)?|عن\s+بعد|(?:بشكل\s+)?مدمج)(?:\s+في)?/g, '')
          .replace(/\bفي\b|في/g, '')
          .replace(/[-—–\s،,;/|()[\]{}:]+/g, '')
          .trim();
        const hasDigits = /[0-9٠-٩۰-۹]/.test(timingPart);
        const hasDays = explicitDaysInText(timingPart).length > 0;
        const hasTbd = /\b(tba|tbd)\b|غير محدد|يحدد/i.test(timingPart);
        const hasUnknown = hasUnknownDays(timingPart) && stripped.length > 0;
        const hasIntendedSchedule = hasDigits || hasDays || hasTbd || hasUnknown || stripped.length > 0 || (headerDay && !empty(chunk));
        if (hasIntendedSchedule) {
          warnings.push('موعد غير مقروء: ' + cleanText(chunk));
        }
        continue;
      }
      if (headerDay) { ranges.forEach(r => add([headerDay], r, chunkMeta)); continue; }
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
        add(days.length ? days : (ranges.length === 1 ? externalDays : []), range, chunkMeta);
      });
      // A second malformed range or TBD meeting must not be silently dropped.
      const uncovered = normalized.split('/')[0];
      let rest = uncovered;
      for (const r of ranges) rest = rest.replace(r.raw, '');
      if (/\d|غير محدد|يحدد|tba|tbd/i.test(rest)) warnings.push('جزء من الموعد غير مقروء');
    }
  }
  // Distinct concurrent rooms/modalities must survive for safe exception matching.
  const unique = [...new Map(meetings.map(m => [
    JSON.stringify([getMeetingKey(m), m.building, m.onlinePlatform]), m
  ])).values()];
  for (let i = 0; i < unique.length; i++) {
    if (unique.slice(i+1).some(m => conflicts(unique[i], m))) warnings.push('تعارض داخل الشعبة');
  }

  let timingType = 'scheduled';
  let isUnscheduled = false;
  let complete = warnings.length === 0;

  if (!unique.length) {
    if (warnings.length > 0) {
      timingType = 'unparseable';
      complete = false;
      isUnscheduled = false;
    } else {
      const allTimingText = indexes.map(i => (cells[i] || '').split('/')[0]).join(' ');
      if (/[0-9٠-٩۰-۹]/.test(allTimingText) || explicitDaysInText(allTimingText).length > 0 || /\b(tba|tbd)\b|غير محدد|يحدد/i.test(allTimingText)) {
        timingType = 'unparseable';
        complete = false;
        isUnscheduled = false;
        warnings.push('تعذر قراءة الموعد المنشور');
      } else {
        timingType = 'unscheduled';
        complete = true;
        isUnscheduled = true;
      }
    }
  } else {
    if (warnings.length > 0) {
      timingType = 'unparseable';
      complete = false;
      isUnscheduled = false;
    } else {
      timingType = 'scheduled';
      complete = true;
      isUnscheduled = false;
    }
  }

  const deliveryScheme = isSectionBlended || /بشكل مدمج|مدمج/.test(fullText) ? 'blended' :
    /تدرس عن بعد/.test(fullText) ? 'remote' :
    (unique.length ? (unique.every(m => m.remote) ? 'remote' : unique.some(m => m.remote) ? 'mixed' : 'campus') : 'unspecified');

  return {meetings: unique, warnings: [...new Set(warnings)], complete, timingType, isUnscheduled, deliveryScheme};
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
      courseKey: courseResult.original, courseLabel: courseResult.canonicalName || detectedName || courseResult.label || courseResult.query,
      query: courseResult.query, section: section || 'غير معروفة', courseNumber: detectedNumber,
      detectedName, meetings: [], warnings: [], complete: true, instructors: [], cells, headers, raw: '',
      deliveryScheme: details.deliveryScheme || 'campus',
      timingType: details.timingType || (details.complete ? (details.meetings.length ? 'scheduled' : 'unscheduled') : 'unparseable'),
      isUnscheduled: !!details.isUnscheduled,
      rowDetails: []
    });
    const group = groups.get(key);
    group.meetings.push(...details.meetings);
    group.complete &&= details.complete;
    group.warnings.push(...details.warnings);
    group.rowDetails.push(details);
    if (details.deliveryScheme === 'blended' || /بشكل مدمج|مدمج/.test(group.raw)) {
      group.deliveryScheme = 'blended';
    } else if (group.deliveryScheme !== 'blended') {
      group.deliveryScheme = details.deliveryScheme;
    }
    if (cells[instructorIdx]) group.instructors.push(cleanText(cells[instructorIdx]));
    group.raw += (group.raw ? '\n' : '') + cells.join(' | ');
  });
  return [...groups.values()].map(group => {
    // Raw-location formatting differences do not create extra live meetings.
    group.meetings = [...new Map(group.meetings.map(m => [
      JSON.stringify([getMeetingKey(m), m.building, m.onlinePlatform]), m
    ])).values()];
    group.instructors = [...new Set(group.instructors)];
    group.warnings = [...new Set(group.warnings)];

    if (group.meetings.some((m,i) => group.meetings.slice(i+1).some(n => conflicts(m,n)))) {
      group.complete = false; group.warnings.push('تعارض داخل الشعبة');
    }

    if (group.meetings.length > 0) {
      group.isUnscheduled = false;
      group.timingType = group.complete ? 'scheduled' : 'unparseable';
      if (!group.deliveryScheme || group.deliveryScheme === 'campus' || group.deliveryScheme === 'unspecified') {
        if (/بشكل مدمج|مدمج/.test(group.raw) || group.meetings.some(m => m.displayMode === 'blended')) {
          group.deliveryScheme = 'blended';
        } else if (group.meetings.length && group.meetings.every(m => m.remote)) {
          group.deliveryScheme = 'remote';
        } else if (group.meetings.some(m => m.remote)) {
          group.deliveryScheme = 'mixed';
        } else {
          group.deliveryScheme = 'campus';
        }
      }
    } else {
      const hasUnparseable = group.rowDetails?.some(d => d.timingType === 'unparseable') || group.warnings.length > 0 || !group.complete;
      if (hasUnparseable) {
        group.timingType = 'unparseable';
        group.isUnscheduled = false;
        group.complete = false;
      } else {
        group.timingType = 'unscheduled';
        group.isUnscheduled = true;
        group.complete = true;
        group.deliveryScheme = group.deliveryScheme === 'blended' || group.deliveryScheme === 'remote' ? group.deliveryScheme : 'unspecified';
      }
    }
    delete group.rowDetails;
    return group;
  });
}



// ----------------------------- Schedule engine -----------------------------

function validWeekMeeting(meeting) {
  return VALID_DAYS.includes(meeting.day) && Number.isFinite(meeting.start) &&
    Number.isFinite(meeting.end) && meeting.start >= 0 && meeting.end <= 1440 &&
    meeting.end > meeting.start;
}

function hasCompleteTiming(section) {
  return section.complete === true && section.meetings.length > 0 &&
    section.meetings.every(validWeekMeeting);
}

function isValidSchedulingSection(section) {
  return hasCompleteTiming(section) || section.isUnscheduled === true;
}

function courseIdentity(section, fallback = '') {
  const number = arabicDigitsToAscii(cleanText(section.courseNumber || ''));
  return number ? 'number:' + number : 'name:' + nameKey(
    section.detectedName || section.courseLabel || section.courseKey || fallback
  );
}

// ----------------------- Per-course rules & Phase 3 Meeting Exceptions -----------------------
function createCourseRule(overrides = {}) {
  const currentTermSig = (typeof workflowSession !== 'undefined' && workflowSession?.term)
    ? `${workflowSession.term.year}_${workflowSession.term.semester}`
    : '';
  let exceptedSectionMeetings = new Map();
  if (overrides.exceptedSectionMeetings instanceof Map) {
    exceptedSectionMeetings = new Map(overrides.exceptedSectionMeetings);
  } else if (overrides.exceptedSectionMeetings && typeof overrides.exceptedSectionMeetings === 'object') {
    for (const [k, v] of Object.entries(overrides.exceptedSectionMeetings)) {
      exceptedSectionMeetings.set(String(k), v instanceof Set ? new Set(v) : new Set(v || []));
    }
  }
  return {
    ignoreDaysOff: false,
    ignoreNotBefore: false,
    ignoreNotAfter: false,
    excludedFromGeneration: false,
    allowedDayPattern: null,
    termSignature: currentTermSig,
    exceptedSectionMeetings,
    ...overrides
  };
}

function getCourseRule(courseRules, courseKey) {
  if (!courseRules || typeof courseRules.get !== 'function') return null;
  if (!courseKey) return null;
  if (courseRules.has(courseKey)) return courseRules.get(courseKey);

  // Cross-reference with workflowSession entries if active
  if (typeof workflowSession !== 'undefined' && workflowSession?.entries) {
    for (const entry of workflowSession.entries) {
      const match =
        entry.id === courseKey ||
        entry.result?.original === courseKey ||
        entry.result?.resolvedCourseNumber === courseKey ||
        entry.result?.label === courseKey ||
        entry.result?.canonicalName === courseKey ||
        entry.result?.query === courseKey ||
        (entry.sections && entry.sections.some(s =>
          s.courseKey === courseKey ||
          s.courseNumber === courseKey ||
          s.courseLabel === courseKey ||
          s.detectedName === courseKey ||
          s.courseEntryId === courseKey
        ));
      if (match) {
        const candidates = [
          entry.id,
          entry.result?.original,
          entry.result?.resolvedCourseNumber,
          entry.result?.canonicalName,
          entry.result?.label,
          entry.result?.query,
          ...(entry.sections ? entry.sections.map(s => s.courseKey) : []),
          ...(entry.sections ? entry.sections.map(s => s.courseNumber) : []),
          ...(entry.sections ? entry.sections.map(s => s.courseLabel) : []),
          ...(entry.sections ? entry.sections.map(s => s.courseEntryId) : [])
        ].filter(Boolean);
        for (const candidateKey of candidates) {
          if (courseRules.has(candidateKey)) return courseRules.get(candidateKey);
        }
      }
    }
  }

  // Fallback: normalized comparison across all keys in courseRules
  const normKey = normalizeArabic(courseKey).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normKey) {
    for (const [k, v] of courseRules.entries()) {
      if (k && normalizeArabic(k).replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === normKey) {
        return v;
      }
    }
  }
  return null;
}

function isProjectCourse(courseName) {
  if (!courseName || typeof courseName !== 'string') return false;
  const normalized = normalizeArabic(courseName);

  // Clean tokens (Unicode letters & numbers)
  const clean = normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  // Strict Negative Exclusions: 3-credit Business lectures with plural "مشروعات"
  // E.g.: "إدارة مشروعات صغيرة", "تقييم مشروعات استثمارية", "تخطيط مشاريع"
  const hasManagementPrefix = tokens.some(t => /^(اداره|تقييم|تخطيط|دراسه)$/.test(t));
  const hasProjectsWord = tokens.some(t => /^(مشروع|مشروعات|مشاريع)$/.test(t));
  if (hasManagementPrefix && hasProjectsWord) {
    return false;
  }

  // Positive Arabic Project Keywords:
  // 1. "مشروع تخرج", "مشروع التخرج", "مشروع بحث", "مشروع تطبيق", "مشروع هندسي", "مشروع بحث و ندوة"
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'مشروع') {
      const next = tokens[i + 1];
      if (next && /^(تخرج|التخرج|بحث|البحث|تطبيقي|التطبيقي|هندسي|الهندسي|ندوه|في|ضمن)$/.test(next)) {
        return true;
      }
      // If "مشروع" is the first token and followed by a number or course specifier
      if (i === 0 && tokens.length >= 2) {
        return true;
      }
    }
  }

  // English Keywords
  if (/(?:^|[^\p{L}\p{N}])(graduation\s+project|capstone(\s+project|\s+design)?|senior\s+(project|design)|research\s+project)(?:$|[^\p{L}\p{N}])/iu.test(courseName)) {
    return true;
  }

  return false;
}

function getMeetingKey(meeting) {
  if (!meeting) return '';
  const day = meeting.day || '';
  const start = meeting.start ?? '';
  const end = meeting.end ?? '';
  const mode = meeting.attendanceMode || (meeting.remote ? 'remote' : (meeting.displayMode === 'blended' ? 'blended' : 'campus'));
  const roomTag = meeting.room ? `:${cleanText(meeting.room)}` : '';
  return `${day}:${start}-${end}:${mode}${roomTag}`;
}

function isMeetingEligibleForException(courseLabel, section, meeting) {
  if (!section || section.isUnscheduled || !meeting) return false;

  const isRemoteMeeting = Boolean(meeting.remote || meeting.isRemote || meeting.attendanceMode === 'remote' || meeting.displayMode === 'remote');
  if (isRemoteMeeting) return false;

  const courseTitle = courseLabel || section.courseLabel || section.courseNumber || '';
  const isProj = isProjectCourse(courseTitle);

  if (isProj) {
    const distinctDays = new Set((section.meetings || []).map(m => m.day));
    const isSingleDay = distinctDays.size === 1;
    const isLate = typeof meeting.start === 'number' && meeting.start >= 18 * 60;
    const isSat = meeting.day === 'السبت';
    const isExtended = typeof meeting.start === 'number' && typeof meeting.end === 'number' && (meeting.end - meeting.start) >= 180;
    return isSingleDay || isLate || isSat || isExtended;
  }

  // Non-project outliers
  const isExtremeLate = (typeof meeting.start === 'number' && meeting.start >= 20 * 60) ||
                        (typeof meeting.end === 'number' && meeting.end >= 21 * 60);
  if (isExtremeLate) return true;

  const isExtremeDuration = (typeof meeting.start === 'number' && typeof meeting.end === 'number') &&
                            (meeting.end - meeting.start) >= 360;
  if (isExtremeDuration) return true;

  return false;
}

function isMeetingProactiveCandidate(courseLabel, section, meeting) {
  return isMeetingEligibleForException(courseLabel, section, meeting);
}

function meetingRequiresConfirmation(courseLabel, section, meeting) {
  const courseTitle = courseLabel || section.courseLabel || section.courseNumber || '';
  if (isProjectCourse(courseTitle)) return false;
  return isMeetingEligibleForException(courseLabel, section, meeting);
}

function matchingMeetingExceptionKeys(section, meeting, sectionExceptions) {
  const mKey = getMeetingKey(meeting);
  const isRemote = m => Boolean(m.remote || m.attendanceMode === 'remote' || m.displayMode === 'remote');
  const live = (section.meetings || []).filter(m => m.day === meeting.day &&
    m.start === meeting.start && m.end === meeting.end && isRemote(m) === isRemote(meeting));
  // A stale or indistinguishable meeting must never acquire another's exception.
  if (live.filter(m => getMeetingKey(m) === mKey).length !== 1) return [];
  const timeSig = `${meeting.day}:${meeting.start}-${meeting.end}`;
  return [...sectionExceptions].filter(key => {
    if (key === mKey) return true;
    // Room updates and legacy blended/campus keys are safe only for one live
    // meeting of that modality. Require an exact day/time boundary, not a prefix.
    if (live.length !== 1 || typeof key !== 'string') return false;
    const parts = key.split(':');
    return `${parts[0]}:${parts[1]}` === timeSig &&
      ['campus', 'blended', 'remote'].includes(parts[2]) &&
      (parts[2] === 'remote') === isRemote(meeting);
  });
}

function isMeetingExcepted(section, meeting, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null), expectedTerm = (typeof workflowSession !== 'undefined' ? workflowSession?.term : null)) {
  if (!section || !meeting || !courseRules) return false;
  const isRemoteMeeting = Boolean(meeting.remote || meeting.isRemote || meeting.attendanceMode === 'remote' || meeting.displayMode === 'remote');
  if (isRemoteMeeting) return false;
  const courseKey = section.courseEntryId || section.entryId || section.courseKey || section.courseNumber || section.courseLabel;
  const rule = getCourseRule(courseRules, courseKey) ||
               (section.courseKey ? getCourseRule(courseRules, section.courseKey) : null) ||
               (section.courseLabel ? getCourseRule(courseRules, section.courseLabel) : null) ||
               (section.courseNumber ? getCourseRule(courseRules, section.courseNumber) : null);
  if (!rule || !rule.exceptedSectionMeetings) return false;

  // 1. Strict Term Validation: Never apply an exception from another semester
  if (expectedTerm && rule.termSignature) {
    const activeSig = `${expectedTerm.year}_${expectedTerm.semester}`;
    if (rule.termSignature !== activeSig) return false;
  }

  // 2. Section Scoping: Correct variable reference to section.section
  const secNum = String(section.section || '').trim();
  const sectionExceptions = rule.exceptedSectionMeetings.get(secNum);
  if (!sectionExceptions || !sectionExceptions.size) return false;

  return matchingMeetingExceptionKeys(section, meeting, sectionExceptions).length > 0;
}

function getPlanningMeetings(section, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null), activeTerm = (typeof workflowSession !== 'undefined' ? workflowSession?.term : null)) {
  if (!section || !section.meetings) return [];
  if (!courseRules) return section.meetings;
  return section.meetings.filter(m => !isMeetingExcepted(section, m, courseRules, activeTerm));
}

function toggleMeetingException(courseKey, sectionNum, meetingKey, enable, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  if (!courseRules) return;
  const secNum = String(sectionNum || '').trim();
  const rule = getCourseRule(courseRules, courseKey) || createCourseRule();
  if (!rule.exceptedSectionMeetings) rule.exceptedSectionMeetings = new Map();
  if (!rule.exceptedSectionMeetings.has(secNum)) {
    rule.exceptedSectionMeetings.set(secNum, new Set());
  }
  const set = rule.exceptedSectionMeetings.get(secNum);
  if (enable) {
    set.add(meetingKey);
  } else {
    // Unchecking a refreshed room must also remove its safe legacy key.
    const entry = (typeof workflowSession !== 'undefined' ? workflowSession?.entries : null)?.find(e =>
      e.id === courseKey || e.result?.original === courseKey || e.result?.resolvedCourseNumber === courseKey);
    const section = entry?.sections?.find(s => String(s.section).trim() === secNum);
    const meeting = section?.meetings?.find(m => getMeetingKey(m) === meetingKey);
    if (meeting) {
      for (const key of matchingMeetingExceptionKeys(section, meeting, set)) set.delete(key);
    }
    set.delete(meetingKey);
    if (set.size === 0) rule.exceptedSectionMeetings.delete(secNum);
  }
  courseRules.set(courseKey, rule);

  if (typeof workflowSession !== 'undefined' && workflowSession?.entries) {
    const entry = workflowSession.entries.find(e =>
      e.id === courseKey ||
      e.result?.original === courseKey ||
      e.result?.resolvedCourseNumber === courseKey ||
      e.result?.label === courseKey ||
      e.result?.canonicalName === courseKey
    );
    if (entry) {
      if (entry.id && entry.id !== courseKey) courseRules.set(entry.id, rule);
      if (entry.result?.resolvedCourseNumber && entry.result.resolvedCourseNumber !== courseKey) courseRules.set(entry.result.resolvedCourseNumber, rule);
      if (entry.result?.original && entry.result.original !== courseKey) courseRules.set(entry.result.original, rule);
      if (entry.result?.canonicalName && entry.result.canonicalName !== courseKey) courseRules.set(entry.result.canonicalName, rule);
      if (entry.sections) {
        entry.sections.forEach(s => {
          s.courseEntryId = entry.id;
          if (s.courseKey && s.courseKey !== courseKey) courseRules.set(s.courseKey, rule);
          if (s.courseNumber && s.courseNumber !== courseKey) courseRules.set(s.courseNumber, rule);
        });
      }
    }
  }
}

// Count a section pair once, with its distinct overlapping intervals underneath.
// All fetched alternatives participate, regardless of the user's time filters.
function collectSectionConflicts(allSections, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  const courses = new Map();
  for (const [fallback, sections] of allSections) {
    for (const section of sections) {
      const key = courseIdentity(section, fallback);
      if (!courses.has(key)) courses.set(key, {key, label:section.courseLabel || fallback, sections:new Map()});
      const course = courses.get(key);
      const sectionKey = arabicDigitsToAscii(cleanText(section.section));
      if (!course.sections.has(sectionKey)) course.sections.set(sectionKey, {...section, meetings:[], complete:true, instructors:[], isUnscheduled: !!section.isUnscheduled});
      const entry = course.sections.get(sectionKey);
      entry.meetings.push(...section.meetings);
      entry.complete &&= section.complete === true;
      if (entry.meetings.length > 0) entry.isUnscheduled = false;
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
      if (!section.complete || (!section.isUnscheduled && !section.meetings.length)) unknown++;
      if (section.meetings.some(m => !VALID_DAYS.includes(m.day))) outsideWeek++;
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
              if (conflicts(x, y)) {
                const isNeutralized = isMeetingExcepted(a, x, courseRules) || isMeetingExcepted(b, y, courseRules);
                const item = {
                  day: x.day,
                  start: Math.max(x.start, y.start),
                  end: Math.min(x.end, y.end)
                };
                if (isNeutralized) {
                  item.neutralized = true;
                  item.neutralizedNote = "تعارض رسمي تم تحييده باستثناء موعد معتمد من الطالب";
                }
                found.push(item);
              }
            }
          }
          found.sort((x, y) => VALID_DAYS.indexOf(x.day) - VALID_DAYS.indexOf(y.day) || x.start - y.start || x.end - y.end);
          const overlaps = [];
          for (const overlap of found) {
            const last = overlaps[overlaps.length - 1];
            if (last && last.day === overlap.day && overlap.start <= last.end) {
              last.end = Math.max(last.end, overlap.end);
              if (overlap.neutralized && !last.neutralized) {
                last.neutralized = true;
                last.neutralizedNote = overlap.neutralizedNote;
              }
            } else {
              overlaps.push({...overlap});
            }
          }
          if (overlaps.length) {
            const pair = {first: a, second: b, overlaps};
            if (overlaps.every(o => o.neutralized)) {
              pair.neutralized = true;
            }
            pairs.push(pair);
          }
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

function sectionConflicts(section, chosen, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  const currentMeetings = getPlanningMeetings(section, courseRules);
  if (!currentMeetings.length) return false;
  const existing = chosen.flatMap(x => getPlanningMeetings(x, courseRules));
  if (!existing.length) return false;
  return currentMeetings.some(m => existing.some(e => conflicts(m, e)));
}

function formatSectionCountArabic(count) {
  if (count === 1) return 'شعبة واحدة';
  if (count === 2) return 'شعبتان';
  if (count >= 3 && count <= 10) return `${count} شعب`;
  return `${count} شعبة`;
}

const UNSCHEDULED_DAY_PATTERN = 'unscheduled';
const ALL_CANONICAL_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const CANONICAL_DAY_CODES = {
  "الأحد": "ح",
  "الاثنين": "ن",
  "الثلاثاء": "ث",
  "الأربعاء": "ر",
  "الخميس": "خ",
  "الجمعة": "ج",
  "السبت": "س"
};

const CODE_TO_LABEL_PART = {
  "ح": "أحد",
  "ن": "إثنين",
  "ث": "ثلاثاء",
  "ر": "أربعاء",
  "خ": "خميس",
  "ج": "جمعة",
  "س": "سبت"
};

function getSectionDayPatternKey(section) {
  if (!section || !isValidSchedulingSection(section)) return null;
  if (section.isUnscheduled || section.timingType === 'unscheduled' || (!section.meetings || section.meetings.length === 0)) {
    return UNSCHEDULED_DAY_PATTERN;
  }
  const days = [...new Set((section.meetings || []).map(m => m.day).filter(Boolean))];
  if (!days.length) return UNSCHEDULED_DAY_PATTERN;
  days.sort((a, b) => {
    const ia = ALL_CANONICAL_DAYS.indexOf(a);
    const ib = ALL_CANONICAL_DAYS.indexOf(b);
    return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
  });
  return days.map(d => CANONICAL_DAY_CODES[d] || d).join('_');
}

function formatDayPatternLabel(patternKey) {
  if (!patternKey || patternKey === UNSCHEDULED_DAY_PATTERN) return 'بدون موعد مجدول';
  if (patternKey === 'ح_ث_خ') return 'أحد / ثلاثاء / خميس';
  if (patternKey === 'ن_ر') return 'إثنين / أربعاء';
  if (patternKey === 'ح_ث') return 'أحد / ثلاثاء';
  const parts = patternKey.split('_').map(c => CODE_TO_LABEL_PART[c] || c);
  return parts.join(' / ');
}

function getAvailableDayPatternsForCourse(sections) {
  const validSections = (sections || []).filter(isValidSchedulingSection);
  if (!validSections.length) return [];
  const patternCounts = new Map();
  for (const sec of validSections) {
    const key = getSectionDayPatternKey(sec);
    if (!key) continue;
    patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
  }
  const rankKey = key => {
    if (key === 'ح_ث_خ') return 1;
    if (key === 'ن_ر') return 2;
    if (key === 'ح_ث') return 3;
    if (key === 'ح') return 10;
    if (key === 'ن') return 11;
    if (key === 'ث') return 12;
    if (key === 'ر') return 13;
    if (key === 'خ') return 14;
    if (key === 'س') return 15;
    if (key === UNSCHEDULED_DAY_PATTERN) return 99;
    return 20;
  };
  const sortedKeys = [...patternCounts.keys()].sort((a, b) => {
    const countDiff = (patternCounts.get(b) || 0) - (patternCounts.get(a) || 0);
    if (countDiff !== 0) return countDiff;
    return rankKey(a) - rankKey(b);
  });
  return sortedKeys.map(key => ({
    key,
    label: formatDayPatternLabel(key),
    count: patternCounts.get(key),
    isUnscheduled: key === UNSCHEDULED_DAY_PATTERN
  }));
}

function isSectionPatternAllowed(section, allowedDayPattern) {
  if (allowedDayPattern == null) return true;
  if (!isValidSchedulingSection(section)) return false;
  return getSectionDayPatternKey(section) === allowedDayPattern;
}

function evaluateSectionEligibility(section, prefs, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  const reasons = [];

  if (!isValidSchedulingSection(section)) {
    reasons.push({ type: 'unparseable', label: 'موعد غير مكتمل أو غير مقروء' });
    return { allowed: false, reasons };
  }

  // Check per-course allowedDayPattern if specified
  if (prefs && prefs.allowedDayPattern != null) {
    const secPattern = getSectionDayPatternKey(section);
    if (secPattern !== prefs.allowedDayPattern) {
      reasons.push({
        type: 'course-day-pattern',
        label: 'نمط الأيام غير مسموح لهذه المادة',
        actualPattern: secPattern,
        allowedPattern: prefs.allowedDayPattern
      });
    }
  }

  // Legitimate unscheduled sections have no meetings and are eligible if allowed by day pattern
  if (section.isUnscheduled) {
    return {
      allowed: reasons.length === 0,
      reasons
    };
  }

  const planningMeetings = getPlanningMeetings(section, courseRules);
  if (!planningMeetings.length) {
    return {
      allowed: reasons.length === 0,
      reasons
    };
  }

  const offDaysHit = new Set();
  const startsBeforeHit = [];
  const endsAfterHit = [];

  const notBefore = typeof prefs.notBefore === 'string' ? timeToMinutes(prefs.notBefore) : prefs.notBefore;
  const notAfter = typeof prefs.notAfter === 'string' ? timeToMinutes(prefs.notAfter) : prefs.notAfter;

  for (const m of planningMeetings) {
    if (prefs.offDays && prefs.offDays.has(m.day)) {
      offDaysHit.add(m.day);
    }
    if (notBefore != null && m.start < notBefore) {
      startsBeforeHit.push({ day: m.day, start: m.start, limit: notBefore });
    }
    if (notAfter != null && m.end > notAfter) {
      endsAfterHit.push({ day: m.day, end: m.end, limit: notAfter });
    }
  }

  if (offDaysHit.size > 0) {
    reasons.push({
      type: 'day-off',
      days: [...offDaysHit]
    });
  }

  if (startsBeforeHit.length > 0) {
    const minStart = Math.min(...startsBeforeHit.map(x => x.start));
    reasons.push({
      type: 'starts-before',
      limit: notBefore,
      actualStart: minStart,
      occurrences: startsBeforeHit
    });
  }

  if (endsAfterHit.length > 0) {
    const maxEnd = Math.max(...endsAfterHit.map(x => x.end));
    reasons.push({
      type: 'ends-after',
      limit: notAfter,
      actualEnd: maxEnd,
      occurrences: endsAfterHit
    });
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

function isAllowed(section, prefs, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  return evaluateSectionEligibility(section, prefs, courseRules).allowed;
}

// ----------------------- Per-course temporary rules (Issue 10) -----------------------

function hasPreferenceOverride(rule) {
  return Boolean(rule && (rule.ignoreDaysOff || rule.ignoreNotBefore || rule.ignoreNotAfter));
}

function isCourseExcludedFromGeneration(courseRules, courseKey) {
  return getCourseRule(courseRules, courseKey)?.excludedFromGeneration === true;
}

// Pure: returns the global prefs object itself when the rule overrides nothing,
// otherwise a derived copy. The global prefs are never mutated.
function getEffectivePrefsForCourse(globalPrefs, rule) {
  const hasException = hasPreferenceOverride(rule);
  const hasPattern = Boolean(rule && rule.allowedDayPattern != null);
  if (!hasException && !hasPattern) return globalPrefs;
  return {
    ...globalPrefs,
    offDays: rule?.ignoreDaysOff ? new Set() : globalPrefs.offDays,
    notBefore: rule?.ignoreNotBefore ? null : globalPrefs.notBefore,
    notAfter: rule?.ignoreNotAfter ? null : globalPrefs.notAfter,
    allowedDayPattern: rule?.allowedDayPattern ?? null
  };
}

// Compare the SELECTED section with the ORIGINAL global prefs and report only
// the preference types it actually violates (and that the rule bypasses).
function deriveAppliedException(section, courseKey, globalPrefs, rule) {
  if (!hasPreferenceOverride(rule) || !section || section.isUnscheduled) return null;
  const evaluation = evaluateSectionEligibility(section, globalPrefs);
  const exception = {
    courseKey,
    courseName: section.courseLabel || section.detectedName || courseKey,
    courseIdentity: courseIdentity(section, courseKey),
    courseNumber: section.courseNumber || '',
    sectionNumber: section.section,
    types: []
  };
  for (const reason of evaluation.reasons) {
    if (reason.type === 'day-off' && rule.ignoreDaysOff) {
      exception.types.push('daysOff');
      exception.days = [...reason.days];
    } else if (reason.type === 'starts-before' && rule.ignoreNotBefore) {
      exception.types.push('notBefore');
      exception.earliestStart = reason.actualStart;
      exception.startLimit = reason.limit;
    } else if (reason.type === 'ends-after' && rule.ignoreNotAfter) {
      exception.types.push('notAfter');
      exception.latestEnd = reason.actualEnd;
      exception.endLimit = reason.limit;
    }
  }
  return exception.types.length ? exception : null;
}

function joinArabicList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join('، ') + ' و' + items[items.length - 1];
}

// Long, user-facing sentence(s) for the popup (HTML-safe, times wrapped in LTR bdi).
function describeAppliedExceptionHtml(exception) {
  const parts = [];
  if (exception.types.includes('daysOff')) {
    const days = exception.days || [];
    const dayPhrase = days.length === 1 ? 'يوم ' + days[0]
      : days.length === 2 ? 'يومي ' + joinArabicList(days)
      : 'أيام ' + joinArabicList(days);
    const pronoun = days.length === 1 ? 'فيه' : days.length === 2 ? 'فيهما' : 'فيها';
    parts.push(`تتضمن دواماً ${escapeHtml(dayPhrase)} رغم اختيارك عدم الدوام ${pronoun}.`);
  }
  if (exception.types.includes('notAfter')) {
    parts.push(`تنتهي المحاضرة بعد وقت النهاية الذي اخترته (<bdi dir="ltr">${minutesToTime(exception.endLimit)}</bdi>).`);
  }
  if (exception.types.includes('notBefore')) {
    parts.push(`تبدأ المحاضرة قبل وقت البدء الذي اخترته (<bdi dir="ltr">${minutesToTime(exception.startLimit)}</bdi>).`);
  }
  return `<b>${escapeHtml(exception.courseName)}</b> — ${parts.join(' ')}`;
}

// Compact plain-text form for the clipboard (times wrapped in LRM marks).
function describeAppliedExceptionText(exception) {
  const LRM = '\u200E';
  const parts = [];
  if (exception.types.includes('daysOff')) {
    parts.push(`دوام ${(exception.days || []).join('/')} رغم تفضيل عدم الدوام`);
  }
  if (exception.types.includes('notAfter')) {
    parts.push(`انتهاء المحاضرة ${LRM}${minutesToTime(exception.latestEnd)}${LRM} بعد وقت النهاية المختار ${LRM}${minutesToTime(exception.endLimit)}${LRM}`);
  }
  if (exception.types.includes('notBefore')) {
    parts.push(`بدء المحاضرة ${LRM}${minutesToTime(exception.earliestStart)}${LRM} قبل وقت البدء المختار ${LRM}${minutesToTime(exception.startLimit)}${LRM}`);
  }
  return `⚠ استثناء: ${exception.courseName} — ${parts.join('؛ ')}.`;
}

function formatCourseCountOfOriginal(included, original) {
  return `${included} من أصل ${original} مواد`;
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

function scheduleMetrics(chosen, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  const byDay = new Map();

  for (const section of chosen) {
    const planningMeetings = getPlanningMeetings(section, courseRules);
    for (const meeting of planningMeetings) {
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

  const activeDays = byDay.has('السبت') ? [...DAY_ORDER, 'السبت'] : DAY_ORDER;

  for (const day of activeDays) {
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

  const sttDays = ['الأحد', 'الثلاثاء', 'الخميس'];
  const mwDays = ['الاثنين', 'الأربعاء'];

  const sttMeetings = sttDays.flatMap(d => byDay.get(d) || []);
  const mwMeetings = mwDays.flatMap(d => byDay.get(d) || []);

  const sttHasClasses = sttMeetings.length > 0;
  const mwHasClasses = mwMeetings.length > 0;

  const dayPatterns = {
    stt: {
      key: 'stt',
      label: 'أحد / ثلاثاء / خميس',
      days: sttDays,
      hasClasses: sttHasClasses,
      earliest: sttHasClasses ? Math.min(...sttMeetings.map(m => m.start)) : null,
      latest: sttHasClasses ? Math.max(...sttMeetings.map(m => m.end)) : null
    },
    mw: {
      key: 'mw',
      label: 'اثنين / أربعاء',
      days: mwDays,
      hasClasses: mwHasClasses,
      earliest: mwHasClasses ? Math.min(...mwMeetings.map(m => m.start)) : null,
      latest: mwHasClasses ? Math.max(...mwMeetings.map(m => m.end)) : null
    }
  };

  return {
    // Explicitly remote lectures still block time but do not require a campus day.
    // Blended/unspecified delivery is conservatively counted as attendance.
    days: [...byDay.values()].filter(meetings => meetings.some(m => !m.remote)).length,
    gap: totalGap,
    gapsByDay,
    campusBreaksByDay,
    earliest,
    latest,
    dayPatterns,
    byDay: new Map(activeDays.filter(day => byDay.has(day)).map(day => [day, byDay.get(day)]))
  };
}

function compareSchedules(a, b, ranking = 'balanced') {
  const x = a.metrics, y = b.metrics;
  const comparisons = {days: x.days-y.days, gaps: x.gap-y.gap, late: y.earliest-x.earliest, earlyEnd: x.latest-y.latest};
  const order = ['days', 'gaps', 'late', 'earlyEnd'];
  if (ranking !== 'balanced' && order.includes(ranking)) order.unshift(...order.splice(order.indexOf(ranking), 1));
  return order.map(k => comparisons[k]).find(n => n !== 0) || 0;
}

function generateSchedules(courseSections, prefs, maxResults = 80, maxNodes = 50000, maxCandidates = 5000, courseRules = null) {
  const courseKeys = [...courseSections.keys()].sort((a,b) => courseSections.get(a).length-courseSections.get(b).length);
  // Each course is judged with its own effective prefs; global prefs are never mutated.
  const effectivePrefsByKey = new Map(courseKeys.map(key => [key, getEffectivePrefsForCourse(prefs, getCourseRule(courseRules, key))]));
  const hasAnyOverride = courseKeys.some(key => hasPreferenceOverride(getCourseRule(courseRules, key)));
  const exceptionCache = new Map();
  const appliedExceptionsFor = (chosen, chosenKeys) => {
    const found = [];
    chosen.forEach((section, i) => {
      if (!exceptionCache.has(section)) {
        exceptionCache.set(section, deriveAppliedException(section, chosenKeys[i], prefs, getCourseRule(courseRules, chosenKeys[i])));
      }
      const exception = exceptionCache.get(section);
      if (exception) found.push(exception);
    });
    return found;
  };
  const candidates = [];
  let nodes = 0, truncated = false, totalFound = 0;
  function dfs(index, chosen, chosenKeys) {
    if (nodes >= maxNodes) { truncated = true; return; }
    nodes++;
    if (index === courseKeys.length) {
      if (candidates.length >= maxCandidates) { truncated = true; return; }
      totalFound++;
      const candidate = {sections: [...chosen], metrics: scheduleMetrics(chosen, courseRules)};
      if (hasAnyOverride) {
        const appliedExceptions = appliedExceptionsFor(chosen, chosenKeys);
        if (appliedExceptions.length) candidate.appliedExceptions = appliedExceptions;
      }
      const appliedMeetingExceptions = [];
      chosen.forEach((sec, i) => {
        const key = chosenKeys[i];
        for (const m of (sec.meetings || [])) {
          if (isMeetingExcepted(sec, m, courseRules)) {
            appliedMeetingExceptions.push({
              courseKey: key,
              courseLabel: sec.courseLabel || key,
              courseNumber: sec.courseNumber || '',
              section: sec.section,
              meeting: m,
              meetingKey: getMeetingKey(m),
              day: m.day,
              start: m.start,
              end: m.end,
              timeRange: formatTimeRange(m.start, m.end),
              attendanceMode: m.attendanceMode || (m.remote ? 'remote' : 'campus')
            });
          }
        }
      });
      if (appliedMeetingExceptions.length) {
        candidate.appliedMeetingExceptions = appliedMeetingExceptions;
      }
      candidates.push(candidate);
      return;
    }
    const courseKey = courseKeys[index];
    const coursePrefs = effectivePrefsByKey.get(courseKey);
    for (const section of courseSections.get(courseKey)) {
      if (truncated) break;
      if (nodes >= maxNodes) { truncated = true; break; }
      nodes++; // Bound rejected/conflicting branches too, not only recursive visits.
      if (!isAllowed(section, coursePrefs, courseRules) || sectionConflicts(section, chosen, courseRules)) continue;
      const planningMeetings = getPlanningMeetings(section, courseRules);
      if (planningMeetings.some((m, i) => planningMeetings.slice(i + 1).some(n => conflicts(m, n)))) continue;
      if (chosen.some(s => s.courseNumber && s.courseNumber === section.courseNumber)) continue;
      chosen.push(section); chosenKeys.push(courseKey); dfs(index + 1, chosen, chosenKeys); chosen.pop(); chosenKeys.pop();
    }
  }
  if (courseKeys.length) dfs(0, [], []);
  candidates.sort((a,b) => compareSchedules(a,b,prefs.ranking));
  const results = candidates.slice(0, maxResults);
  results.candidates = candidates;
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

function meetingText(meetings, options = {}) {
  if (!meetings || !meetings.length) return "موعد غير منشور";

  const hasBlended = meetings.some(m => m.displayMode === 'blended');
  const hasRemote = meetings.some(m => m.displayMode === 'remote' || m.remote);
  const isMultiMode = (hasBlended || hasRemote) && meetings.some(m => (m.displayMode === 'campus' || (!m.remote && m.displayMode !== 'blended')));

  const grouped = new Map();

  for (const m of meetings) {
    const mode = m.displayMode || (m.remote ? 'remote' : 'campus');
    const key = `${m.start}-${m.end}-${mode}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m.day);
  }

  const timeFormatter = options?.bidiText ? formatTimeRangeText : formatTimeRange;

  return [...grouped.entries()].map(([key, days]) => {
    const parts = key.split("-");
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    const mode = parts[2];

    let modeSuffix = '';
    if (mode === 'blended') {
      modeSuffix = ' (مدمج)';
    } else if (mode === 'remote') {
      modeSuffix = ' (عن بعد)';
    } else if (mode === 'campus' && isMultiMode) {
      modeSuffix = ' (وجاهي)';
    }

    return `${days.join("، ")} ${timeFormatter(start, end)}${modeSuffix}`;
  }).join(" | ");
}

function meetingHtml(meetings) {
  if (!meetings || !meetings.length) return escapeHtml("موعد غير منشور");

  const hasBlended = meetings.some(m => m.displayMode === 'blended');
  const hasRemote = meetings.some(m => m.displayMode === 'remote' || m.remote);
  const isMultiMode = (hasBlended || hasRemote) && meetings.some(m => (m.displayMode === 'campus' || (!m.remote && m.displayMode !== 'blended')));

  const grouped = new Map();

  for (const m of meetings) {
    const mode = m.displayMode || (m.remote ? 'remote' : 'campus');
    const key = `${m.start}-${m.end}-${mode}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m.day);
  }

  return [...grouped.entries()].map(([key, days]) => {
    const parts = key.split("-");
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    const mode = parts[2];

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

    return `${daysEscaped} ${rangeHtml}${suffixEscaped}`;
  }).join(" | ");
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

const formatSectionLocation = formatSectionLocationText;

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

const ROOM_FRIENDLY_NAMES = [
  { prefix: 'ص.ك.ر', name: 'الرياضة' },
  { prefix: 'م.تك', name: 'مختبر IT' },
  { prefix: 'صيدلة', name: 'الصيدلة' },
  { prefix: 'ل.ز', name: 'مركز اللغات' },
  { prefix: 'ح.ب', name: 'الحسين الباني' },
  { prefix: 'ح.ر', name: 'الحارث الرابع' },
  { prefix: 'م.ش', name: 'الشرقي / ابن رشد' },
  { prefix: 'م.غ', name: 'الغربي / ابن خلدون' },
  { prefix: 'ع ط', name: 'العلوم الطبية المساندة' },
  { prefix: 'ت م', name: 'التمريض' },
  { prefix: 'تك', name: 'IT' },
  { prefix: 'هـ', name: 'الهندسة' },
  { prefix: 'ق', name: 'الاقتصاد' },
  { prefix: 'ف', name: 'الفيزياء' },
  { prefix: 'ك', name: 'الكيمياء' },
  { prefix: 'ح', name: 'الأحياء' },
  { prefix: 'ع', name: 'الموارد الطبيعية والبيئية' },
  { prefix: 'ض', name: 'الرياضة' },
  { prefix: 'ر', name: 'الرياضيات' }
];

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

function sectionTimingLabel(section) {
  if (section.isUnscheduled || section.timingType === 'unscheduled') return 'بدون موعد مجدول';
  if (!section.meetings.length) {
    if (section.timingType === 'unparseable' || section.warnings?.length) return 'تعذر قراءة الموعد المنشور';
    // Distinguish an empty HU meeting cell from a published but unreadable time.
    const timeText = (section.headers || []).flatMap((header, i) =>
      /موعد|وقت|توقيت|schedule|time/.test(normalizeArabic(header)) || canonicalDay(header)
        ? [(section.cells?.[i] || '').split('/')[0]] : []).join(' ');
    return /[0-9٠-٩۰-۹]/.test(timeText) ? 'تعذر قراءة الموعد المنشور' : 'بدون موعد مجدول';
  }
  if (section.meetings.some(m => !VALID_DAYS.includes(m.day))) return 'خارج أسبوع الدوام المحدد';
  if (!hasCompleteTiming(section)) return 'الموعد غير مكتمل أو غير مؤكد';
  return '';
}

let currentAllSections = new Map();
let currentSchedules = [];
let candidateSchedules = [];
let availableBreaks = [];
let candidateSetTruncated = false;
// Display context of the latest generation: {originalCourseCount, includedCourseCount, excludedCourses}.
let lastGenerationContext = null;
const BREAK_GROUPS = [
  {id: 'stt', days: ['الأحد', 'الثلاثاء', 'الخميس'], anchor: 510, step: 60},
  {id: 'mw', days: ['الاثنين', 'الأربعاء'], anchor: 480, step: 90}
];
const groupBreakCache = new WeakMap();

function groupBreakIntervals(schedule, group) {
  let cache = groupBreakCache.get(schedule);
  if (!cache) { cache = new Map(); groupBreakCache.set(schedule, cache); }
  if (cache.has(group.id)) return cache.get(group.id);
  // An inactive/remote-only day does not promise campus attendance or a campus break.
  const days = group.days.filter(day => schedule.metrics.byDay.get(day)?.some(m => !m.remote));
  if (!days.length) { cache.set(group.id, []); return []; }
  let shared = schedule.metrics.campusBreaksByDay.get(days[0]) || [];
  for (const day of days.slice(1)) {
    const next = schedule.metrics.campusBreaksByDay.get(day) || [];
    shared = shared.flatMap(a => next.map(b => ({start: Math.max(a.start,b.start), end: Math.min(a.end,b.end)})))
      .filter(interval => interval.end > interval.start);
  }
  cache.set(group.id, shared);
  return shared;
}

function supportsBreak(schedule, option) {
  const group = BREAK_GROUPS.find(g => g.id === option.group);
  return !!group && groupBreakIntervals(schedule, group).some(interval => interval.start <= option.start && interval.end >= option.end);
}

function extractAvailableBreaks(schedules) {
  const options = new Map();
  const add = (group, start, end) => {
    const key = `${group.id}:${start}:${end}`;
    if (!options.has(key)) options.set(key, {key, group: group.id, start, end, count: 0});
  };
  for (const schedule of schedules) {
    for (const group of BREAK_GROUPS) {
      for (const interval of groupBreakIntervals(schedule, group)) {
        add(group, interval.start, interval.end);
        // Include contained university slots, not only exact observed gap boundaries.
        let start = group.anchor + Math.ceil((interval.start-group.anchor)/group.step)*group.step;
        for (; start+group.step <= interval.end; start += group.step) add(group, start, start+group.step);
      }
    }
  }
  for (const option of options.values()) option.count = schedules.filter(s => supportsBreak(s, option)).length;
  return [...options.values()].filter(o => o.count).sort((a,b) => a.group.localeCompare(b.group) || a.start-b.start || a.end-b.end);
}

function filterSchedulesByBreaks(schedules, selectedBreakKeys, mode = 'all', options = availableBreaks) {
  if (!selectedBreakKeys.length) return schedules;
  const selected = selectedBreakKeys.map(key => options.find(o => o.key === key));
  return schedules.filter(schedule => {
    const matches = option => !!option && supportsBreak(schedule, option);
    return mode === 'any' ? selected.some(matches) : selected.every(matches);
  });
}

function applyBreakFilters() {
  const keys = [...document.querySelectorAll('#breakFilters input:checked')].map(input => input.value);
  if(workflowSession){workflowSession.breakKeys=keys;workflowSession.breakMode=$('breakMode').value;}
  const filtered = filterSchedulesByBreaks(candidateSchedules, keys, $('breakMode').value);
  const visible = filtered.slice(0, 80);
  visible.truncated = candidateSetTruncated;
  renderSchedules(visible);
  if (!filtered.length && keys.length) $('schedules').textContent = 'لا توجد جداول تحقق الاستراحات المحددة ضمن مجموعة النتائج.';
  $('breakSummary').textContent = `مطابق: ${filtered.length} من ${candidateSchedules.length} جدول. المعروض: ${visible.length}.` +
    (candidateSetTruncated ? ' النتائج جزئية: خيارات الاستراحة وأعدادها مبنية على مجموعة جداول محدودة بحد الأمان.' : '');
}

function setCandidateSchedules(results) {
  candidateSchedules = results.candidates || results;
  candidateSetTruncated = !!results.truncated;
  availableBreaks = extractAvailableBreaks(candidateSchedules);

  // Preserve previous break selections if available from workflowSession
  const prevKeys = new Set(workflowSession?.breakKeys || []);
  const prevMode = workflowSession?.breakMode || 'all';
  const availableKeySet = new Set(availableBreaks.map(o => o.key));
  const survivingKeys = new Set([...prevKeys].filter(k => availableKeySet.has(k)));

  const container = $('breakFilters');
  container.replaceChildren();
  for (const group of BREAK_GROUPS) {
    const options = availableBreaks.filter(o => o.group === group.id);
    if (!options.length) continue;
    const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
    legend.textContent = group.days.join(' / '); fieldset.append(legend);
    for (const option of options) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = option.key;
      if (survivingKeys.has(option.key)) {
        input.checked = true;
      }
      input.addEventListener('change', applyBreakFilters);
      label.className = 'break-filter-option';
      const time = document.createElement('bdi');
      time.dir = 'ltr';
      time.className = 'break-filter-time';
      time.textContent = formatTimeRange(option.start, option.end);
      const count = document.createElement('span');
      count.className = 'break-filter-count';
      count.textContent = `${option.count} جداول`;
      label.append(input, time, count);
      fieldset.append(label);
    }
    container.append(fieldset);
  }
  if (!availableBreaks.length) container.textContent = 'لا توجد استراحات جماعية متاحة ضمن النتائج.';
  const breakModeEl = $('breakMode');
  if (breakModeEl) {
    breakModeEl.value = (prevMode === 'any' ? 'any' : 'all');
    breakModeEl.onchange = applyBreakFilters;
  }
  applyBreakFilters();
}
const COURSE_PALETTE_SIZE = 12;

function getCourseColorIndex(index) {
  if (typeof index !== 'number' || isNaN(index) || index < 0) return 0;
  if (index < COURSE_PALETTE_SIZE) return index;
  return (index * 7 + 5) % COURSE_PALETTE_SIZE;
}

function buildCourseColorMap(schedules) {
  const identities = [...new Set((schedules || []).flatMap(result => (result.sections || []).map(section => courseIdentity(section))))].sort();
  return new Map(identities.map((key, index) => [key, getCourseColorIndex(index)]));
}

var currentCourseColors = new Map();

function getCurrentCourseColors() {
  return currentCourseColors;
}
let lastConflictReport = null;
let currentResultTerm = null;

async function openExport(type, scheduleIndex = 0, options = {}) {
  const year = currentResultTerm?.year ?? cleanText($("year").value);
  const semester = currentResultTerm?.semester ?? $("semester").value;

  const resolveScheme = sec => sec.deliveryScheme || (
    sec.meetings?.some(m => m.displayMode === 'blended' || m.blended) ? 'blended' :
    sec.meetings?.length && sec.meetings.every(m => m.remote) ? 'remote' :
    sec.meetings?.some(m => m.remote) ? 'mixed' : (sec.isUnscheduled ? 'unspecified' : 'campus')
  );

  let courseColorsObj;
  let serializableSchedules;
  const customSched = options.customSchedule || null;

  if (customSched) {
    const manualColors = buildCourseColorMap([customSched]);
    courseColorsObj = Object.fromEntries(manualColors);
    serializableSchedules = [{
      sections: (customSched.sections || []).map(sec => {
        const identity = courseIdentity(sec);
        const colorIndex = manualColors.get(identity) ?? 0;
        return {
          section: sec.section,
          courseNumber: sec.courseNumber,
          courseLabel: sec.courseLabel,
          courseIdentity: identity,
          colorIndex,
          instructors: sec.instructors || [],
          meetings: (sec.meetings || []).map(m => ({
            ...m,
            excepted: isMeetingExcepted(sec, m, workflowSession?.courseRules)
          })),
          deliveryScheme: resolveScheme(sec),
          complete: sec.complete ?? isValidSchedulingSection(sec),
          isUnscheduled: !!sec.isUnscheduled,
          timingType: sec.timingType
        };
      }),
      metrics: {
        days: customSched.metrics?.days || 0,
        gap: customSched.metrics?.gap || 0,
        earliest: customSched.metrics?.earliest || 0,
        latest: customSched.metrics?.latest || 0,
        dayPatterns: customSched.metrics?.dayPatterns || null,
        gapsByDay: Object.fromEntries(customSched.metrics?.gapsByDay || [])
      },
      appliedExceptions: (customSched.appliedExceptions || []).map(ex => ({
        courseKey: ex.courseKey,
        courseName: ex.courseName,
        courseIdentity: ex.courseIdentity,
        courseNumber: ex.courseNumber,
        sectionNumber: ex.sectionNumber,
        types: [...ex.types],
        days: ex.days ? [...ex.days] : undefined,
        earliestStart: ex.earliestStart,
        startLimit: ex.startLimit,
        latestEnd: ex.latestEnd,
        endLimit: ex.endLimit
      })),
      appliedMeetingExceptions: (customSched.appliedMeetingExceptions || []).map(ex => ({
        courseKey: ex.courseKey,
        courseLabel: ex.courseLabel,
        courseNumber: ex.courseNumber,
        section: ex.section,
        day: ex.day,
        start: ex.start,
        end: ex.end,
        timeRange: ex.timeRange,
        attendanceMode: ex.attendanceMode
      }))
    }];
    scheduleIndex = 0;
  } else {
    if (!currentCourseColors.size && currentSchedules?.length) {
      currentCourseColors = buildCourseColorMap(currentSchedules);
    }
    courseColorsObj = Object.fromEntries(currentCourseColors);

    serializableSchedules = (currentSchedules || []).map(s => ({
      sections: (s.sections || []).map(sec => {
        const identity = courseIdentity(sec);
        const colorIndex = currentCourseColors.get(identity) ?? 0;
        return {
          section: sec.section,
          courseNumber: sec.courseNumber,
          courseLabel: sec.courseLabel,
          courseIdentity: identity,
          colorIndex,
          instructors: sec.instructors || [],
          meetings: (sec.meetings || []).map(m => ({
            ...m,
            excepted: isMeetingExcepted(sec, m, workflowSession?.courseRules)
          })),
          deliveryScheme: resolveScheme(sec),
          complete: sec.complete,
          isUnscheduled: !!sec.isUnscheduled,
          timingType: sec.timingType
        };
      }),
      metrics: {
        days: s.metrics.days,
        gap: s.metrics.gap,
        earliest: s.metrics.earliest,
        latest: s.metrics.latest,
        dayPatterns: s.metrics.dayPatterns,
        gapsByDay: Object.fromEntries(s.metrics.gapsByDay || [])
      },
      appliedExceptions: (s.appliedExceptions || []).map(ex => ({
        courseKey: ex.courseKey,
        courseName: ex.courseName,
        courseIdentity: ex.courseIdentity,
        courseNumber: ex.courseNumber,
        sectionNumber: ex.sectionNumber,
        types: [...ex.types],
        days: ex.days ? [...ex.days] : undefined,
        earliestStart: ex.earliestStart,
        startLimit: ex.startLimit,
        latestEnd: ex.latestEnd,
        endLimit: ex.endLimit
      })),
      appliedMeetingExceptions: (s.appliedMeetingExceptions || []).map(ex => ({
        courseKey: ex.courseKey,
        courseLabel: ex.courseLabel,
        courseNumber: ex.courseNumber,
        section: ex.section,
        day: ex.day,
        start: ex.start,
        end: ex.end,
        timeRange: ex.timeRange,
        attendanceMode: ex.attendanceMode
      }))
    }));
  }

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
        meetings: (sec.meetings || []).map(m => ({
          ...m,
          excepted: isMeetingExcepted(sec, m, workflowSession?.courseRules)
        })),
        deliveryScheme: resolveScheme(sec),
        complete: isValidSchedulingSection(sec),
        isUnscheduled: !!sec.isUnscheduled,
        timingType: sec.timingType,
        statusLabel: sec.isUnscheduled ? 'بدون موعد مجدول' : sectionTimingLabel(sec),
        warnings: sec.warnings || []
      }))
    });
  }

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

    const isManual = Boolean(customSched);
    const excludedCoursesList = isManual
      ? (customSched.excludedCourses || []).map(c => ({ courseKey: c.courseKey, courseLabel: c.courseLabel }))
      : (lastGenerationContext?.excludedCourses || []).map(c => ({ courseKey: c.courseKey, courseLabel: c.courseLabel }));

    const originalCount = isManual
      ? (customSched.originalCourseCount ?? (customSched.sections?.length + (customSched.excludedCourses?.length || 0)))
      : (lastGenerationContext?.originalCourseCount ?? currentAllSections.size);

    const includedCount = isManual
      ? (customSched.includedCourseCount ?? customSched.sections?.length)
      : (lastGenerationContext?.includedCourseCount ?? currentAllSections.size);

    const payload = {
      type,
      scheduleIndex,
      timestamp: new Date().toISOString(),
      year,
      semester,
      courseColors: courseColorsObj,
      schedules: serializableSchedules,
      allSections: serializableSections,
      conflicts: serializableConflicts,
      // Display context only: never used to alter section data.
      excludedCourses: excludedCoursesList,
      originalSelectedCourseCount: originalCount,
      includedCourseCount: includedCount,
      isManualSchedule: isManual
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
  } else if (typeof window !== 'undefined' && window.open) {
    window.open(exportUrl, '_blank');
  }
}

async function copyScheduleText(scheduleIndex, customSchedule = null) {
  const sched = customSchedule || currentSchedules[scheduleIndex];
  if (!sched) return;
  const isManual = Boolean(customSchedule);
  const patternLines = [];
  const dp = sched.metrics?.dayPatterns;
  if (dp) {
    if (dp.stt?.hasClasses) {
      patternLines.push(`${dp.stt.label}: ${formatTimeRangeText(dp.stt.earliest, dp.stt.latest)}`);
    }
    if (dp.mw?.hasClasses) {
      patternLines.push(`${dp.mw.label}: ${formatTimeRangeText(dp.mw.earliest, dp.mw.latest)}`);
    }
  }
  if (!patternLines.length && sched.metrics) {
    patternLines.push(`أول محاضرة: ${minutesToTime(sched.metrics.earliest)} | آخر محاضرة: ${minutesToTime(sched.metrics.latest)}`);
  }

  const manualExclusions = isManual ? (sched.excludedCourses || []) : [];
  const autoExclusions = isManual ? [] : (lastGenerationContext?.excludedCourses || []);

  let title = '';
  if (isManual) {
    title = manualExclusions.length
      ? 'الجامعة الهاشمية — جدول مبني يدوياً (للمواد المشمولة)'
      : 'الجامعة الهاشمية — جدول مبني يدوياً';
  } else {
    title = `الجامعة الهاشمية — اقتراح جدول ${scheduleIndex + 1}`;
  }

  let countLine = '';
  if (isManual && manualExclusions.length) {
    const orig = sched.originalCourseCount ?? (sched.sections.length + manualExclusions.length);
    const inc = sched.includedCourseCount ?? sched.sections.length;
    countLine = `${inc} من أصل ${orig} مواد مختارة — ${formatExcludedCountArabic(manualExclusions.length)}`;
  } else if (!isManual && autoExclusions.length) {
    countLine = formatCourseCountOfOriginal(lastGenerationContext.includedCourseCount, lastGenerationContext.originalCourseCount);
  }

  const lines = [
    title,
    `أيام الدوام: ${sched.metrics.days} أيام | إجمالي الفراغات: ${formatDurationArabic(sched.metrics.gap)}`,
    ...patternLines,
    ...(countLine ? [countLine] : []),
    '',
    'المواد المسجلة:'
  ];
  for (const sec of sched.sections) {
    const meets = sec.isUnscheduled ? 'بدون موعد مجدول' : meetingText(sec.meetings, { bidiText: true });
    lines.push(`- ${sec.courseLabel} (شعبة ${sec.section}): ${meets}`);
    if (sec.instructors?.length) lines.push(`  المدرس: ${sec.instructors.join('، ')}`);
  }
  if (manualExclusions.length) {
    lines.push('', 'المواد المستبعدة من الجدول اليدوي:', ...manualExclusions.map(c => `- ${c.courseLabel}`));
  } else if (autoExclusions.length) {
    lines.push('', 'المواد المستبعدة من هذا التوليد:', ...autoExclusions.map(c => `- ${c.courseLabel}`));
  }
  if (sched.appliedExceptions?.length) {
    lines.push('', 'ملاحظات:', ...sched.appliedExceptions.map(describeAppliedExceptionText));
  }
  if (sched.appliedMeetingExceptions?.length) {
    lines.push('', 'استثناءات المواعيد باختيار الطالب:', ...sched.appliedMeetingExceptions.map(ex => `- ${ex.courseLabel} (شعبة ${ex.section}): موعد ${ex.day} ${ex.timeRange} (مستثنى من التخطيط باختيار الطالب)`));
  }

  const text = lines.join('\n');
  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('تم نسخ تفاصيل الجدول إلى الحافظة ✅', 'ok');
    } catch {
      setStatus('تعذر نسخ النص تلقائياً.', 'error');
    }
  }
  return text;
}

function renderSectionConflicts(allSections) {
  const report = collectSectionConflicts(allSections, workflowSession?.courseRules);
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
              <div class="small">${meetingHtml(pair.first.meetings || [])}</div>
              <div style="margin-top:4px;">${escapeHtml(group.second.label)} — <b>شعبة ${escapeHtml(pair.second.section)}</b>${secondInst ? ` (${escapeHtml(secondInst)})` : ''}</div>
              <div class="small">${meetingHtml(pair.second.meetings || [])}</div>
              <div class="conflict-intervals">${pair.overlaps.map(overlap => `
                <span>⚠️ تداخل: ${escapeHtml(overlap.day)} ${formatTimeRangeHtml(overlap.start, overlap.end)}</span>
              `).join('')}</div>
            </div>
          `;
        }).join('')}</div>
      </details>
    `).join('')}
  `;
  $('conflictsPanel').classList.remove('hidden');
  setPanelCollapsed('conflictsPanel', report.total === 0);
  $('exportConflictsBtn')?.addEventListener('click', () => openExport('conflicts'));
}

function renderSections(allSections) {
  currentAllSections = allSections;
  const container = $("sections");
  const expandedKeys = new Set(
    [...container.querySelectorAll(".course-card:not(.is-collapsed)")].map(c => c.dataset.courseKey)
  );
  container.innerHTML = `
    <div class="panel-toolbar">
      <button type="button" class="export-btn" id="exportSectionsBtn">🖨️ تصدير كل الشعب والتواقيت (PDF)</button>
    </div>
  `;

  for (const [courseKey, sections] of allSections.entries()) {
    const title = sections[0]?.courseLabel || courseKey;

    const card = document.createElement("div");
    const wasExpanded = expandedKeys.has(courseKey);
    card.className = wasExpanded ? "course-card" : "course-card is-collapsed";
    card.dataset.courseKey = courseKey;

    const parsedCount = sections.filter(isValidSchedulingSection).length;

    const header = document.createElement("div");
    header.className = "course-card-header";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "course-title";
    toggle.setAttribute("aria-expanded", wasExpanded ? "true" : "false");
    toggle.innerHTML = `
      <div class="course-header-info">
        <span class="course-header-name">${escapeHtml(title)}</span>
        <span class="badge availability-offered">متاح هذا الفصل</span>
        <span class="badge">${sections.length} شعب/خيارات</span>
        <span class="badge">${parsedCount} وقت مقروء</span>
        ${sections.some(sec => sec.isUnscheduled || sec.timingType === 'unscheduled') ? '<span class="badge">بدون موعد مجدول</span>' : (sections.some(sec => sectionTimingLabel(sec) === 'موعد غير منشور') ? '<span class="badge warn">موعد غير منشور</span>' : '')}
      </div>
    `;
    toggle.addEventListener("click", () => {
      const isCollapsed = card.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
    header.appendChild(toggle);

    const active = workflowSession?.entries.find(e => !e.excluded && e.id === courseKey);
    if (active) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'إزالة';
      remove.className = 'btn-remove-course';
      remove.dataset.removeCourse = active.id;
      remove.title = 'إزالة المادة من الجدول الحالي';
      remove.disabled = workflowBusy;
      remove.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        removeWorkflowCourse(active.id);
      };
      header.appendChild(remove);
    }
    card.appendChild(header);

    const patterns = getAvailableDayPatternsForCourse(sections);
    const courseRule = getCourseRule(workflowSession?.courseRules, courseKey);
    const selectedPattern = courseRule?.allowedDayPattern ?? null;

    if (patterns.length > 1) {
      const totalValidSections = patterns.reduce((sum, p) => sum + p.count, 0);
      const patternRow = document.createElement("div");
      patternRow.className = "course-pattern-row";

      const patternLabel = document.createElement("span");
      patternLabel.className = "course-pattern-label";
      patternLabel.textContent = "نمط الأيام:";
      patternRow.appendChild(patternLabel);

      const chipsContainer = document.createElement("div");
      chipsContainer.className = "course-pattern-chips";
      chipsContainer.setAttribute("role", "radiogroup");
      chipsContainer.setAttribute("aria-label", `نمط أيام ${title}`);

      // "الكل" chip
      const isAllSelected = selectedPattern === null;
      const allChip = document.createElement("button");
      allChip.type = "button";
      allChip.className = `course-pattern-chip ${isAllSelected ? 'is-active' : ''}`;
      allChip.setAttribute("role", "radio");
      allChip.setAttribute("aria-checked", isAllSelected ? "true" : "false");
      allChip.setAttribute("tabindex", isAllSelected ? "0" : "-1");
      allChip.dataset.courseKey = courseKey;
      allChip.dataset.pattern = "__all__";
      allChip.innerHTML = `
        <svg class="course-pattern-check" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
        <span class="course-pattern-text">الكل (${totalValidSections})</span>
      `;
      chipsContainer.appendChild(allChip);

      for (const pat of patterns) {
        const isPatSelected = selectedPattern === pat.key;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `course-pattern-chip ${isPatSelected ? 'is-active' : ''}`;
        chip.setAttribute("role", "radio");
        chip.setAttribute("aria-checked", isPatSelected ? "true" : "false");
        chip.setAttribute("tabindex", isPatSelected ? "0" : "-1");
        chip.dataset.courseKey = courseKey;
        chip.dataset.pattern = pat.key;
        chip.innerHTML = `
          <svg class="course-pattern-check" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
          <span class="course-pattern-text">${escapeHtml(pat.label)} (${pat.count})</span>
        `;
        chipsContainer.appendChild(chip);
      }

      patternRow.appendChild(chipsContainer);

      patternRow.addEventListener("click", event => {
        const chip = event.target.closest(".course-pattern-chip");
        if (!chip) return;
        event.preventDefault();
        event.stopPropagation();
        if (workflowBusy || !workflowSession) return;

        const key = chip.dataset.courseKey;
        const rawPattern = chip.dataset.pattern;
        const newPattern = rawPattern === '__all__' ? null : rawPattern;

        if (!workflowSession.courseRules) workflowSession.courseRules = new Map();
        const existingRule = getCourseRule(workflowSession.courseRules, key) || createCourseRule();
        if (existingRule.allowedDayPattern === newPattern) return;

        existingRule.allowedDayPattern = newPattern;
        workflowSession.courseRules.set(key, existingRule);

        const group = chip.closest(".course-pattern-chips");
        if (group) {
          group.querySelectorAll(".course-pattern-chip").forEach(c => {
            c.classList.remove("is-active");
            c.setAttribute("aria-checked", "false");
            c.setAttribute("tabindex", "-1");
          });
          chip.classList.add("is-active");
          chip.setAttribute("aria-checked", "true");
          chip.setAttribute("tabindex", "0");
        }

        rerunGenerationWithRules();
      });

      patternRow.addEventListener("keydown", event => {
        const chip = event.target.closest(".course-pattern-chip");
        if (!chip) return;
        const group = chip.closest(".course-pattern-chips");
        if (!group) return;
        const chips = Array.from(group.querySelectorAll(".course-pattern-chip"));
        const currentIndex = chips.indexOf(chip);
        if (currentIndex === -1) return;

        let nextIndex = -1;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % chips.length;
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          nextIndex = (currentIndex - 1 + chips.length) % chips.length;
        }
        if (nextIndex >= 0) {
          event.preventDefault();
          chips[nextIndex].focus();
          chips[nextIndex].click();
        }
      });

      card.appendChild(patternRow);
    } else if (patterns.length === 1 && !patterns[0].isUnscheduled) {
      const patternRow = document.createElement("div");
      patternRow.className = "course-pattern-row course-pattern-row-single";
      patternRow.innerHTML = `
        <span class="course-pattern-label">نمط الأيام:</span>
        <span class="course-pattern-badge">${escapeHtml(patterns[0].label)} — جميع الشعب</span>
      `;
      card.appendChild(patternRow);
    }

    const sectionsList = document.createElement("div");
    sectionsList.className = "course-sections-list";
    sectionsList.innerHTML = sections.map(sec => {
      const eligibleMeetings = (sec.meetings || []).filter(m => isMeetingEligibleForException(title, sec, m));
      let exceptionControlsHtml = '';
      if (eligibleMeetings.length > 0) {
        exceptionControlsHtml = `
          <div class="meeting-exceptions-group">
            ${eligibleMeetings.map(m => {
              const isExcepted = isMeetingExcepted(sec, m, workflowSession?.courseRules);
              const reqConfirm = meetingRequiresConfirmation(title, sec, m);
              const mKey = getMeetingKey(m);
              return `
                <div class="meeting-exception-row" data-course-key="${escapeHtml(courseKey)}" data-section="${escapeHtml(sec.section)}" data-meeting-key="${escapeHtml(mKey)}">
                  <label class="meeting-exception-label">
                    <input type="checkbox" class="meeting-exception-checkbox" ${isExcepted ? 'checked' : ''} data-req-confirm="${reqConfirm}">
                    <span>اعتبار هذا الموعد (${escapeHtml(m.day)} <bdi dir="ltr">${minutesToTime(m.start)} – ${minutesToTime(m.end)}</bdi>) غير ملزم لأغراض تخطيط الجدول</span>
                  </label>
                  ${isExcepted ? '<span class="meeting-exception-pill">مستثنى من التخطيط باختيار الطالب</span>' : ''}
                  <div class="meeting-exception-confirm-card hidden">
                    <div class="confirm-card-text">
                      ⚠️ تنبيه: هذا الموعد مجدول رسمياً من الجامعة. تقع مسؤولية التأكد من عدم إلزامية الحضور الأسبوعي على عاتقك. هل تود استثناءه من تخطيط الجدول؟
                    </div>
                    <div class="confirm-card-actions">
                      <button type="button" class="btn-confirm-exception">تأكيد الاستثناء</button>
                      <button type="button" class="btn-cancel-exception">تراجع</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      return `
        <div class="section">
          <div>
            <b>الشعبة:</b> ${escapeHtml(sec.section)}
            ${sec.courseNumber ? `<span class="badge">${escapeHtml(sec.courseNumber)}</span>` : ""}
          </div>
          <div><b>المدرس:</b> ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
          <div class="meet ${isValidSchedulingSection(sec) ? "good" : "warn"}">
            ${sec.meetings.length ? meetingHtml(sec.meetings) : escapeHtml(sec.isUnscheduled ? 'بدون موعد مجدول' : sectionTimingLabel(sec))}
          </div>
          <div class="section-location"><b>المكان:</b> ${formatSectionLocationsHtml(sec)}</div>
          ${exceptionControlsHtml}
          ${isValidSchedulingSection(sec) ? '' : `<div class="notice warn">مستبعدة من الجدولة: ${escapeHtml(sectionTimingLabel(sec))}${sec.warnings?.length ? ' — ' + escapeHtml(sec.warnings.join('؛ ')) : ''}</div>`}
          <div class="raw">${escapeHtml(sec.raw)}</div>
        </div>
      `;
    }).join("");

    function updateMeetingExceptionRowUI(row, isExcepted) {
      if (!row) return;
      const chk = row.querySelector(".meeting-exception-checkbox");
      if (chk) chk.checked = isExcepted;
      const existingPill = row.querySelector(".meeting-exception-pill");
      if (isExcepted) {
        if (!existingPill) {
          const pill = document.createElement("span");
          pill.className = "meeting-exception-pill";
          pill.textContent = "مستثنى من التخطيط باختيار الطالب";
          const confirmCard = row.querySelector(".meeting-exception-confirm-card");
          if (confirmCard) {
            row.insertBefore(pill, confirmCard);
          } else {
            row.appendChild(pill);
          }
        }
      } else {
        existingPill?.remove();
      }
      row.querySelector(".meeting-exception-confirm-card")?.classList.add("hidden");
    }

    sectionsList.querySelectorAll('.meeting-exception-label').forEach(label => {
      label.addEventListener('click', e => {
        e.stopPropagation();
      });
    });

    sectionsList.addEventListener("change", event => {
      const chk = event.target.closest(".meeting-exception-checkbox");
      if (!chk) return;
      event.stopPropagation();
      const row = chk.closest(".meeting-exception-row");
      if (!row) return;
      const cKey = row.dataset.courseKey;
      const sNum = row.dataset.section;
      const mKey = row.dataset.meetingKey;
      const reqConf = chk.dataset.reqConfirm === 'true';

      if (chk.checked) {
        if (reqConf) {
          chk.checked = false;
          row.querySelector(".meeting-exception-confirm-card")?.classList.remove("hidden");
          return;
        }
        toggleMeetingException(cKey, sNum, mKey, true, workflowSession?.courseRules);
        updateMeetingExceptionRowUI(row, true);
        if (currentAllSections) renderSectionConflicts(currentAllSections);
        rerunGenerationWithRules();
      } else {
        toggleMeetingException(cKey, sNum, mKey, false, workflowSession?.courseRules);
        updateMeetingExceptionRowUI(row, false);
        if (currentAllSections) renderSectionConflicts(currentAllSections);
        rerunGenerationWithRules();
      }
    });

    sectionsList.addEventListener("click", event => {
      const confirmBtn = event.target.closest(".btn-confirm-exception");
      const cancelBtn = event.target.closest(".btn-cancel-exception");
      if (confirmBtn) {
        event.preventDefault();
        event.stopPropagation();
        const row = confirmBtn.closest(".meeting-exception-row");
        if (!row) return;
        const cKey = row.dataset.courseKey;
        const sNum = row.dataset.section;
        const mKey = row.dataset.meetingKey;
        toggleMeetingException(cKey, sNum, mKey, true, workflowSession?.courseRules);
        updateMeetingExceptionRowUI(row, true);
        if (currentAllSections) renderSectionConflicts(currentAllSections);
        rerunGenerationWithRules();
      } else if (cancelBtn) {
        event.preventDefault();
        event.stopPropagation();
        const row = cancelBtn.closest(".meeting-exception-row");
        if (!row) return;
        row.querySelector(".meeting-exception-confirm-card")?.classList.add("hidden");
        const chk = row.querySelector(".meeting-exception-checkbox");
        if (chk) chk.checked = false;
      }
    });

    card.appendChild(sectionsList);

    container.appendChild(card);
  }

  $("sectionsPanel").classList.remove("hidden");
  $('exportSectionsBtn')?.addEventListener('click', () => openExport('sections'));
}

function calendarLayout(sections, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  if (!sections.length || sections.some(section => !isValidSchedulingSection(section))) {
    throw new Error('لا يمكن رسم جدول مؤكد بدون مواعيد كاملة ضمن أسبوع الدوام.');
  }
  const meetings = sections.flatMap(section => getPlanningMeetings(section, courseRules).map(meeting => ({...meeting, section})));
  if (meetings.some((meeting, i) => meetings.slice(i + 1).some(other => conflicts(meeting, other)))) {
    throw new Error('الجدول يحتوي مواعيد متداخلة.');
  }
  const hasSaturday = meetings.some(m => m.day === 'السبت');
  const activeDays = hasSaturday ? [...DAY_ORDER, 'السبت'] : DAY_ORDER;
  if (!meetings.length) {
    const start = 480;
    const end = 1020;
    const scale = 1.2;
    return {
      start, end, scale, height: (end - start) * scale,
      hasSaturday: false,
      days: DAY_ORDER.map(day => ({
        day,
        meetings: [],
        breaks: [],
        breakMinutes: 0
      }))
    };
  }
  const start = Math.floor(Math.min(...meetings.map(m => m.start)) / 60) * 60;
  const end = Math.ceil(Math.max(...meetings.map(m => m.end)) / 60) * 60;
  // Keep even short meetings readable without inflating boxes into adjacent slots.
  const scale = Math.max(1.2, 72 / Math.min(...meetings.map(m => m.end - m.start)));

  const metrics = scheduleMetrics(sections, courseRules);

  return {
    start, end, scale, height:(end - start) * scale,
    hasSaturday,
    days:activeDays.map(day => {
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

// Display-only helpers for constrained timetable blocks. They never mutate stored instructor data.
const MEETING_HEIGHT_STANDARD = 80;
const MEETING_HEIGHT_MEDIUM = 60;
const MEDIUM_FULL_INSTRUCTOR_MAX = 22;

function formatCompactInstructorName(name) {
  const text = cleanText(String(name || '')).replace(/[،,؛;]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  if (!fullName) return '';
  if ((tier === 'standard' || tier === 'medium') && fullName.length <= MEDIUM_FULL_INSTRUCTOR_MAX) {
    return fullName;
  }
  return formatCompactInstructorName(fullName);
}

function renderWeeklyCalendar(sections, colors, index, exceptionIdentities = new Set(), courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  const layout = calendarLayout(sections, courseRules);
  const ticks = [];
  for (let time = layout.start; time <= layout.end; time += 30) {
    const isMajor = time % 60 === 0;
    const isFirst = time === layout.start;
    const isLast = time === layout.end;
    const tickClass = [
      'time-tick',
      isMajor ? 'tick-major' : 'tick-minor',
      isFirst ? 'first-tick' : '',
      isLast ? 'last-tick' : ''
    ].filter(Boolean).join(' ');
    ticks.push(`<span class="${tickClass}" style="top:${(time - layout.start) * layout.scale}px"><bdi dir="ltr">${minutesToTime(time)}</bdi></span>`);
  }
  return `
    <div class="calendar-scroll" tabindex="0" role="region" aria-label="التقويم الأسبوعي للاقتراح ${index + 1}">
      <div class="weekly-calendar ${layout.hasSaturday ? 'has-saturday' : ''}" style="--calendar-height:${layout.height}px;--hour-height:${60 * layout.scale}px;--calendar-days:${layout.days.length}">
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
              const time = formatTimeRange(meeting.start, meeting.end);
              const isBlended = meeting.displayMode === 'blended';
              const isRemote = !isBlended && (meeting.displayMode === 'remote' || meeting.remote);
              const modeLabel = isBlended ? 'مدمج' : isRemote ? 'عن بعد' : 'وجاهي';
              const isExceptionMeeting = exceptionIdentities.has(courseIdentity(sec));
              const tier = meetingTier(meeting.height);
              const blockLoc = formatBlockLocation(meeting);
              const roomBadgeHtml = (blockLoc && tier !== 'compact')
                ? `<span class="meeting-room-badge">${escapeHtml(blockLoc)}</span>`
                : '';
              const badgeHtml = isBlended
                ? '<span class="remote-badge badge-blended">🔄 مدمج</span>'
                : (isRemote ? '<span class="remote-badge">🌐 عن بعد</span>' : '');
              const locDesc = formatMeetingTooltipLocation(meeting);
              const description = `${sec.courseLabel} — شعبة ${sec.section}${instructors ? ' — ' + instructors : ''} — ${day} ${time} — ${modeLabel}${locDesc ? ' — المكان: ' + locDesc : ''}${isExceptionMeeting ? ' — استثناء مطبق' : ''}`;
              const shownInstructor = blockInstructorText(instructors, tier);
              const instructorHtml = instructors
                ? `<span class="meeting-instructor" title="${escapeHtml(instructors)}">${escapeHtml(shownInstructor)}</span>`
                : '';
              const sectionHtml = `<span class="meeting-section">شعبة ${escapeHtml(sec.section)}</span>`;
              const timeHtml = `<bdi class="meeting-time" dir="ltr">${time}</bdi>`;
              const metaHtml = tier === 'compact'
                ? `<span class="meeting-meta">${sectionHtml}${timeHtml}${badgeHtml}</span>`
                : `<span class="meeting-meta">${sectionHtml}${roomBadgeHtml}${badgeHtml}</span>`;
              const body = tier === 'compact'
                ? `<span class="meeting-course">${escapeHtml(sec.courseLabel)}</span>
                ${metaHtml}
                ${instructorHtml}`
                : `<span class="meeting-course">${escapeHtml(sec.courseLabel)}</span>
                ${metaHtml}
                ${instructorHtml}
                ${timeHtml}`;
              return `<button type="button" class="calendar-meeting meeting-${tier} course-color-${colors ? (colors.get(courseIdentity(sec)) ?? 0) : 0} ${isRemote ? 'meeting-remote' : ''} ${isBlended ? 'meeting-blended' : ''}${isExceptionMeeting ? ' meeting-exception' : ''}" style="top:${meeting.top}px;height:${meeting.height}px" data-start="${meeting.start}" data-end="${meeting.end}" data-course="${escapeHtml(courseIdentity(sec))}"${isExceptionMeeting ? ' data-exception="true"' : ''} title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}" aria-controls="schedule-details-${index}">
                ${body}
              </button>`;
            }).join('')}
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

let lastZeroScheduleDiagnostic = null;

function diagnoseCourseSections(sections, prefs, courseKey = '', courseLabel = '') {
  const totalSections = sections.length;
  const validSectionsList = sections.filter(isValidSchedulingSection);
  const validSections = validSectionsList.length;
  const unparseableSections = totalSections - validSections;

  const daysOffDays = new Set();
  let daysOffCount = 0;

  const notBeforeStarts = [];
  let notBeforeCount = 0;
  const notBeforeLimit = typeof prefs.notBefore === 'string' ? timeToMinutes(prefs.notBefore) : (prefs.notBefore ?? null);

  const notAfterEnds = [];
  let notAfterCount = 0;
  const notAfterLimit = typeof prefs.notAfter === 'string' ? timeToMinutes(prefs.notAfter) : (prefs.notAfter ?? null);

  const dayPatternRejections = [];
  let dayPatternCount = 0;

  const sectionDetails = [];
  let eligibleSections = 0;

  for (const sec of sections) {
    const evalResult = evaluateSectionEligibility(sec, prefs);
    if (evalResult.allowed) {
      eligibleSections++;
    } else {
      let hitDay = false;
      let hitStart = false;
      let hitEnd = false;
      let hitPattern = false;

      for (const r of evalResult.reasons) {
        if (r.type === 'day-off') {
          hitDay = true;
          r.days.forEach(d => daysOffDays.add(d));
        } else if (r.type === 'starts-before') {
          hitStart = true;
          notBeforeStarts.push(r.actualStart);
        } else if (r.type === 'ends-after') {
          hitEnd = true;
          notAfterEnds.push(r.actualEnd);
        } else if (r.type === 'course-day-pattern') {
          hitPattern = true;
          dayPatternRejections.push(r);
        }
      }
      if (hitDay) daysOffCount++;
      if (hitStart) notBeforeCount++;
      if (hitEnd) notAfterCount++;
      if (hitPattern) dayPatternCount++;
    }

    sectionDetails.push({
      section: sec.section,
      instructors: sec.instructors || [],
      meetings: sec.meetings || [],
      isUnscheduled: !!sec.isUnscheduled,
      allowed: evalResult.allowed,
      reasons: evalResult.reasons
    });
  }

  let status = 'ELIGIBLE';
  if (validSections === 0) {
    status = 'NO_VALID_DATA';
  } else if (eligibleSections === 0) {
    status = 'BLOCKED_BY_PREFS';
  }

  return {
    courseKey,
    courseLabel: courseLabel || sections[0]?.courseLabel || sections[0]?.detectedName || courseKey,
    totalSections,
    validSections,
    unparseableSections,
    eligibleSections,
    rejectionBreakdown: {
      daysOff: {
        count: daysOffCount,
        days: [...daysOffDays]
      },
      notBefore: {
        count: notBeforeCount,
        actualStarts: notBeforeStarts,
        limit: notBeforeLimit
      },
      notAfter: {
        count: notAfterCount,
        actualEnds: notAfterEnds,
        limit: notAfterLimit
      },
      dayPattern: {
        count: dayPatternCount,
        allowedPattern: prefs.allowedDayPattern ?? null,
        rejections: dayPatternRejections
      }
    },
    status,
    sectionDetails
  };
}

function checkScheduleFeasibility(courseSections, prefs, courseRules = null, options = {}) {
  const maxNodes = options.maxNodes ?? 2500;
  const targetKeys = options.activeKeys
    ? options.activeKeys.filter(k => !isCourseExcludedFromGeneration(courseRules, k))
    : [...courseSections.keys()].filter(k => !isCourseExcludedFromGeneration(courseRules, k));

  if (targetKeys.length === 0) {
    return { status: 'FEASIBLE', nodes: 0 };
  }

  const effectivePrefsByKey = new Map(
    targetKeys.map(k => [k, getEffectivePrefsForCourse(prefs, getCourseRule(courseRules, k))])
  );

  const eligibleSectionsByKey = new Map();
  for (const k of targetKeys) {
    const cp = effectivePrefsByKey.get(k);
    const secs = (courseSections.get(k) || []).filter(s =>
      isValidSchedulingSection(s) &&
      isAllowed(s, cp) &&
      !s.meetings.some((m, i) => s.meetings.slice(i + 1).some(n => conflicts(m, n)))
    );
    if (secs.length === 0) {
      return { status: 'INFEASIBLE', nodes: 0 };
    }
    eligibleSectionsByKey.set(k, secs);
  }

  // Minimum Remaining Values (MRV): sort keys by eligible section count ascending
  const sortedKeys = [...targetKeys].sort(
    (a, b) => eligibleSectionsByKey.get(a).length - eligibleSectionsByKey.get(b).length
  );

  let nodes = 0;
  let truncated = false;
  let found = false;

  function dfs(index, chosen) {
    if (nodes >= maxNodes) {
      truncated = true;
      return;
    }
    nodes++;
    if (index === sortedKeys.length) {
      found = true;
      return;
    }
    const k = sortedKeys[index];
    const sections = eligibleSectionsByKey.get(k);
    for (const section of sections) {
      if (found || truncated) return;
      if (nodes >= maxNodes) {
        truncated = true;
        return;
      }
      nodes++;
      if (sectionConflicts(section, chosen)) continue;
      if (chosen.some(s => s.courseNumber && s.courseNumber === section.courseNumber)) continue;
      chosen.push(section);
      dfs(index + 1, chosen);
      chosen.pop();
    }
  }

  dfs(0, []);

  if (found) {
    return { status: 'FEASIBLE', nodes };
  }
  if (truncated) {
    return { status: 'UNKNOWN', nodes };
  }
  return { status: 'INFEASIBLE', nodes };
}

function extractConflictCores(allSections, prefs, courseRules = null, options = {}) {
  const activeKeys = [...allSections.keys()].filter(k => !isCourseExcludedFromGeneration(courseRules, k));
  const maxNodes = options.maxNodes ?? 2500;

  const initialCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys });
  if (initialCheck.status === 'FEASIBLE') {
    return { cores: [], inconclusive: false };
  }
  if (initialCheck.status === 'UNKNOWN') {
    return {
      cores: [{
        courseKeys: activeKeys,
        courses: activeKeys.map(k => ({
          key: k,
          label: allSections.get(k)?.[0]?.courseLabel || k
        })),
        isVerifiedMinimal: false,
        isProvenMinimumCardinality: false
      }],
      inconclusive: true
    };
  }

  const cores = [];
  let inconclusive = false;

  // Extract first core via deletion shrinking
  let currentCandidate = [...activeKeys];

  for (const c of activeKeys) {
    if (currentCandidate.length <= 2) {
      break;
    }
    const testSubset = currentCandidate.filter(k => k !== c);
    const testRes = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: testSubset });
    if (testRes.status === 'INFEASIBLE') {
      currentCandidate = testSubset;
    } else if (testRes.status === 'UNKNOWN') {
      inconclusive = true;
    }
  }

  // Strict verification of candidate core (Refinement 1)
  const coreSelfCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: currentCandidate });
  let isVerifiedMinimal = coreSelfCheck.status === 'INFEASIBLE';

  if (isVerifiedMinimal) {
    for (const c of currentCandidate) {
      const sub = currentCandidate.filter(k => k !== c);
      const subCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: sub });
      if (subCheck.status !== 'FEASIBLE') {
        isVerifiedMinimal = false;
        if (subCheck.status === 'UNKNOWN') inconclusive = true;
        break;
      }
    }
  } else if (coreSelfCheck.status === 'UNKNOWN') {
    inconclusive = true;
  }

  const core1 = {
    courseKeys: currentCandidate,
    courses: currentCandidate.map(k => ({
      key: k,
      label: allSections.get(k)?.[0]?.courseLabel || k
    })),
    isVerifiedMinimal,
    isProvenMinimumCardinality: isVerifiedMinimal && currentCandidate.length === 2
  };
  cores.push(core1);

  // Check for second independent conflict core among remaining courses (Refinement 4)
  const remainingKeys = activeKeys.filter(k => !currentCandidate.includes(k));
  if (remainingKeys.length >= 2) {
    const remCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: remainingKeys });
    if (remCheck.status === 'INFEASIBLE') {
      let core2Candidate = [...remainingKeys];
      for (const c of remainingKeys) {
        if (core2Candidate.length <= 2) break;
        const testSub = core2Candidate.filter(k => k !== c);
        const testRes = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: testSub });
        if (testRes.status === 'INFEASIBLE') {
          core2Candidate = testSub;
        } else if (testRes.status === 'UNKNOWN') {
          inconclusive = true;
        }
      }

      const core2SelfCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: core2Candidate });
      let core2Verified = core2SelfCheck.status === 'INFEASIBLE';
      if (core2Verified) {
        for (const c of core2Candidate) {
          const sub = core2Candidate.filter(k => k !== c);
          const subCheck = checkScheduleFeasibility(allSections, prefs, courseRules, { maxNodes, activeKeys: sub });
          if (subCheck.status !== 'FEASIBLE') {
            core2Verified = false;
            if (subCheck.status === 'UNKNOWN') inconclusive = true;
            break;
          }
        }
      } else if (core2SelfCheck.status === 'UNKNOWN') {
        inconclusive = true;
      }

      cores.push({
        courseKeys: core2Candidate,
        courses: core2Candidate.map(k => ({
          key: k,
          label: allSections.get(k)?.[0]?.courseLabel || k
        })),
        isVerifiedMinimal: core2Verified,
        isProvenMinimumCardinality: core2Verified && core2Candidate.length === 2
      });
    } else if (remCheck.status === 'UNKNOWN') {
      inconclusive = true;
    }
  }

  return { cores, inconclusive };
}

function findVerifiedExclusionRecommendations(allSections, prefs, courseRules = null, options = {}, knownCores = []) {
  const activeKeys = [...allSections.keys()].filter(k => !isCourseExcludedFromGeneration(courseRules, k));
  const maxNodes = options.maxNodes ?? 2500;
  const verifiedSingleRemovals = [];
  const verifiedPairRemovals = [];
  let hasInconclusiveSingleTests = false;
  let hasInconclusivePairTests = false;

  // Single-course removals tested against all remaining active courses
  for (const c of activeKeys) {
    const remaining = activeKeys.filter(k => k !== c);
    const testRules = new Map(courseRules || []);
    const existingRule = getCourseRule(testRules, c) || createCourseRule();
    testRules.set(c, { ...existingRule, excludedFromGeneration: true });

    const res = checkScheduleFeasibility(allSections, prefs, testRules, { maxNodes, activeKeys: remaining });
    if (res.status === 'FEASIBLE') {
      verifiedSingleRemovals.push({
        courseKey: c,
        courseLabel: allSections.get(c)?.[0]?.courseLabel || c
      });
    } else if (res.status === 'UNKNOWN') {
      hasInconclusiveSingleTests = true;
    }
  }

  let isProvenMinimumCardinality = false;

  if (verifiedSingleRemovals.length > 0) {
    isProvenMinimumCardinality = true;
  } else {
    // Bounded two-course removals if no single-course removal restores the schedule (Refinement 4)
    const candidatePairs = [];
    const pairKeysSeen = new Set();

    function addPair(c1, c2) {
      if (c1 === c2) return;
      const sorted = [c1, c2].sort();
      const pairKey = sorted.join(':::');
      if (!pairKeysSeen.has(pairKey)) {
        pairKeysSeen.add(pairKey);
        candidatePairs.push(sorted);
      }
    }

    if (knownCores.length >= 2) {
      const coreA = knownCores[0].courseKeys || [];
      const coreB = knownCores[1].courseKeys || [];
      for (const a of coreA) {
        for (const b of coreB) {
          addPair(a, b);
        }
      }
    }

    if (knownCores.length >= 1) {
      const coreCourses = knownCores[0].courseKeys || [];
      for (let i = 0; i < coreCourses.length; i++) {
        for (let j = i + 1; j < coreCourses.length; j++) {
          addPair(coreCourses[i], coreCourses[j]);
        }
      }
      const outside = activeKeys.filter(k => !coreCourses.includes(k));
      for (const a of coreCourses) {
        for (const b of outside) {
          addPair(a, b);
        }
      }
    }

    for (let i = 0; i < activeKeys.length; i++) {
      for (let j = i + 1; j < activeKeys.length; j++) {
        if (candidatePairs.length >= 45) break;
        addPair(activeKeys[i], activeKeys[j]);
      }
      if (candidatePairs.length >= 45) break;
    }

    for (const [c1, c2] of candidatePairs) {
      const remaining = activeKeys.filter(k => k !== c1 && k !== c2);
      const testRules = new Map(courseRules || []);
      const rule1 = getCourseRule(testRules, c1) || createCourseRule();
      const rule2 = getCourseRule(testRules, c2) || createCourseRule();
      testRules.set(c1, { ...rule1, excludedFromGeneration: true });
      testRules.set(c2, { ...rule2, excludedFromGeneration: true });

      const res = checkScheduleFeasibility(allSections, prefs, testRules, { maxNodes, activeKeys: remaining });
      if (res.status === 'FEASIBLE') {
        verifiedPairRemovals.push({
          courseKeys: [c1, c2],
          courseLabels: [
            allSections.get(c1)?.[0]?.courseLabel || c1,
            allSections.get(c2)?.[0]?.courseLabel || c2
          ]
        });
      } else if (res.status === 'UNKNOWN') {
        hasInconclusivePairTests = true;
      }
    }

    if (verifiedPairRemovals.length > 0 && !hasInconclusiveSingleTests) {
      isProvenMinimumCardinality = true;
    }
  }

  return {
    verifiedSingleRemovals,
    verifiedPairRemovals,
    hasInconclusiveTests: hasInconclusiveSingleTests || hasInconclusivePairTests,
    isProvenMinimumCardinality
  };
}

function analyzeCombinationConflict(allSections, prefs, courseRules = null, options = {}) {
  const activeKeys = [...allSections.keys()].filter(key => !isCourseExcludedFromGeneration(courseRules, key));
  const totalActiveCourses = activeKeys.length;

  if (activeKeys.length < 2) {
    return {
      conflictCores: [],
      recommendations: {
        verifiedSingleRemovals: [],
        verifiedPairRemovals: [],
        hasInconclusiveTests: false,
        isProvenMinimumCardinality: false
      },
      otherActiveCourses: [],
      inconclusive: false,
      totalActiveCourses
    };
  }

  const coreResult = extractConflictCores(allSections, prefs, courseRules, options);
  const conflictCores = coreResult.cores || [];
  let inconclusive = Boolean(coreResult.inconclusive);

  const recResult = findVerifiedExclusionRecommendations(allSections, prefs, courseRules, options, conflictCores);
  if (recResult.hasInconclusiveTests) {
    inconclusive = true;
  }

  const primaryCoreKeys = new Set(conflictCores[0]?.courseKeys || []);
  const otherActiveCourses = activeKeys
    .filter(k => !primaryCoreKeys.has(k))
    .map(k => ({
      key: k,
      label: allSections.get(k)?.[0]?.courseLabel || k
    }));

  return {
    conflictCores,
    recommendations: recResult,
    otherActiveCourses,
    inconclusive,
    totalActiveCourses
  };
}

function diagnoseZeroSchedules(allSections, prefs, schedulesResult, courseRules = null) {
  const courseDiagnostics = new Map();
  const blockedCourses = [];
  const noValidDataCourses = [];

  for (const [key, sections] of allSections.entries()) {
    // Temporarily excluded courses are not required for the current generation.
    if (isCourseExcludedFromGeneration(courseRules, key)) continue;
    const effectivePrefs = getEffectivePrefsForCourse(prefs, getCourseRule(courseRules, key));
    const diag = diagnoseCourseSections(sections, effectivePrefs, key, sections[0]?.courseLabel);
    courseDiagnostics.set(key, diag);
    if (diag.status === 'BLOCKED_BY_PREFS') {
      blockedCourses.push(diag);
    } else if (diag.status === 'NO_VALID_DATA') {
      noValidDataCourses.push(diag);
    }
  }

  // Priority 1: No valid data
  if (noValidDataCourses.length > 0) {
    return {
      category: 'NO_VALID_DATA',
      blockedCourses: [],
      noValidDataCourses,
      pairwiseConflicts: [],
      truncated: Boolean(schedulesResult?.truncated),
      courseDiagnostics
    };
  }

  // Priority 2: One or more courses completely blocked by preferences
  if (blockedCourses.length > 0) {
    return {
      category: 'BLOCKED_BY_PREFS',
      blockedCourses,
      noValidDataCourses: [],
      pairwiseConflicts: [],
      truncated: Boolean(schedulesResult?.truncated),
      courseDiagnostics
    };
  }

  // Priority 3: Search truncated by safety limit
  if (schedulesResult?.truncated === true) {
    return {
      category: 'SEARCH_TRUNCATED',
      blockedCourses: [],
      noValidDataCourses: [],
      pairwiseConflicts: [],
      truncated: true,
      nodes: schedulesResult.nodes || 50000,
      courseDiagnostics
    };
  }

  // Priority 4: Mandatory pairwise conflict
  const keys = [...allSections.keys()].filter(key => !isCourseExcludedFromGeneration(courseRules, key));
  const pairwiseConflicts = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const keyA = keys[i];
      const keyB = keys[j];
      const diagA = courseDiagnostics.get(keyA);
      const diagB = courseDiagnostics.get(keyB);
      const prefsA = getEffectivePrefsForCourse(prefs, getCourseRule(courseRules, keyA));
      const prefsB = getEffectivePrefsForCourse(prefs, getCourseRule(courseRules, keyB));

      const eligibleA = (allSections.get(keyA) || []).filter(s => isAllowed(s, prefsA));
      const eligibleB = (allSections.get(keyB) || []).filter(s => isAllowed(s, prefsB));

      if (eligibleA.length > 0 && eligibleB.length > 0) {
        // Check if every section in eligibleA conflicts with every section in eligibleB
        const allClash = eligibleA.every(sa =>
          eligibleB.every(sb =>
            sa.meetings.some(ma => sb.meetings.some(mb => conflicts(ma, mb)))
          )
        );

        if (allClash) {
          pairwiseConflicts.push({
            courseA: { key: keyA, label: diagA.courseLabel },
            courseB: { key: keyB, label: diagB.courseLabel },
            eligibleACount: eligibleA.length,
            eligibleBCount: eligibleB.length
          });
        }
      }
    }
  }

  if (pairwiseConflicts.length > 0) {
    return {
      category: 'PAIRWISE_CONFLICT',
      blockedCourses: [],
      noValidDataCourses: [],
      pairwiseConflicts,
      truncated: false,
      courseDiagnostics
    };
  }

  // Priority 5: Complex / N-way combination conflict
  const conflictResolution = analyzeCombinationConflict(allSections, prefs, courseRules);
  return {
    category: 'COMBINATION_CONFLICT',
    blockedCourses: [],
    noValidDataCourses: [],
    pairwiseConflicts: [],
    truncated: Boolean(conflictResolution.inconclusive),
    courseDiagnostics,
    conflictResolution
  };
}

function renderBlockedCourseDecisionsHtml(blockedCourses) {
  if (!blockedCourses || !blockedCourses.length) return '';

  return `
    <div class="diagnostic-decisions">
      <div class="diagnostic-decisions-header">
        <span class="diagnostic-decisions-title">الخيارات المتاحة للمتابعة:</span>
        <span class="diagnostic-decisions-subtitle">يمكنك إدراج المادة المحظورة كاستثناء لتجاوز تفضيلاتك الخاصة بها فقط، أو استبعادها من هذا التوليد.</span>
      </div>
      <div class="diagnostic-decisions-list">
        ${blockedCourses.map(course => {
          const bd = course.rejectionBreakdown || {};
          const hasDaysOff = Boolean(bd.daysOff && bd.daysOff.count > 0);
          const hasNotBefore = Boolean(bd.notBefore && bd.notBefore.count > 0);
          const hasNotAfter = Boolean(bd.notAfter && bd.notAfter.count > 0);
          const hasDayPattern = Boolean(bd.dayPattern && bd.dayPattern.count > 0);

          const overrides = {
            ignoreDaysOff: hasDaysOff,
            ignoreNotBefore: hasNotBefore,
            ignoreNotAfter: hasNotAfter
          };

          const bypassedLabels = [];
          if (hasDayPattern) bypassedLabels.push('نمط أيام المادة');
          if (hasDaysOff) bypassedLabels.push('أيام عدم الدوام');
          if (hasNotBefore) bypassedLabels.push('وقت البدء');
          if (hasNotAfter) bypassedLabels.push('وقت النهاية');

          let exceptionBtnLabel = 'إدراج كاستثناء';
          if (bypassedLabels.length === 1) {
            if (hasDaysOff) {
              exceptionBtnLabel = 'إدراج كاستثناء — السماح بأيام عدم الدوام لهذه المادة';
            } else if (hasNotBefore) {
              exceptionBtnLabel = 'إدراج كاستثناء — السماح بالبدء قبل وقت البدء المختار';
            } else if (hasNotAfter) {
              exceptionBtnLabel = 'إدراج كاستثناء — السماح بتجاوز وقت النهاية المختار';
            }
          } else if (bypassedLabels.length > 1) {
            const exceptionLabels = bypassedLabels.filter(l => l !== 'نمط أيام المادة');
            if (exceptionLabels.length) {
              exceptionBtnLabel = `إدراج كاستثناء (تجاوز ${joinArabicList(exceptionLabels)} لهذه المادة فقط)`;
            }
          }

          const overridesJson = escapeHtml(JSON.stringify(overrides));
          const hasGlobalViolations = hasDaysOff || hasNotBefore || hasNotAfter;

          return `
            <div class="diagnostic-decision-card" data-course-key="${escapeHtml(course.courseKey)}">
              <div class="diagnostic-decision-course">
                <b>${escapeHtml(course.courseLabel)}</b>
                <span class="diagnostic-decision-reason">تعارضت جميع شعبها مع: ${joinArabicList(bypassedLabels)}</span>
              </div>
              <div class="diagnostic-decision-actions">
                ${hasDayPattern ? `
                  <button type="button" class="btn-exception-action btn-reset-pattern" data-action="reset-course-pattern" data-course-key="${escapeHtml(course.courseKey)}" title="إعادة السماح بجميع الأنماط لمادة ${escapeHtml(course.courseLabel)}">
                    🔄 إعادة السماح بجميع الأنماط
                  </button>
                ` : ''}
                ${hasGlobalViolations ? `
                  <button type="button" class="btn-exception-action btn-apply-exception" data-action="apply-exception" data-course-key="${escapeHtml(course.courseKey)}" data-overrides="${overridesJson}" title="${escapeHtml(exceptionBtnLabel)}">
                    ⚡ ${escapeHtml(exceptionBtnLabel)}
                  </button>
                ` : ''}
                <button type="button" class="btn-exception-action btn-exclude-course" data-action="exclude-course" data-course-key="${escapeHtml(course.courseKey)}" title="استبعاد من هذا التوليد">
                  🚫 استبعاد من هذا التوليد
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderZeroScheduleDiagnosticHtml(diagnostic) {
  if (!diagnostic) {
    return `<div class="section warn">لم أجد تركيبة كاملة من الشعب المقروءة بدون تعارض ضمن شروط الوقت الحالية. جرّب توسيع حدود الوقت أو تغيير الأيام المستبعدة.</div>`;
  }

  let cardType = 'warn';
  let icon = '⚠️';
  let title = 'تعذر إنشاء جدول كامل';
  let subtitle = '';
  let affectedCourseNames = [];
  let detailsContentHtml = '';
  let hintHtml = '';
  let decisionHtml = '';

  if (diagnostic.category === 'BLOCKED_BY_PREFS') {
    cardType = 'warn';
    icon = '⚠️';
    title = 'تعذر إنشاء جدول كامل';
    subtitle = 'بعض المواد لا تتوافق مع تفضيلاتك الحالية.';
    affectedCourseNames = diagnostic.blockedCourses.map(c => c.courseLabel);

    const courseCards = diagnostic.blockedCourses.map(course => {
      const bd = course.rejectionBreakdown;
      let reasonSummary = '';

      if (bd.dayPattern?.count === course.validSections && bd.daysOff.count === 0 && bd.notBefore.count === 0 && bd.notAfter.count === 0) {
        const patternLabel = formatDayPatternLabel(bd.dayPattern.allowedPattern);
        reasonSummary = `<p class="diagnostic-reason">لم تتوفر جداول ضمن نمط الأيام المختار لمادة <b>${escapeHtml(course.courseLabel)}</b> (<b>${escapeHtml(patternLabel)}</b>).</p>`;
      } else if (bd.daysOff.count === course.validSections && bd.notBefore.count === 0 && bd.notAfter.count === 0 && (!bd.dayPattern || bd.dayPattern.count === 0)) {
        const daysStr = bd.daysOff.days.join('، ');
        reasonSummary = `<p class="diagnostic-reason">جميع الشعب المتاحة (${formatSectionCountArabic(course.validSections)}) تقع في أيام اخترت عدم الدوام فيها: <b>${escapeHtml(daysStr)}</b>.</p>`;
      } else if (bd.notAfter.count === course.validSections && bd.daysOff.count === 0 && bd.notBefore.count === 0 && (!bd.dayPattern || bd.dayPattern.count === 0)) {
        const limitStr = minutesToTime(bd.notAfter.limit);
        reasonSummary = `<p class="diagnostic-reason">جميع الشعب المتاحة (${formatSectionCountArabic(course.validSections)}) تنتهي بعد الحد الأقصى الذي اخترته (<bdi dir="ltr">${limitStr}</bdi>).</p>`;
      } else if (bd.notBefore.count === course.validSections && bd.daysOff.count === 0 && bd.notAfter.count === 0 && (!bd.dayPattern || bd.dayPattern.count === 0)) {
        const limitStr = minutesToTime(bd.notBefore.limit);
        reasonSummary = `<p class="diagnostic-reason">جميع الشعب المتاحة (${formatSectionCountArabic(course.validSections)}) تبدأ قبل الحد الأدنى الذي اخترته (<bdi dir="ltr">${limitStr}</bdi>).</p>`;
      } else {
        const items = [];
        if (bd.dayPattern?.count > 0) {
          items.push(`${formatSectionCountArabic(bd.dayPattern.count)} لا تطابق نمط الأيام المختار (${escapeHtml(formatDayPatternLabel(bd.dayPattern.allowedPattern))})`);
        }
        if (bd.daysOff.count > 0) {
          items.push(`${formatSectionCountArabic(bd.daysOff.count)} تقع في أيام اخترت عدم الدوام فيها (${escapeHtml(bd.daysOff.days.join('، '))})`);
        }
        if (bd.notAfter.count > 0) {
          items.push(`${formatSectionCountArabic(bd.notAfter.count)} تنتهي بعد الحد الأقصى (<bdi dir="ltr">${minutesToTime(bd.notAfter.limit)}</bdi>)`);
        }
        if (bd.notBefore.count > 0) {
          items.push(`${formatSectionCountArabic(bd.notBefore.count)} تبدأ قبل الحد الأدنى (<bdi dir="ltr">${minutesToTime(bd.notBefore.limit)}</bdi>)`);
        }
        reasonSummary = `
          <p class="diagnostic-reason">لا توجد شعبة متوافقة مع تفضيلاتك من أصل ${formatSectionCountArabic(course.validSections)} متاحة:</p>
          <ul class="diagnostic-reasons-list">
            ${items.map(it => `<li>${it}</li>`).join('')}
          </ul>
        `;
      }

      const detailsHtml = course.sectionDetails.map(sd => {
        const reasonsText = sd.allowed
          ? 'متوافقة مع التفضيلات'
          : sd.reasons.map(r => {
              if (r.type === 'course-day-pattern') return `نمط غير مسموح: ${formatDayPatternLabel(r.actualPattern)}`;
              if (r.type === 'day-off') return `يوم عطلة: ${r.days.join('، ')}`;
              if (r.type === 'starts-before') return `تبدأ ${minutesToTime(r.actualStart)} قبل ${minutesToTime(r.limit)}`;
              if (r.type === 'ends-after') return `تنتهي ${minutesToTime(r.actualEnd)} بعد ${minutesToTime(r.limit)}`;
              return r.label || r.type;
            }).join('؛ ');
        const meets = sd.isUnscheduled ? 'بدون موعد مجدول' : meetingText(sd.meetings);
        return `<div class="diagnostic-section-row">
          <b>شعبة ${escapeHtml(sd.section)}</b>: ${escapeHtml(meets)}
          ${sd.instructors?.length ? ` (${escapeHtml(sd.instructors.join('، '))})` : ''}
          — <span class="badge ${sd.allowed ? 'badge-green' : 'badge-warn'}">${escapeHtml(reasonsText)}</span>
        </div>`;
      }).join('');

      return `
        <div class="diagnostic-course-item">
          <h4>${escapeHtml(course.courseLabel)}</h4>
          ${reasonSummary}
          <details class="diagnostic-details">
            <summary>عرض تفاصيل الشعب (${formatSectionCountArabic(course.validSections)})</summary>
            <div class="diagnostic-details-content">
              ${detailsHtml}
            </div>
          </details>
        </div>
      `;
    }).join('');

    detailsContentHtml = courseCards;
    decisionHtml = renderBlockedCourseDecisionsHtml(diagnostic.blockedCourses);
    const hasPatternBlocked = diagnostic.blockedCourses.some(c => c.rejectionBreakdown?.dayPattern?.count > 0);
    hintHtml = `
      <div class="diagnostic-hint">
        <span>💡 يمكنك تعديل أيام عدم الدوام أو حدود الوقت أعلاه لإتاحة خيارات لهذه المواد${hasPatternBlocked ? '، أو إعادة السماح بجميع الأنماط للمادة المقيدة' : ''}.</span>
      </div>
    `;
  } else if (diagnostic.category === 'PAIRWISE_CONFLICT') {
    cardType = 'danger';
    icon = '⚠️';
    title = 'تعذر إنشاء جدول كامل';
    subtitle = 'يوجد تعارض حتمي بين مواعيد المواد المطلوبة:';

    const namesSet = new Set();
    for (const pair of diagnostic.pairwiseConflicts) {
      if (pair.courseA?.label) namesSet.add(pair.courseA.label);
      if (pair.courseB?.label) namesSet.add(pair.courseB.label);
    }
    affectedCourseNames = [...namesSet];

    const pairsHtml = diagnostic.pairwiseConflicts.map(pair => `
      <div class="diagnostic-conflict-item">
        <p class="diagnostic-reason">لا يمكن جمع مادة <b>${escapeHtml(pair.courseA.label)}</b> مع مادة <b>${escapeHtml(pair.courseB.label)}</b> بدون تعارض ضمن الشعب المتاحة المتوافقة مع تفضيلاتك.</p>
        <p class="small">كل شعبة متوافقة في المادة الأولى (${formatSectionCountArabic(pair.eligibleACount)}) تتعارض زمنيًا مع كل شعبة متوافقة في المادة الثانية (${formatSectionCountArabic(pair.eligibleBCount)}).</p>
      </div>
    `).join('');

    detailsContentHtml = pairsHtml;
    hintHtml = `
      <div class="diagnostic-hint">
        <span>💡 للتسجيل، يجب استبعاد إحدى المادتين أو تعديل التفضيلات لإتاحة شعب بديلة إن وُجدت.</span>
      </div>
    `;
  } else if (diagnostic.category === 'COMBINATION_CONFLICT') {
    cardType = 'warn';
    icon = '⚠️';
    title = 'تعذر إنشاء جدول كامل';
    subtitle = 'توجد تعارضات مركبة بين الشعب المتاحة تمنع تكوين جدول كامل.';

    const res = diagnostic.conflictResolution;
    const diagList = diagnostic.courseDiagnostics instanceof Map
      ? [...diagnostic.courseDiagnostics.values()]
      : (Array.isArray(diagnostic.courseDiagnostics) ? diagnostic.courseDiagnostics : []);
    const allEvalCourseNames = diagList.map(cd => cd.courseLabel);

    if (res && res.conflictCores && res.conflictCores.length > 0) {
      affectedCourseNames = [];

      const coresHtml = res.conflictCores.map((core, idx) => {
        const coreNumStr = res.conflictCores.length > 1 ? ` (${idx + 1})` : '';
        const coreBadges = core.courses.map(c => `
          <span class="badge badge-conflict-course">${escapeHtml(c.label)}</span>
        `).join('');
        const minimalStatusNote = core.isVerifiedMinimal
          ? '<span class="diagnostic-core-status-badge">مجموعة صغرى مؤكدة</span>'
          : '<span class="diagnostic-core-status-badge is-unverified">مجموعة تعارض محتملة</span>';

        return `
          <div class="diagnostic-conflict-core-card">
            <div class="diagnostic-core-header">
              <div class="diagnostic-core-title-row">
                <span class="diagnostic-core-icon">🔍</span>
                <span class="diagnostic-core-title">سبب تعذّر إنشاء الجدول — مجموعة التعارض المحددة${coreNumStr}:</span>
              </div>
              ${minimalStatusNote}
            </div>
            <p class="diagnostic-reason">يتعذّر الجمع بين الشعب المتاحة للمواد التالية في نفس الوقت بدون تعارض زمني:</p>
            <div class="diagnostic-core-badges">
              ${coreBadges}
            </div>
          </div>
        `;
      }).join('');

      let decisionsHtml = '';
      const recs = res.recommendations;
      if (recs && recs.verifiedSingleRemovals && recs.verifiedSingleRemovals.length > 0) {
        const cardinalityNote = recs.isProvenMinimumCardinality ? ' (الحد الأدنى للاستبعاد: مادة واحدة)' : '';
        decisionsHtml = `
          <div class="diagnostic-decisions">
            <div class="diagnostic-decisions-header">
              <span class="diagnostic-decisions-title">حلول مقترحة (مؤكدة عملياً)${cardinalityNote}:</span>
              <span class="diagnostic-decisions-subtitle">جرّب استبعاد إحدى المواد التالية لإتاحة جدول كامل لبقية المواد:</span>
            </div>
            <div class="diagnostic-decisions-list">
              ${recs.verifiedSingleRemovals.map(item => `
                <div class="diagnostic-decision-card">
                  <div class="diagnostic-decision-course">
                    <b>${escapeHtml(item.courseLabel)}</b>
                    <span class="diagnostic-decision-reason">استبعادها يتيح تكوين جدول كامل لبقية المواد (${res.totalActiveCourses - 1} مواد).</span>
                  </div>
                  <div class="diagnostic-decision-actions">
                    <button type="button" class="btn-decision-action btn-exclude-course" data-action="exclude-course" data-course-key="${escapeHtml(item.courseKey)}">
                      🚫 استبعاد ${escapeHtml(item.courseLabel)}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (recs && recs.verifiedPairRemovals && recs.verifiedPairRemovals.length > 0) {
        const cardinalityNote = recs.isProvenMinimumCardinality ? ' (الحد الأدنى للاستبعاد: مادتان)' : '';
        decisionsHtml = `
          <div class="diagnostic-decisions">
            <div class="diagnostic-decisions-header">
              <span class="diagnostic-decisions-title">حلول مقترحة (مؤكدة عملياً عبر استبعاد مادتين)${cardinalityNote}:</span>
              <span class="diagnostic-decisions-subtitle">لا يكفي استبعاد مادة واحدة لإتاحة جدول كامل. استبعاد أحد أزواج المواد التالية يتيح تكوين جدول لبقية المواد:</span>
            </div>
            <div class="diagnostic-decisions-list">
              ${recs.verifiedPairRemovals.map(item => `
                <div class="diagnostic-decision-card">
                  <div class="diagnostic-decision-course">
                    <b>${escapeHtml(item.courseLabels.join(' + '))}</b>
                    <span class="diagnostic-decision-reason">استبعاد هاتين المادتين يتيح تكوين جدول كامل لبقية المواد (${res.totalActiveCourses - 2} مواد).</span>
                  </div>
                  <div class="diagnostic-decision-actions">
                    <button type="button" class="btn-decision-action btn-exclude-course" data-action="exclude-courses" data-course-keys="${escapeHtml(item.courseKeys.join(','))}">
                      🚫 استبعاد المادتين
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      let inconclusiveHtml = '';
      if (res.inconclusive) {
        inconclusiveHtml = `
          <div class="diagnostic-inconclusive-note">
            <span>⏱️ توقف الفحص عند حد الأمان قبل اختبار كافة التوافيق المتبقية؛ النتائج المعروضة جزئية.</span>
          </div>
        `;
      }

      let otherCoursesHtml = '';
      if (res.otherActiveCourses && res.otherActiveCourses.length > 0) {
        otherCoursesHtml = `
          <details class="diagnostic-details diagnostic-other-courses-details">
            <summary>المواد الأخرى المفحوصة في هذه الجولة (${res.otherActiveCourses.length} مواد)</summary>
            <div class="diagnostic-details-content">
              <p class="diagnostic-other-courses-desc">هذه المواد كانت مشمولة في الفحص ولكنها لم تكن ضمن مجموعة التعارض المحددة أعلاه:</p>
              <div class="diagnostic-other-courses-badges">
                ${res.otherActiveCourses.map(c => `<span class="badge">${escapeHtml(c.label)}</span>`).join('')}
              </div>
            </div>
          </details>
        `;
      }

      decisionHtml = `
        ${coresHtml}
        ${decisionsHtml}
        ${inconclusiveHtml}
        ${otherCoursesHtml}
      `;

      detailsContentHtml = `
        <p class="diagnostic-reason">كل مادة تمتلك شعباً متوافقة مع تفضيلاتك بشكل فردي، ولكن لا توجد أي تركيبة كاملة لجميع المواد معاً تخلو من التعارضات الزمنية في نفس الوقت.</p>
        <p class="diagnostic-summary-list">المواد المفحوصة كلياً: ${allEvalCourseNames.map(name => `<b>${escapeHtml(name)}</b>`).join('، ')}</p>
      `;

      hintHtml = `
        <div class="diagnostic-hint">
          <span>💡 استبعاد مادة من التوليد مؤقت ويسري على هذه الجولة فقط، ويمكنك إعادتها لاحقاً بزر الاسترجاع (🔄) في أي وقت.</span>
        </div>
      `;
    } else {
      affectedCourseNames = allEvalCourseNames;
      const courseListHtml = affectedCourseNames.length
        ? `<p class="diagnostic-summary-list">المواد المفحوصة: ${affectedCourseNames.map(name => `<b>${escapeHtml(name)}</b>`).join('، ')}</p>`
        : '';

      detailsContentHtml = `
        <p class="diagnostic-reason">كل مادة تمتلك شعباً متوافقة مع تفضيلاتك بشكل فردي، ولكن لا توجد أي تركيبة كاملة لجميع المواد معاً تخلو من التعارضات الزمنية في نفس الوقت.</p>
        ${courseListHtml}
      `;
      hintHtml = `
        <div class="diagnostic-hint">
          <span>💡 جرّب استبعاد مادة واحدة أو توسيع خيارات الوقت وأيام الدوام لإيجاد توافيق ممكنة.</span>
        </div>
      `;
    }
  } else if (diagnostic.category === 'SEARCH_TRUNCATED') {
    cardType = 'info';
    icon = '⏱️';
    title = 'توقف البحث عند حد الأمان';
    subtitle = `وصل البحث إلى الحد الأقصى (${diagnostic.nodes || 50000} خطوة) قبل العثور على جدول كامل.`;

    const diagList = diagnostic.courseDiagnostics instanceof Map
      ? [...diagnostic.courseDiagnostics.values()]
      : (Array.isArray(diagnostic.courseDiagnostics) ? diagnostic.courseDiagnostics : []);
    affectedCourseNames = diagList.map(cd => cd.courseLabel);

    detailsContentHtml = `
      <p class="diagnostic-reason">وصل البحث إلى حد الأمان قبل العثور على جدول كامل. هذا لا يعني بالضرورة أن الجدول مستحيل؛ بل إن عدد الاحتمالات كبير جداً في الفروع التي تم فحصها.</p>
    `;
    hintHtml = `
      <div class="diagnostic-hint">
        <span>💡 جرّب تضييق أوقات الدوام أو استبعاد أيام لتقليل عدد التوافيق، أو تقليل عدد المواد المدخلة.</span>
      </div>
    `;
  } else if (diagnostic.category === 'NO_VALID_DATA') {
    cardType = 'danger';
    icon = '⚠️';
    title = 'بيانات غير مكتملة';
    subtitle = 'توجد مواد لا تتوفر لها مواعيد صالحة للجدولة:';
    affectedCourseNames = diagnostic.noValidDataCourses.map(c => c.courseLabel);

    const listHtml = diagnostic.noValidDataCourses.map(c => `<li><b>${escapeHtml(c.courseLabel)}</b>: لا تتوفر أي شعبة بمواعيد مكتملة ضمن أسبوع الدوام.</li>`).join('');

    detailsContentHtml = `
      <ul class="diagnostic-reasons-list">
        ${listHtml}
      </ul>
    `;
    hintHtml = `
      <div class="diagnostic-hint">
        <span>💡 يُرجى مراجعة تفاصيل الشعب في قائمة المواد أعلاه أو استبعاد هذه المواد.</span>
      </div>
    `;
  } else {
    return `<div class="section warn">لم أجد تركيبة كاملة من الشعب المقروءة بدون تعارض ضمن شروط الوقت الحالية. جرّب توسيع حدود الوقت أو تغيير الأيام المستبعدة.</div>`;
  }

  const affectedListHtml = affectedCourseNames.length > 0 ? `
    <div class="diagnostic-affected-courses">
      <span class="diagnostic-affected-label">المواد المتأثرة:</span>
      <ul class="diagnostic-affected-list">
        ${affectedCourseNames.map(name => `<li><b>${escapeHtml(name)}</b></li>`).join('')}
      </ul>
    </div>
  ` : '';

  return `
    <div class="diagnostic-card diagnostic-${cardType}">
      <div class="diagnostic-header">
        <div class="diagnostic-icon">${icon}</div>
        <div class="diagnostic-titles">
          <h3>${escapeHtml(title)}</h3>
          <p class="diagnostic-subtitle">${escapeHtml(subtitle)}</p>
        </div>
      </div>

      ${affectedListHtml}

      ${decisionHtml || ''}

      <details class="diagnostic-details-wrapper">
        <summary class="diagnostic-details-trigger">عرض التفاصيل</summary>
        <div class="diagnostic-details-body">
          ${detailsContentHtml}
          ${hintHtml}
        </div>
      </details>
    </div>
  `;
}

function formatSectionMeetingsDetailsHtml(sec, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  if (sec.isUnscheduled || sec.timingType === 'unscheduled') return escapeHtml('بدون موعد مجدول');
  if (!sec.meetings || !sec.meetings.length) return escapeHtml(sectionTimingLabel(sec));

  const hasBlended = sec.meetings.some(m => m.displayMode === 'blended');
  const hasRemote = sec.meetings.some(m => m.displayMode === 'remote' || m.remote);
  const isMultiMode = (hasBlended || hasRemote) && sec.meetings.some(m => (m.displayMode === 'campus' || (!m.remote && m.displayMode !== 'blended')));

  const grouped = new Map();

  for (const m of sec.meetings) {
    const mode = m.displayMode || (m.remote ? 'remote' : 'campus');
    const isEx = isMeetingExcepted(sec, m, courseRules);
    const key = `${m.start}-${m.end}-${mode}-${isEx}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m.day);
  }

  return [...grouped.entries()].map(([key, days]) => {
    const parts = key.split("-");
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    const mode = parts[2];
    const isEx = parts[3] === 'true';

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
    const exNote = isEx ? ' <span class="exception-note">(مستثنى من التخطيط باختيار الطالب)</span>' : '';

    return `${daysEscaped} ${rangeHtml}${suffixEscaped}${exNote}`;
  }).join(" | ");
}

function renderSchedules(schedules) {
  currentSchedules = schedules;
  const container = $("schedules");
  container.innerHTML = "";
  const diagEl = $("zeroScheduleDiagnostic");
  const breakControls = $("schedulesPanel")?.querySelector(".break-controls");

  if (!schedules.length) {
    if (diagEl) {
      if (lastZeroScheduleDiagnostic) {
        diagEl.innerHTML = renderZeroScheduleDiagnosticHtml(lastZeroScheduleDiagnostic);
        diagEl.classList.remove("hidden");
      } else {
        diagEl.innerHTML = `
          <div class="diagnostic-card diagnostic-warn">
            <div class="diagnostic-header">
              <div class="diagnostic-icon">⚠️</div>
              <div class="diagnostic-titles">
                <h3>تعذر إنشاء جدول كامل</h3>
                <p class="diagnostic-subtitle">${schedules.truncated ? 'البحث غير مكتمل؛ لم يعثر على جدول ضمن حد البحث.' : 'لم أجد تركيبة كاملة من الشعب المقروءة بدون تعارض ضمن شروط الوقت الحالية. جرّب توسيع حدود الوقت أو تغيير الأيام المستبعدة.'}</p>
              </div>
            </div>
          </div>
        `;
        diagEl.classList.remove("hidden");
      }
    }
    if (breakControls) {
      breakControls.classList.add("hidden");
    }
    container.innerHTML = `
      <div class="section warn">
        ${schedules.truncated ? 'البحث غير مكتمل؛ لم يعثر على جدول ضمن حد البحث — راجع تفاصيل التشخيص أعلاه.' : 'تعذر إنشاء جدول كامل — راجع تفاصيل التشخيص أعلاه.'}
      </div>
    `;
    $("schedulesPanel").classList.remove("hidden");
    if (currentAllSections && currentAllSections.size > 0) {
      $('scheduleModeTabs')?.classList.remove('hidden');
    }
    return;
  }

  // Success path:
  if (diagEl) {
    diagEl.innerHTML = "";
    diagEl.classList.add("hidden");
  }
  if (breakControls) {
    breakControls.classList.remove("hidden");
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

  currentCourseColors = buildCourseColorMap(schedules);
  const colors = currentCourseColors;
  schedules.slice(0, 80).forEach((result, index) => {
    const card = document.createElement("div");
    card.className = "schedule-card";

    const exceptionIdentities = new Set((result.appliedExceptions || []).map(ex => ex.courseIdentity));
    const calendar = renderWeeklyCalendar(result.sections, colors, index, exceptionIdentities, workflowSession?.courseRules);

    const patternBadges = [];
    const dp = result.metrics?.dayPatterns;
    if (dp) {
      if (dp.stt?.hasClasses) {
        patternBadges.push(`<span class="badge">${dp.stt.label}: <bdi dir="ltr">${minutesToTime(dp.stt.earliest)} – ${minutesToTime(dp.stt.latest)}</bdi></span>`);
      }
      if (dp.mw?.hasClasses) {
        patternBadges.push(`<span class="badge">${dp.mw.label}: <bdi dir="ltr">${minutesToTime(dp.mw.earliest)} – ${minutesToTime(dp.mw.latest)}</bdi></span>`);
      }
    }
    if (!patternBadges.length) {
      patternBadges.push(`<span class="badge">أول محاضرة <bdi dir="ltr">${minutesToTime(result.metrics?.earliest || 0)}</bdi></span>`);
      patternBadges.push(`<span class="badge">آخر محاضرة <bdi dir="ltr">${minutesToTime(result.metrics?.latest || 0)}</bdi></span>`);
    }

    const hasExclusions = Boolean(lastGenerationContext?.excludedCourses?.length);
    const courseCountBadge = hasExclusions
      ? `<span class="badge badge-warn">${escapeHtml(formatCourseCountOfOriginal(lastGenerationContext.includedCourseCount, lastGenerationContext.originalCourseCount))}</span>`
      : '';

    const meetingExceptionBadge = result.appliedMeetingExceptions?.length
      ? '<span class="badge badge-warning">⚠️ يتضمن استثناء موعد باختيار الطالب</span>'
      : '';

    let exceptionInfoHtml = '';
    if (result.appliedExceptions?.length > 0) {
      exceptionInfoHtml = `
        <div class="schedule-exception-bar" role="status">
          <span class="exception-icon">⚠️</span>
          <div class="exception-text">
            <span class="exception-badge">استثناء مطبق:</span>
            ${result.appliedExceptions.map(ex => `<div class="exception-item">${describeAppliedExceptionHtml(ex)}</div>`).join('')}
          </div>
        </div>
      `;
    }

    let meetingExceptionInfoHtml = '';
    if (result.appliedMeetingExceptions?.length > 0) {
      meetingExceptionInfoHtml = `
        <div class="schedule-exception-bar" role="status">
          <span class="exception-icon">⚠️</span>
          <div class="exception-text">
            <span class="exception-badge">مواعيد مستثناة من التخطيط باختيار الطالب:</span>
            ${result.appliedMeetingExceptions.map(ex => `<div class="exception-item"><b>${escapeHtml(ex.courseLabel)}</b> (شعبة ${escapeHtml(ex.section)}): ${escapeHtml(ex.day)} <bdi dir="ltr">${escapeHtml(ex.timeRange)}</bdi> (مستثنى من التخطيط باختيار الطالب)</div>`).join('')}
          </div>
        </div>
      `;
    }

    let omissionInfoHtml = '';
    if (hasExclusions) {
      const omittedList = lastGenerationContext.excludedCourses.map(c => `
        <div class="omission-item">
          <span class="omission-course-name"><b>${escapeHtml(c.courseLabel)}</b></span>
          <span class="omission-course-desc">(تم استبعادها من هذا التوليد بطلبك)</span>
          <button type="button" class="btn-undo-exclusion" data-undo-exclusion="${escapeHtml(c.courseKey)}" title="إعادة إدراج للمحاولة">
            🔄 إعادة إدراج للمحاولة
          </button>
        </div>
      `).join('');

      omissionInfoHtml = `
        <div class="schedule-omission-bar" role="status">
          <div class="omission-header">
            <span class="omission-icon">📌</span>
            <span class="omission-title">هذا الاقتراح لا يتضمن:</span>
          </div>
          <div class="omission-list">
            ${omittedList}
          </div>
        </div>
      `;
    }

    const unscheduledSections = result.sections.filter(s => s.isUnscheduled);
    let unscheduledInfoHtml = '';
    if (unscheduledSections.length > 0) {
      const names = unscheduledSections.map(s => escapeHtml(s.courseLabel)).join('، ');
      unscheduledInfoHtml = `
        <div class="unscheduled-courses-bar" role="status">
          <span class="unscheduled-icon">📌</span>
          <span class="unscheduled-text">مواد بدون موعد مجدول: <b>${names}</b></span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="schedule-title">
        <div class="schedule-title-top">
          <h3>اقتراح ${index + 1}</h3>
          <button type="button" class="print-card-btn" data-index="${index}" title="طباعة أو تصدير هذا الجدول إلى PDF">🖨️ طباعة الجدول (PDF)</button>
        </div>
        <div class="metrics">
          <span class="badge">${result.metrics.days} أيام دوام</span>
          ${courseCountBadge}
          ${meetingExceptionBadge}
          ${patternBadges.join('\n          ')}
          <span class="badge">إجمالي الفراغات: ${formatDurationArabic(result.metrics.gap)}</span>
        </div>
        <div class="daily-breaks-summary">
          <span class="daily-breaks-label">الفراغات اليومية:</span>
          ${(result.metrics.byDay.has('السبت') ? [...DAY_ORDER, 'السبت'] : DAY_ORDER).map(d => {
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
        ${exceptionInfoHtml}
        ${meetingExceptionInfoHtml}
        ${omissionInfoHtml}
        ${unscheduledInfoHtml}
        <p class="calendar-help small">اضغط على المحاضرة لعرض بياناتها كاملة. المواعيد عن بعد محسوبة ضمن التعارضات.</p>
        <div class="schedule-action-bar">
          <button type="button" class="details-toggle" aria-expanded="false" aria-controls="schedule-details-${index}">عرض تفاصيل الجدول</button>
          <button type="button" class="copy-btn" data-index="${index}">📋 نسخ تفاصيل الجدول</button>
        </div>
        <div id="schedule-details-${index}" class="schedule-details" hidden>
          ${result.sections.map(sec => {
            const meetsHtml = formatSectionMeetingsDetailsHtml(sec, workflowSession?.courseRules);
            const scheme = sec.deliveryScheme || (sec.isUnscheduled ? 'unspecified' : 'campus');
            const schemeBadge = scheme === 'unspecified' ? ' <span class="badge badge-neutral">غير محدد</span>' : '';
            return `<div class="schedule-section-detail course-color-${colors ? (colors.get(courseIdentity(sec)) ?? 0) : 0}" tabindex="-1" data-course="${escapeHtml(courseIdentity(sec))}">
              <h4>${escapeHtml(sec.courseLabel)}</h4>
              <div>شعبة ${escapeHtml(sec.section)}${sec.courseNumber ? ' · ' + escapeHtml(sec.courseNumber) : ''}</div>
              <div>المدرس: ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
              <div class="detail-meetings">${meetsHtml}${schemeBadge}</div>
              <div class="detail-location"><b>المكان:</b> ${formatSectionLocationsHtml(sec)}</div>
            </div>`;
          }).join('')}
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
  if (currentAllSections && currentAllSections.size > 0) {
    $('scheduleModeTabs')?.classList.remove('hidden');
  }
}

// ==========================================================================
// Feature 04: Manual Schedule Builder (بناء الجدول يدوياً)
// ==========================================================================

let currentScheduleMode = 'auto'; // 'auto' | 'manual'

function createManualBuilderState() {
  return {
    selectedSections: new Map(), // courseKey -> section object
    excludedCourseKeys: new Set(), // Set of courseKey excluded purely in manual builder
    activeCourseKey: null,
    hideConflicting: false,
    acknowledgedOverrides: new Map(), // courseKey -> { types: string[], reasons: string[] }
    editorReopened: false,
    updatedAt: Date.now()
  };
}

function getManualBuilderState() {
  if (!workflowSession) return null;
  if (!workflowSession.manualBuilder) {
    workflowSession.manualBuilder = createManualBuilderState();
  }
  return workflowSession.manualBuilder;
}

function resetManualBuilder() {
  const state = getManualBuilderState();
  if (!state) return;
  state.selectedSections.clear();
  state.acknowledgedOverrides.clear();
  if (state.excludedCourseKeys) state.excludedCourseKeys.clear();
  state.editorReopened = false;
  const activeCourses = getManualBuilderActiveCourses();
  state.activeCourseKey = activeCourses.length ? activeCourses[0].id : null;
  state.updatedAt = Date.now();
  renderManualBuilder();
}

function formatExcludedCountArabic(n) {
  if (n === 1) return 'مادة واحدة مستبعدة';
  if (n === 2) return 'مادتان مستبعدتان';
  if (n >= 3 && n <= 10) return `${n} مواد مستبعدة`;
  return `${n} مادة مستبعدة`;
}

function excludeManualCourse(courseKey) {
  const state = getManualBuilderState();
  if (!state) return false;
  if (!state.excludedCourseKeys) state.excludedCourseKeys = new Set();
  state.excludedCourseKeys.add(courseKey);
  state.selectedSections.delete(courseKey);
  state.acknowledgedOverrides.delete(courseKey);
  state.editorReopened = false;
  state.updatedAt = Date.now();
  renderManualBuilder();
  return true;
}

function reincludeManualCourse(courseKey) {
  const state = getManualBuilderState();
  if (!state) return false;
  if (!state.excludedCourseKeys) return false;
  state.excludedCourseKeys.delete(courseKey);
  state.editorReopened = false;
  state.updatedAt = Date.now();
  renderManualBuilder();
  return true;
}

function getManualBuilderActiveCourses() {
  if (!workflowSession || !workflowSession.entries) {
    if (currentAllSections && currentAllSections.size > 0) {
      return [...currentAllSections.entries()].map(([id, sections]) => ({
        id,
        label: sections[0]?.courseLabel || id,
        courseNumber: sections[0]?.courseNumber || '',
        sections,
        sectionCount: sections.length
      }));
    }
    return [];
  }
  return workflowSession.entries
    .filter(e => !e.excluded && e.sections && e.sections.length > 0)
    .map(e => ({
      id: e.id,
      label: e.sections[0]?.courseLabel || e.result?.label || e.result?.original || e.id,
      courseNumber: e.sections[0]?.courseNumber || e.result?.resolvedCourseNumber || '',
      sections: e.sections,
      sectionCount: e.sections.length
    }));
}

function getAllSectionTimeConflicts(section, otherSelectedSections, currentCourseKey = null, courseRules = (typeof workflowSession !== 'undefined' ? workflowSession?.courseRules : null)) {
  if (!section || !section.meetings || !section.meetings.length || !otherSelectedSections) return [];
  const entries = [];
  if (typeof otherSelectedSections.entries === 'function') {
    for (const [k, s] of otherSelectedSections.entries()) {
      if (k !== currentCourseKey && s) entries.push([k, s]);
    }
  } else if (Array.isArray(otherSelectedSections)) {
    for (let i = 0; i < otherSelectedSections.length; i++) {
      const s = otherSelectedSections[i];
      if (s) entries.push([s.courseKey || s.courseId || `sec-${i}`, s]);
    }
  }
  const seen = new Set();
  const blockers = [];
  const secPlanning = getPlanningMeetings(section, courseRules);
  for (const m of secPlanning) {
    for (const [otherKey, otherSec] of entries) {
      if (!otherSec || !otherSec.meetings) continue;
      const otherPlanning = getPlanningMeetings(otherSec, courseRules);
      for (const e of otherPlanning) {
        if (conflicts(m, e)) {
          const overlapStart = Math.max(m.start, e.start);
          const overlapEnd = Math.min(m.end, e.end);
          const sig = `${otherKey}:${otherSec.section}:${e.day}:${overlapStart}:${overlapEnd}:${e.start}:${e.end}`;
          if (!seen.has(sig)) {
            seen.add(sig);

            // Accurate meeting-level attendance modes without conflating section delivery scheme:
            const eIsRemote = Boolean(e.remote || e.isRemote || e.attendanceMode === 'remote');
            const eIsBlended = !eIsRemote && Boolean(e.displayMode === 'blended' || e.isBlended);
            const blockerMeetingMode = eIsRemote ? 'remote' : (eIsBlended ? 'blended' : 'campus');

            const mIsRemote = Boolean(m.remote || m.isRemote || m.attendanceMode === 'remote');
            const mIsBlended = !mIsRemote && Boolean(m.displayMode === 'blended' || m.isBlended);
            const candidateMeetingMode = mIsRemote ? 'remote' : (mIsBlended ? 'blended' : 'campus');

            blockers.push({
              conflictingCourseKey: otherKey,
              conflictingCourseIdentity: courseIdentity(otherSec, otherKey),
              conflictingCourse: otherSec.courseLabel || otherSec.courseName || otherSec.courseNumber || 'مادة أخرى',
              conflictingSection: otherSec.section,
              conflictingSectionIdentity: String(otherSec.section),
              day: e.day,
              timeRange: formatTimeRange(e.start, e.end),
              overlapStart,
              overlapEnd,
              overlapTimeRange: formatTimeRange(overlapStart, overlapEnd),
              // Meeting-level attendance
              attendanceMode: blockerMeetingMode,
              displayMode: e.displayMode || blockerMeetingMode,
              isRemote: blockerMeetingMode === 'remote',
              isBlended: blockerMeetingMode === 'blended',
              isCampus: blockerMeetingMode === 'campus',
              // Candidate meeting info
              candidateAttendanceMode: candidateMeetingMode,
              candidateIsRemote: candidateMeetingMode === 'remote',
              candidateIsCampus: candidateMeetingMode === 'campus',
              // Parent section delivery schemes
              blockerDeliveryScheme: otherSec.deliveryScheme || 'campus',
              candidateDeliveryScheme: section.deliveryScheme || 'campus',
              myDay: m.day,
              myTimeRange: formatTimeRange(m.start, m.end)
            });
          }
        }
      }
    }
  }
  return blockers;
}

function getSectionTimeConflict(section, otherSelectedSections) {
  const all = getAllSectionTimeConflicts(section, otherSelectedSections);
  return all.length ? all[0] : null;
}

function formatDaysListArabic(days) {
  if (!Array.isArray(days) || !days.length) return '';
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} و${days[1]}`;
  return `${days.slice(0, -1).join('، ')} و${days[days.length - 1]}`;
}

function groupDuplicateConflictWarnings(conflictsList) {
  if (!Array.isArray(conflictsList) || !conflictsList.length) return [];

  const groupsMap = new Map();

  for (const c of conflictsList) {
    if (!c) continue;
    const courseId = c.conflictingCourseIdentity || c.conflictingCourseKey || c.conflictingCourse || '';
    const secId = String(c.conflictingSectionIdentity != null ? c.conflictingSectionIdentity : (c.conflictingSection != null ? c.conflictingSection : ''));
    const overlapStart = c.overlapStart != null ? c.overlapStart : '';
    const overlapEnd = c.overlapEnd != null ? c.overlapEnd : '';
    const overlapTime = c.overlapTimeRange || c.timeRange || '';

    // Presentation grouping key strictly: CourseId + SectionId + OverlapInterval
    // Attendance mode MUST NOT split otherwise identical conflicts
    const key = `${courseId}:::${secId}:::${overlapStart}-${overlapEnd || overlapTime}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        conflictingCourseKey: c.conflictingCourseKey,
        conflictingCourseIdentity: c.conflictingCourseIdentity || courseId,
        conflictingCourse: c.conflictingCourse,
        conflictingSection: c.conflictingSection,
        conflictingSectionIdentity: secId,
        overlapStart: c.overlapStart,
        overlapEnd: c.overlapEnd,
        timeRange: overlapTime,
        blockerDeliveryScheme: c.blockerDeliveryScheme || 'campus',
        candidateDeliveryScheme: c.candidateDeliveryScheme || 'campus',
        daysMap: new Map(),
        rawConflicts: []
      });
    }

    const grp = groupsMap.get(key);
    if (c.day && !grp.daysMap.has(c.day)) {
      const isRemote = Boolean(c.isRemote || c.attendanceMode === 'remote');
      const isBlended = !isRemote && Boolean(c.isBlended || c.displayMode === 'blended');
      const mode = isRemote ? 'remote' : (isBlended ? 'blended' : 'campus');
      grp.daysMap.set(c.day, {
        day: c.day,
        attendanceMode: mode,
        isRemote,
        isCampus: mode === 'campus',
        isBlended,
        candidateAttendanceMode: c.candidateAttendanceMode || 'campus'
      });
    }
    grp.rawConflicts.push(c);
  }

  const result = [];
  for (const grp of groupsMap.values()) {
    const orderedDays = [...grp.daysMap.keys()].sort((a, b) => {
      const idxA = ALL_CANONICAL_DAYS.indexOf(a);
      const idxB = ALL_CANONICAL_DAYS.indexOf(b);
      const orderA = idxA !== -1 ? idxA : 99;
      const orderB = idxB !== -1 ? idxB : 99;
      return orderA - orderB;
    });

    const dayAttendanceList = orderedDays.map(d => grp.daysMap.get(d));
    const modesPresent = new Set(dayAttendanceList.map(item => item.attendanceMode));
    const isMixedAttendance = modesPresent.size > 1;

    // Check if candidate and blocker attendance differ
    const hasDifferentAttendanceFromCandidate = dayAttendanceList.some(item =>
      item.attendanceMode !== item.candidateAttendanceMode
    );

    // Group days by attendance mode:
    const modeToDays = new Map();
    for (const item of dayAttendanceList) {
      const m = item.attendanceMode;
      if (!modeToDays.has(m)) modeToDays.set(m, []);
      modeToDays.get(m).push(item.day);
    }

    // Sort modes by earliest appearance in canonical week order
    const sortedModes = [...modeToDays.entries()].sort((a, b) => {
      const firstDayA = a[1][0];
      const firstDayB = b[1][0];
      return ALL_CANONICAL_DAYS.indexOf(firstDayA) - ALL_CANONICAL_DAYS.indexOf(firstDayB);
    });

    const attendanceBreakdown = [];
    if (isMixedAttendance) {
      for (const [m, days] of sortedModes) {
        const daysLabel = formatDaysListArabic(days);
        const modeLabel = m === 'remote' ? 'عن بُعد' : (m === 'blended' ? 'مدمج' : 'وجاهي');
        attendanceBreakdown.push({
          mode: m,
          modeLabel,
          days,
          daysLabel,
          text: `${daysLabel}: ${modeLabel}`
        });
      }
    } else if (modesPresent.has('remote')) {
      const daysLabel = formatDaysListArabic(orderedDays);
      attendanceBreakdown.push({
        mode: 'remote',
        modeLabel: 'عن بُعد',
        days: orderedDays,
        daysLabel,
        text: orderedDays.length > 1 ? `جميع المحاضرات (${daysLabel}): عن بُعد` : `${daysLabel}: عن بُعد`
      });
    }

    const isAllRemote = !isMixedAttendance && modesPresent.has('remote');
    const isAllCampus = !isMixedAttendance && modesPresent.has('campus');
    const isBlendedSection = grp.blockerDeliveryScheme === 'blended' || isMixedAttendance;

    result.push({
      conflictingCourseKey: grp.conflictingCourseKey,
      conflictingCourseIdentity: grp.conflictingCourseIdentity,
      conflictingCourse: grp.conflictingCourse,
      conflictingSection: grp.conflictingSection,
      conflictingSectionIdentity: grp.conflictingSectionIdentity,
      days: orderedDays,
      daysText: orderedDays.join('، '),
      overlapStart: grp.overlapStart,
      overlapEnd: grp.overlapEnd,
      timeRange: grp.timeRange,
      // Meeting attendance accuracy
      isMixedAttendance,
      isAllRemote,
      isAllCampus,
      isBlendedSection,
      hasDifferentAttendanceFromCandidate,
      attendanceBreakdown,
      blockerDeliveryScheme: grp.blockerDeliveryScheme,
      candidateDeliveryScheme: grp.candidateDeliveryScheme,
      rawConflicts: grp.rawConflicts
    });
  }

  return result;
}

function evaluateManualSection(section, courseKey, builderState, globalPrefs = (workflowSession?.prefs || {}), courseRules = (workflowSession?.courseRules || null)) {
  if (!section || !isValidSchedulingSection(section)) {
    return {
      state: 'INVALID',
      isSelectable: false,
      reasons: [{ type: 'invalid', label: 'شعبة غير صالحة للجدولة أو ناقصة المواعيد' }]
    };
  }

  const currentSelected = builderState?.selectedSections?.get(courseKey);
  const isSelected = Boolean(
    currentSelected &&
    (currentSelected === section ||
     (String(currentSelected.section) === String(section.section) &&
      String(currentSelected.courseNumber || '') === String(section.courseNumber || '')))
  );

  // 1. Check genuine time conflict
  const allConflicts = getAllSectionTimeConflicts(section, builderState?.selectedSections, courseKey, courseRules);
  if (allConflicts.length > 0) {
    const primaryConflict = allConflicts[0];
    const groupedConflicts = groupDuplicateConflictWarnings(allConflicts);
    return {
      state: isSelected ? 'SELECTED_CONFLICT' : 'CONFLICTING',
      isSelectable: false,
      conflict: primaryConflict,
      allConflicts,
      groupedConflicts,
      reasons: allConflicts.map(c => ({
        type: 'time-conflict',
        label: `تتعارض مع ${c.conflictingCourse} (شعبة ${c.conflictingSection}) — ${c.day} ${c.timeRange}`,
        conflictingCourseKey: c.conflictingCourseKey,
        conflict: c
      }))
    };
  }

  // 2. Check Feature 03 per-course day pattern
  const rule = getCourseRule(courseRules, courseKey);
  if (rule && rule.allowedDayPattern != null) {
    if (!isSectionPatternAllowed(section, rule.allowedDayPattern)) {
      const allowedLabel = formatDayPatternLabel(rule.allowedDayPattern);
      return {
        state: isSelected ? 'SELECTED_PATTERN_VIOLATION' : 'PATTERN_VIOLATION',
        isSelectable: false,
        patternViolation: {
          allowedPattern: rule.allowedDayPattern,
          allowedLabel
        },
        reasons: [{
          type: 'pattern-violation',
          label: `خارج نمط الأيام المختار لهذه المادة (${allowedLabel})`
        }]
      };
    }
  }

  // 3. Check Global Preferences (respecting Issue 10 exceptions)
  const effectivePrefs = getEffectivePrefsForCourse(globalPrefs, rule);
  const eligibility = evaluateSectionEligibility(section, effectivePrefs, courseRules);
  const violations = [];

  if (!eligibility.allowed) {
    for (const r of eligibility.reasons) {
      if (r.type === 'day-off') {
        violations.push({
          type: 'day-off',
          label: `تتضمن دواماً يوم ${joinArabicList(r.days)} (مستبعد في التفضيلات العامة)`,
          days: r.days
        });
      } else if (r.type === 'starts-before') {
        violations.push({
          type: 'starts-before',
          label: `تبدأ الساعة ${minutesToTime(r.actualStart)} (قبل الحد الأدنى بالتفضيلات: ${minutesToTime(r.limit)})`,
          actualStart: r.actualStart,
          limit: r.limit
        });
      } else if (r.type === 'ends-after') {
        violations.push({
          type: 'ends-after',
          label: `تنتهي الساعة ${minutesToTime(r.actualEnd)} (بعد الحد الأقصى بالتفضيلات: ${minutesToTime(r.limit)})`,
          actualEnd: r.actualEnd,
          limit: r.limit
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      state: isSelected ? 'SELECTED_OVERRIDE' : 'PREFERENCE_VIOLATION',
      isSelectable: true,
      isOverride: true,
      violations,
      reasons: violations
    };
  }

  return {
    state: isSelected ? 'SELECTED' : 'COMPATIBLE',
    isSelectable: true,
    isOverride: false,
    violations: [],
    reasons: []
  };
}

function computeManualBuilderGuidance(courses = getManualBuilderActiveCourses(), builderState = getManualBuilderState(), globalPrefs = (workflowSession?.prefs || {}), courseRules = (workflowSession?.courseRules || null)) {
  const courseStats = [];
  let minCompatibleCount = Infinity;
  let suggestedCourseId = null;
  const list = courses || [];
  const excludedKeys = builderState?.excludedCourseKeys || new Set();

  for (const c of list) {
    const isExcluded = excludedKeys.has(c.id);
    const isSelected = builderState?.selectedSections?.has(c.id);
    const validSections = (c.sections || []).filter(isValidSchedulingSection);
    let compatibleCount = 0;
    let hasDeadlock = false;

    if (!isExcluded) {
      for (const s of validSections) {
        const evalRes = evaluateManualSection(s, c.id, builderState, globalPrefs, courseRules);
        if (evalRes.state === 'COMPATIBLE' || evalRes.state === 'PREFERENCE_VIOLATION' ||
            evalRes.state === 'SELECTED' || evalRes.state === 'SELECTED_OVERRIDE') {
          compatibleCount++;
        }
      }

      if (!isSelected && compatibleCount === 0 && validSections.length > 0) {
        hasDeadlock = true;
      }
    }

    courseStats.push({
      id: c.id,
      label: c.label,
      isSelected,
      isExcluded,
      compatibleCount,
      hasDeadlock,
      totalValid: validSections.length
    });

    if (!isExcluded && !isSelected && compatibleCount > 0 && compatibleCount < minCompatibleCount) {
      minCompatibleCount = compatibleCount;
      suggestedCourseId = c.id;
    }
  }

  const deadlockCourses = courseStats.filter(s => !s.isExcluded && s.hasDeadlock);
  return {
    courseStats,
    deadlockCourses,
    suggestedCourseId,
    suggestedCount: minCompatibleCount === Infinity ? 0 : minCompatibleCount
  };
}

function selectManualSection(courseKey, section, options = {}) {
  const allowOverride = typeof options === 'boolean' ? options : Boolean(options?.isOverride || options?.allowOverride);
  const state = getManualBuilderState();
  if (!state) return { ok: false, reason: 'NO_STATE' };

  const evalRes = evaluateManualSection(
    section,
    courseKey,
    state,
    workflowSession?.prefs || {},
    workflowSession?.courseRules || null
  );

  // 1. Time conflict -> strictly non-overrideable
  if (evalRes.state === 'CONFLICTING' || evalRes.state === 'SELECTED_CONFLICT') {
    return { ok: false, reason: 'CONFLICT', conflict: evalRes.conflict, allConflicts: evalRes.allConflicts };
  }

  // 2. Feature 03 day pattern violation -> strictly non-overrideable
  if (evalRes.state === 'PATTERN_VIOLATION' || evalRes.state === 'SELECTED_PATTERN_VIOLATION') {
    return { ok: false, reason: 'PATTERN_VIOLATION', patternViolation: evalRes.patternViolation };
  }

  // 3. Preference violation -> overrideable only if allowOverride is true
  if (evalRes.state === 'PREFERENCE_VIOLATION') {
    if (!allowOverride) {
      return { ok: false, reason: 'PREFERENCE_VIOLATION', violations: evalRes.violations };
    }
  }

  // If course was excluded, re-include it
  if (state.excludedCourseKeys && state.excludedCourseKeys.has(courseKey)) {
    state.excludedCourseKeys.delete(courseKey);
  }

  // Accept selection
  state.selectedSections.set(courseKey, section);
  if (evalRes.state === 'PREFERENCE_VIOLATION' || (allowOverride && evalRes.violations?.length)) {
    state.acknowledgedOverrides.set(courseKey, {
      types: (evalRes.violations || []).map(v => v.type),
      reasons: (evalRes.violations || []).map(v => v.label)
    });
  } else {
    state.acknowledgedOverrides.delete(courseKey);
  }
  state.updatedAt = Date.now();

  const activeCourses = getManualBuilderActiveCourses();
  const excludedKeys = state.excludedCourseKeys || new Set();
  const unselected = activeCourses.filter(c => !excludedKeys.has(c.id) && !state.selectedSections.has(c.id));
  if (unselected.length > 0 && state.activeCourseKey === courseKey) {
    const guidance = computeManualBuilderGuidance(activeCourses, state, workflowSession?.prefs || {}, workflowSession?.courseRules || null);
    state.activeCourseKey = guidance.suggestedCourseId || unselected[0].id;
  }

  renderManualBuilder();
  return { ok: true, state: evalRes.state };
}

function deselectManualSection(courseKey) {
  const state = getManualBuilderState();
  if (!state) return false;
  state.selectedSections.delete(courseKey);
  state.acknowledgedOverrides.delete(courseKey);
  state.activeCourseKey = courseKey;
  state.editorReopened = false;
  state.updatedAt = Date.now();
  renderManualBuilder();
  return true;
}

function buildCompletedManualSchedule(builderState = getManualBuilderState(), globalPrefs = (workflowSession?.prefs || {}), courseRules = (workflowSession?.courseRules || null)) {
  if (!builderState || !builderState.selectedSections || !builderState.selectedSections.size) return null;
  const activeCourses = getManualBuilderActiveCourses();
  const excludedKeys = builderState.excludedCourseKeys || new Set();
  const requiredCourses = activeCourses.filter(c => !excludedKeys.has(c.id));
  if (requiredCourses.length === 0) return null;

  for (const c of requiredCourses) {
    if (!builderState.selectedSections.has(c.id)) {
      return null;
    }
  }

  const sections = requiredCourses.map(c => builderState.selectedSections.get(c.id)).filter(Boolean);
  if (sections.length !== requiredCourses.length) return null;

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sectionConflicts(sections[i], [sections[j]], courseRules)) {
        return null;
      }
    }
  }

  const metrics = scheduleMetrics(sections, courseRules);
  const appliedExceptions = [];

  for (const c of requiredCourses) {
    const sec = builderState.selectedSections.get(c.id);
    if (!sec || sec.isUnscheduled) continue;
    const rule = getCourseRule(courseRules, c.id);
    const effectivePrefs = getEffectivePrefsForCourse(globalPrefs, rule);
    const evalRes = evaluateSectionEligibility(sec, effectivePrefs, courseRules);
    if (!evalRes.allowed) {
      const ex = {
        courseKey: c.id,
        courseName: sec.courseLabel || c.label,
        courseIdentity: courseIdentity(sec, c.id),
        courseNumber: sec.courseNumber || '',
        sectionNumber: sec.section,
        types: []
      };
      for (const r of evalRes.reasons) {
        if (r.type === 'day-off') {
          ex.types.push('daysOff');
          ex.days = [...r.days];
        } else if (r.type === 'starts-before') {
          ex.types.push('notBefore');
          ex.earliestStart = r.actualStart;
          ex.startLimit = r.limit;
        } else if (r.type === 'ends-after') {
          ex.types.push('notAfter');
          ex.latestEnd = r.actualEnd;
          ex.endLimit = r.limit;
        }
      }
      if (ex.types.length) appliedExceptions.push(ex);
    }
  }

  const appliedMeetingExceptions = [];
  for (const sec of sections) {
    for (const m of sec.meetings || []) {
      if (isMeetingExcepted(sec, m, courseRules)) {
        appliedMeetingExceptions.push({
          courseKey: sec.courseKey || sec.courseNumber || '',
          courseLabel: sec.courseLabel || '',
          section: sec.section || '',
          day: m.day,
          start: m.start,
          end: m.end,
          timeRange: `${minutesToTime(m.start)} – ${minutesToTime(m.end)}`,
          mode: m.attendanceMode || (m.remote ? 'remote' : 'campus'),
          meetingKey: getMeetingKey(m)
        });
      }
    }
  }

  const excludedCourses = activeCourses
    .filter(c => excludedKeys.has(c.id))
    .map(c => ({ courseKey: c.id, courseLabel: c.label }));

  return {
    sections,
    metrics,
    appliedExceptions,
    appliedMeetingExceptions,
    excludedCourses,
    originalCourseCount: activeCourses.length,
    includedCourseCount: requiredCourses.length,
    rank: 1,
    isManual: true
  };
}

function setScheduleMode(mode) {
  currentScheduleMode = mode;
  const tabAuto = $('tabAutoMode');
  const tabManual = $('tabManualMode');
  const autoArea = $('autoScheduleArea');
  const manualPanel = $('manualBuilderPanel');

  if (tabAuto && tabManual) {
    if (mode === 'manual') {
      tabAuto.classList.remove('is-active');
      tabAuto.setAttribute('aria-selected', 'false');
      tabAuto.setAttribute('tabindex', '-1');
      tabManual.classList.add('is-active');
      tabManual.setAttribute('aria-selected', 'true');
      tabManual.setAttribute('tabindex', '0');

      if (autoArea) autoArea.classList.add('hidden');
      if (manualPanel) {
        manualPanel.classList.remove('hidden');
        renderManualBuilder();
      }
    } else {
      tabManual.classList.remove('is-active');
      tabManual.setAttribute('aria-selected', 'false');
      tabManual.setAttribute('tabindex', '-1');
      tabAuto.classList.add('is-active');
      tabAuto.setAttribute('aria-selected', 'true');
      tabAuto.setAttribute('tabindex', '0');

      if (manualPanel) manualPanel.classList.add('hidden');
      if (autoArea) autoArea.classList.remove('hidden');
    }
  }
}

function renderManualBuilder() {
  const manualPanel = $('manualBuilderPanel');
  if (!manualPanel) return;

  const courses = getManualBuilderActiveCourses();
  const state = getManualBuilderState();
  if (!state) return;

  if (courses.length === 0) {
    const textEl = $('manualProgressText');
    if (textEl) textEl.textContent = '0 من 0 مواد تم اختيار شعبها';
    const fillEl = $('manualProgressBarFill');
    if (fillEl) fillEl.style.width = '0%';
    const pillsEl = $('manualCoursePills');
    if (pillsEl) pillsEl.innerHTML = '';
    const activeEl = $('manualActiveCourseContainer');
    if (activeEl) activeEl.innerHTML = '<div class="manual-empty-timetable">لا توجد مواد مسجلة في الجلسة الحالية. أضف مواد من إدارة المواد للبدء.</div>';
    const timeEl = $('manualTimetableContainer');
    if (timeEl) timeEl.innerHTML = '';
    return;
  }

  if (!state.activeCourseKey || !courses.some(c => c.id === state.activeCourseKey)) {
    state.activeCourseKey = courses[0].id;
  }

  const prefs = workflowSession?.prefs || {};
  const rules = workflowSession?.courseRules || null;
  const guidance = computeManualBuilderGuidance(courses, state, prefs, rules);

  // 1. Progress Header
  const excludedKeys = state.excludedCourseKeys || new Set();
  const requiredCourses = courses.filter(c => !excludedKeys.has(c.id));
  const excludedCount = courses.length - requiredCourses.length;
  const selectedCount = [...state.selectedSections.keys()].filter(k => requiredCourses.some(c => c.id === k)).length;
  const totalCount = requiredCourses.length;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const progressPct = totalCount > 0 ? Math.round((selectedCount / totalCount) * 100) : 0;

  const completedSched = isAllSelected ? buildCompletedManualSchedule(state, prefs, rules) : null;
  const isCompleted = Boolean(isAllSelected && completedSched);

  if (!isCompleted) {
    state.editorReopened = false;
  }

  manualPanel.classList.toggle('is-completed-mode', isCompleted);
  manualPanel.classList.toggle('is-editor-reopened', Boolean(isCompleted && state.editorReopened));

  const selectionSectionEl = $('manualSelectionSection');
  if (selectionSectionEl) {
    selectionSectionEl.classList.toggle('hidden', Boolean(isCompleted && !state.editorReopened));
  }

  const progText = $('manualProgressText');
  if (progText) {
    if (excludedCount > 0) {
      progText.textContent = `${selectedCount} من ${totalCount} مادة مختارة — ${formatExcludedCountArabic(excludedCount)}`;
    } else {
      progText.textContent = `${selectedCount} من ${totalCount} مواد تم اختيار شعبها`;
    }
  }
  const progBar = $('manualProgressBar');
  if (progBar) progBar.setAttribute('aria-valuenow', String(progressPct));
  const progFill = $('manualProgressBarFill');
  if (progFill) progFill.style.width = `${progressPct}%`;

  // 2. Course Pills
  const pillsContainer = $('manualCoursePills');
  if (pillsContainer) {
    pillsContainer.innerHTML = '';
    courses.forEach(c => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'manual-course-pill';
      pill.dataset.courseId = c.id;

      if (c.id === state.activeCourseKey) {
        pill.classList.add('is-active');
      }

      const stat = guidance.courseStats.find(s => s.id === c.id);
      const chosenSec = state.selectedSections.get(c.id);

      if (stat?.isExcluded) {
        pill.classList.add('is-excluded');
        pill.innerHTML = `
          <span class="pill-excluded" aria-hidden="true">🚫</span>
          <span class="manual-course-pill-name">${escapeHtml(c.label)}</span>
          <span class="manual-course-pill-status">مستبعدة</span>
        `;
      } else if (chosenSec) {
        pill.classList.add('is-selected');
        pill.innerHTML = `
          <span class="pill-check" aria-hidden="true">✓</span>
          <span class="manual-course-pill-name">${escapeHtml(c.label)}</span>
          <span class="manual-course-pill-status">شعبة ${escapeHtml(chosenSec.section)}</span>
        `;
      } else if (c.id === guidance.suggestedCourseId) {
        pill.classList.add('is-suggested');
        pill.innerHTML = `
          <span class="pill-bulb" aria-hidden="true">💡</span>
          <span class="manual-course-pill-name">${escapeHtml(c.label)}</span>
          <span class="manual-course-pill-status">${stat?.compatibleCount ?? 0} متاحة</span>
        `;
      } else if (stat?.hasDeadlock) {
        pill.classList.add('is-deadlock');
        pill.innerHTML = `
          <span class="pill-warn" aria-hidden="true">⚠️</span>
          <span class="manual-course-pill-name">${escapeHtml(c.label)}</span>
          <span class="manual-course-pill-status">0 متاحة</span>
        `;
      } else {
        pill.innerHTML = `
          <span class="pill-dot" aria-hidden="true">○</span>
          <span class="manual-course-pill-name">${escapeHtml(c.label)}</span>
          <span class="manual-course-pill-status">${stat?.compatibleCount ?? 0} متاحة</span>
        `;
      }

      pill.addEventListener('click', () => {
        state.activeCourseKey = c.id;
        renderManualBuilder();
      });
      pillsContainer.appendChild(pill);
    });
  }

  // 3. Guidance Notice
  const guidanceEl = $('manualGuidanceNotice');
  if (guidanceEl) {
    const deadlockStat = guidance.deadlockCourses?.[0] || guidance.courseStats.find(s => !s.isExcluded && s.hasDeadlock);
    if (deadlockStat) {
      guidanceEl.textContent = `⚠️ تعذر إيجاد شعب متوافقة لمادة "${deadlockStat.label}" مع الاختيارات الحالية. راجع المواد الأخرى لتغيير شعبها أو استبعد المادة مؤقتاً.`;
      guidanceEl.classList.remove('hidden');
      guidanceEl.classList.add('is-deadlock');
    } else if (guidance.suggestedCourseId && !isAllSelected) {
      const sugg = courses.find(c => c.id === guidance.suggestedCourseId);
      guidanceEl.textContent = `💡 مقترحة تالياً: "${sugg?.label || ''}" — ${formatSectionCountArabic(guidance.suggestedCount)} فقط متوافقة ومتاحة حالياً.`;
      guidanceEl.classList.remove('hidden', 'is-deadlock');
    } else {
      guidanceEl.textContent = '';
      guidanceEl.classList.add('hidden');
    }
  }

  // 4. Active Course Sections
  const activeCourse = courses.find(c => c.id === state.activeCourseKey) || courses[0];
  const isExcludedActiveCourse = Boolean(excludedKeys.has(activeCourse.id));
  const activeStat = guidance.courseStats.find(s => s.id === activeCourse.id);
  const isDeadlockedActiveCourse = !isExcludedActiveCourse && !state.selectedSections.has(activeCourse.id) && Boolean(activeStat?.hasDeadlock);

  const activeContainer = $('manualActiveCourseContainer');
  if (activeContainer) {
    activeContainer.innerHTML = '';

    if (isExcludedActiveCourse) {
      const activeHeader = document.createElement('div');
      activeHeader.className = 'manual-active-course-header is-excluded';
      activeHeader.innerHTML = `
        <div class="manual-active-course-titles">
          <span class="manual-active-course-name">${escapeHtml(activeCourse.label)}</span>
          <span class="manual-active-course-meta"> — مستبعدة</span>
        </div>
      `;
      activeContainer.appendChild(activeHeader);

      const banner = document.createElement('div');
      banner.className = 'manual-excluded-course-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'حالة المادة المستبعدة');
      banner.innerHTML = `
        <div class="manual-excluded-course-info">
          <span class="manual-excluded-icon" aria-hidden="true">🚫</span>
          <div>
            <div class="manual-excluded-title">هذه المادة مستبعدة من الجدول اليدوي</div>
            <div class="manual-excluded-desc">
              هذه المادة مستبعدة حاليًا من الجدول اليدوي، ولن تُحتسب ضمن المواد المشمولة أو تظهر محاضراتها في الجدول. يمكنك إعادتها في أي وقت دون فقدان اختيارات المواد الأخرى.
            </div>
          </div>
        </div>
        <button type="button" class="btn-manual-reinclude-course" id="btnReincludeCourse" data-course-key="${escapeHtml(activeCourse.id)}">
          🔄 إعادة إدراج المادة
        </button>
      `;
      banner.querySelector('#btnReincludeCourse')?.addEventListener('click', () => {
        reincludeManualCourse(activeCourse.id);
      });
      activeContainer.appendChild(banner);
    } else {
      if (isDeadlockedActiveCourse) {
        const deadlockCard = document.createElement('div');
        deadlockCard.className = 'manual-deadlock-recovery-card';
        deadlockCard.setAttribute('role', 'region');
        deadlockCard.setAttribute('aria-label', 'خيارات معالجة التعارض');
        deadlockCard.innerHTML = `
          <div class="manual-deadlock-header">
            <span class="deadlock-badge">⚠️ 0 شعب متاحة</span>
            <h4>تعذر إيجاد شعب متوافقة لهذه المادة مع الاختيارات الحالية</h4>
          </div>
          <p class="manual-deadlock-desc">
            جميع شعب مادة "<b>${escapeHtml(activeCourse.label)}</b>" تتعارض في أوقاتها مع الشعب التي اخترتها مسبقاً، أو تخالف قيود الأيام. اختر أحد الحلين للمتابعة:
          </p>
          <div class="manual-deadlock-options">
            <div class="manual-deadlock-option-box">
              <div class="option-title">1️⃣ مراجعة الشعب المتعارضة</div>
              <div class="option-desc">راجع الشعب أدناه واضغط زر <em>"مراجعة شعبة..."</em> بجانب أي تعارض للانتقال للمادة وتغيير اختيارها.</div>
              <button type="button" class="btn-manual-review-conflicts" id="btnReviewConflictsManual" data-course-key="${escapeHtml(activeCourse.id)}">
                🔎 مراجعة الشعب المتعارضة
              </button>
            </div>
            <div class="manual-deadlock-option-box">
              <div class="option-title">2️⃣ استبعاد المادة من الجدول اليدوي</div>
              <div class="option-desc">استبعد المادة مؤقتاً لإكمال جدولك بالمواد المتبقية والوصول إلى الطباعة ونسخ تفاصيل الجدول.</div>
              <button type="button" class="btn-manual-exclude-course" id="btnExcludeCourseManual" data-course-key="${escapeHtml(activeCourse.id)}">
                🚫 استبعاد هذه المادة من الجدول اليدوي
              </button>
            </div>
          </div>
        `;
        deadlockCard.querySelector('#btnReviewConflictsManual')?.addEventListener('click', () => {
          if (state.hideConflicting) {
            state.hideConflicting = false;
            renderManualBuilder();
          }
          const target = document.querySelector('.manual-conflict-callout') ||
                         document.querySelector('.manual-sections-list') ||
                         document.querySelector('.btn-manual-goto-blocker');
          if (target) {
            target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            target.classList.add('manual-conflict-target-highlight');
            setTimeout(() => target.classList.remove('manual-conflict-target-highlight'), 1800);
          }
        });
        deadlockCard.querySelector('#btnExcludeCourseManual')?.addEventListener('click', () => {
          excludeManualCourse(activeCourse.id);
        });
        activeContainer.appendChild(deadlockCard);
      }

      const isConflictingHidden = Boolean(state.hideConflicting);
      const activeHeader = document.createElement('div');
      activeHeader.className = 'manual-active-course-header';
      activeHeader.innerHTML = `
        <div class="manual-active-course-titles">
          <span class="manual-active-course-name">${escapeHtml(activeCourse.label)}</span>
          <span class="manual-active-course-meta">(${activeCourse.sections.length} شعب مسجلة)</span>
        </div>
        <div class="manual-active-header-actions">
          <button type="button" class="btn-manual-exclude-subtle" id="btnExcludeCourseSubtle" title="استبعاد هذه المادة من الجدول اليدوي">
            استبعاد المادة 🚫
          </button>
          <button type="button" class="btn-manual-toggle-conflicting ${isConflictingHidden ? 'is-active' : ''}" id="toggleHideConflictingBtn" aria-pressed="${isConflictingHidden ? 'true' : 'false'}" title="${isConflictingHidden ? 'إظهار جميع الشعب بما فيها المتعارضة' : 'إخفاء الشعب المتعارضة من القائمة'}">
            <span class="toggle-icon" aria-hidden="true">👁️</span>
            <span class="toggle-text">${isConflictingHidden ? 'إظهار الشعب المتعارضة' : 'إخفاء الشعب المتعارضة'}</span>
          </button>
        </div>
      `;
      activeHeader.querySelector('#toggleHideConflictingBtn')?.addEventListener('click', () => {
        state.hideConflicting = !state.hideConflicting;
        renderManualBuilder();
      });
      activeHeader.querySelector('#btnExcludeCourseSubtle')?.addEventListener('click', () => {
        excludeManualCourse(activeCourse.id);
      });
      activeContainer.appendChild(activeHeader);

      const sectionsList = document.createElement('div');
      sectionsList.className = 'manual-sections-list';

    let hiddenConflictingCount = 0;

    activeCourse.sections.forEach(sec => {
      const evalRes = evaluateManualSection(sec, activeCourse.id, state, prefs, rules);

      if (state.hideConflicting && (evalRes.state === 'CONFLICTING' || evalRes.state === 'PATTERN_VIOLATION')) {
        hiddenConflictingCount++;
        return;
      }

      const card = document.createElement('div');
      card.className = 'manual-section-card';
      if (evalRes.state === 'SELECTED' || evalRes.state === 'SELECTED_OVERRIDE') {
        card.classList.add('is-selected');
      } else if (evalRes.state === 'CONFLICTING') {
        card.classList.add('is-conflicting');
      } else if (evalRes.state === 'PREFERENCE_VIOLATION') {
        card.classList.add('is-override');
      } else if (evalRes.state === 'PATTERN_VIOLATION') {
        card.classList.add('is-pattern-violation');
      }

      const instructorText = (sec.instructors || []).join('، ') || 'غير معلن';
      const timingText = sec.isUnscheduled ? 'بدون موعد مجدول' : meetingText(sec.meetings, { bidiText: true });

      let schemeBadgeHtml = '';
      const scheme = sec.deliveryScheme || (sec.meetings?.some(m => m.displayMode === 'blended' || m.blended) ? 'blended' : (sec.meetings?.length && sec.meetings.every(m => m.remote) ? 'remote' : 'campus'));
      if (scheme === 'blended') schemeBadgeHtml = '<span class="badge badge-blended">🔄 مدمج</span>';
      else if (scheme === 'remote') schemeBadgeHtml = '<span class="badge badge-remote">🌐 عن بعد</span>';
      else if (sec.isUnscheduled) schemeBadgeHtml = '<span class="badge badge-neutral">📌 غير مجدول</span>';

      let calloutHtml = '';
      if (evalRes.state === 'CONFLICTING') {
        const rawBlockers = (evalRes.allConflicts && evalRes.allConflicts.length) ? evalRes.allConflicts : (evalRes.conflict ? [evalRes.conflict] : []);
        const groupedBlockers = evalRes.groupedConflicts || groupDuplicateConflictWarnings(rawBlockers);
        const blockersHtml = groupedBlockers.map(b => {
          let attendanceBadge = '';
          if (b.isAllRemote) {
            attendanceBadge = ' <span class="badge badge-remote" style="margin-right:4px;">🌐 عن بعد</span>';
          }

          let attendanceBreakdownHtml = '';
          if (b.attendanceBreakdown && b.attendanceBreakdown.length) {
            const lines = b.attendanceBreakdown.map(item => `
              <li class="manual-conflict-attendance-line">
                <span class="manual-conflict-attendance-dash">-</span>
                <span class="manual-conflict-attendance-text">${escapeHtml(item.text)}</span>
              </li>
            `).join('');
            attendanceBreakdownHtml = `
              <ul class="manual-conflict-attendance-list" aria-label="طبيعة دوام شعبة ${escapeHtml(b.conflictingCourse)}">
                ${lines}
              </ul>
            `;
          }

          return `
            <div class="manual-conflict-blocker">
              <div class="manual-conflict-blocker-info">
                <div class="manual-conflict-blocker-title">
                  <span>⚠️ تتعارض مع: <b>${escapeHtml(b.conflictingCourse)}</b> — شعبة ${escapeHtml(b.conflictingSection)}</span>
                  ${attendanceBadge}
                </div>
                <div class="manual-conflict-blocker-sub">
                  <span class="manual-conflict-days">${escapeHtml(b.daysText)}</span>
                  <span class="manual-conflict-separator">|</span>
                  <bdi dir="ltr" class="manual-conflict-time">${escapeHtml(b.timeRange)}</bdi>
                </div>
                ${attendanceBreakdownHtml}
              </div>
              ${b.conflictingCourseKey ? `
                <button type="button" class="btn-manual-goto-blocker" data-course-key="${escapeHtml(b.conflictingCourseKey)}" title="الانتقال إلى مادة ${escapeHtml(b.conflictingCourse)} لمراجعة أو تغيير شعبتها">
                  مراجعة شعبة ${escapeHtml(b.conflictingCourse)}
                </button>
              ` : ''}
            </div>
          `;
        }).join('');
        calloutHtml = `
          <div class="manual-conflict-callout" role="alert">
            ${blockersHtml}
          </div>
        `;
      } else if (evalRes.state === 'PATTERN_VIOLATION') {
        calloutHtml = `
          <div class="manual-pattern-callout" role="alert">
            <span>⚠️</span>
            <span>خارج نمط الأيام المختار لهذه المادة (<b>${escapeHtml(evalRes.patternViolation.allowedLabel)}</b>). لتفعيلها، غيّر نمط الأيام من إدارة المواد إلى الكل.</span>
          </div>
        `;
      } else if (evalRes.state === 'PREFERENCE_VIOLATION' || evalRes.state === 'SELECTED_OVERRIDE') {
        const msgs = evalRes.violations.map(v => escapeHtml(v.label)).join(' | ');
        calloutHtml = `
          <div class="manual-warning-callout" role="alert">
            <span>⚠️</span>
            <span>${msgs}</span>
          </div>
        `;
      }

      const eligibleMeetings = (sec.meetings || []).filter(m => isMeetingEligibleForException(activeCourse.label, sec, m));
      let manualExceptionsHtml = '';
      if (eligibleMeetings.length > 0) {
        manualExceptionsHtml = `
          <div class="manual-section-exceptions">
            ${eligibleMeetings.map(m => {
              const isExcepted = isMeetingExcepted(sec, m, rules);
              const reqConfirm = meetingRequiresConfirmation(activeCourse.label, sec, m);
              const mKey = getMeetingKey(m);
              return `
                <div class="meeting-exception-row" data-course-key="${escapeHtml(activeCourse.id)}" data-section="${escapeHtml(sec.section)}" data-meeting-key="${escapeHtml(mKey)}">
                  <label class="meeting-exception-label">
                    <input type="checkbox" class="manual-meeting-exception-checkbox" ${isExcepted ? 'checked' : ''} data-req-confirm="${reqConfirm}">
                    <span>اعتبار موعد ${escapeHtml(m.day)} (<bdi dir="ltr">${minutesToTime(m.start)} – ${minutesToTime(m.end)}</bdi>) غير ملزم للتخطيط</span>
                  </label>
                  ${isExcepted ? '<span class="meeting-exception-pill">مستثنى</span>' : ''}
                  <div class="meeting-exception-confirm-card hidden">
                    <div class="confirm-card-text">
                      ⚠️ تنبيه: هذا الموعد مجدول رسمياً من الجامعة. تقع مسؤولية التأكد من عدم إلزامية الحضور الأسبوعي على عاتقك. هل تود استثناءه من تخطيط الجدول؟
                    </div>
                    <div class="confirm-card-actions">
                      <button type="button" class="btn-confirm-manual-exception">تأكيد الاستثناء</button>
                      <button type="button" class="btn-cancel-manual-exception">تراجع</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      let actionBtnHtml = '';
      if (evalRes.state === 'SELECTED' || evalRes.state === 'SELECTED_OVERRIDE') {
        actionBtnHtml = `<button type="button" class="btn-manual-deselect">✕ إلغاء الاختيار</button>`;
      } else if (evalRes.state === 'COMPATIBLE') {
        actionBtnHtml = `<button type="button" class="btn-manual-select">اختيار هذه الشعبة</button>`;
      } else if (evalRes.state === 'PREFERENCE_VIOLATION') {
        actionBtnHtml = `<button type="button" class="btn-manual-override" title="اختيار الشعبة رغم تعارضها مع التفضيلات العامة">اختيار رغم التفضيلات</button>`;
      } else {
        actionBtnHtml = `<button type="button" class="btn-manual-select" disabled>غير متاحة</button>`;
      }

      card.innerHTML = `
        <div class="manual-section-main-row">
          <div class="manual-section-info">
            <span class="manual-section-num">شعبة ${escapeHtml(sec.section)}</span>
            <span class="manual-section-instructor">${escapeHtml(instructorText)}</span>
            <span class="manual-section-timing">${timingText}</span>
            <span class="manual-section-location">المكان: ${formatSectionLocationsHtml(sec)}</span>
          </div>
          <div class="manual-section-badges">
            ${schemeBadgeHtml}
          </div>
        </div>
        ${calloutHtml}
        ${manualExceptionsHtml}
        <div class="manual-section-actions">
          ${actionBtnHtml}
        </div>
      `;

      card.querySelector('.btn-manual-select:not(:disabled)')?.addEventListener('click', () => {
        selectManualSection(activeCourse.id, sec);
      });
      card.querySelector('.btn-manual-override')?.addEventListener('click', () => {
        selectManualSection(activeCourse.id, sec, { isOverride: true, violations: evalRes.violations });
      });
      card.querySelector('.btn-manual-deselect')?.addEventListener('click', () => {
        deselectManualSection(activeCourse.id);
      });
      card.querySelectorAll('.meeting-exception-label').forEach(label => {
        label.addEventListener('click', e => {
          e.stopPropagation();
        });
      });
      card.querySelectorAll('.manual-meeting-exception-checkbox').forEach(chk => {
        chk.addEventListener('click', e => {
          e.stopPropagation();
        });
        chk.addEventListener('change', e => {
          e.stopPropagation();
          const row = e.target.closest('.meeting-exception-row');
          if (!row) return;
          const mKey = row.dataset.meetingKey;
          const reqConf = e.target.dataset.reqConfirm === 'true';
          if (e.target.checked) {
            if (reqConf) {
              e.target.checked = false;
              row.querySelector('.meeting-exception-confirm-card')?.classList.remove('hidden');
              return;
            }
            toggleMeetingException(activeCourse.id, sec.section, mKey, true, rules);
            rerunGenerationWithRules();
            renderManualBuilder();
          } else {
            toggleMeetingException(activeCourse.id, sec.section, mKey, false, rules);
            rerunGenerationWithRules();
            renderManualBuilder();
          }
        });
      });
      card.querySelectorAll('.btn-confirm-manual-exception').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const row = e.target.closest('.meeting-exception-row');
          if (!row) return;
          const mKey = row.dataset.meetingKey;
          toggleMeetingException(activeCourse.id, sec.section, mKey, true, rules);
          rerunGenerationWithRules();
          renderManualBuilder();
        });
      });
      card.querySelectorAll('.btn-cancel-manual-exception').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const row = e.target.closest('.meeting-exception-row');
          row?.querySelector('.meeting-exception-confirm-card')?.classList.add('hidden');
          const chk = row?.querySelector('.manual-meeting-exception-checkbox');
          if (chk) chk.checked = false;
        });
      });
      card.querySelectorAll('.btn-manual-goto-blocker').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const targetKey = btn.dataset.courseKey;
          if (targetKey && state) {
            state.activeCourseKey = targetKey;
            renderManualBuilder();
          }
        });
      });

      sectionsList.appendChild(card);
    });

    if (hiddenConflictingCount > 0) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.style.margin = '4px 0';
      hint.textContent = `(تم إخفاء ${hiddenConflictingCount} شعب متعارضة بطلبك)`;
      sectionsList.appendChild(hint);
    }

    activeContainer.appendChild(sectionsList);
    }
  }

  // 5. Live Timetable Preview & Completion
  const timetableContainer = $('manualTimetableContainer');
  if (timetableContainer) {
    timetableContainer.innerHTML = '';

    const completedSched = isAllSelected ? buildCompletedManualSchedule(state, prefs, rules) : null;

    if (isAllSelected && completedSched) {
      const card = document.createElement('div');
      card.className = 'schedule-card';

      const colors = buildCourseColorMap([completedSched]);
      const exceptionIdentities = new Set((completedSched.appliedExceptions || []).map(ex => ex.courseIdentity));
      const calendarHtml = renderWeeklyCalendar(completedSched.sections, colors, 0, exceptionIdentities, rules);

      let exceptionBannerHtml = '';
      if (completedSched.appliedExceptions.length > 0) {
        const items = completedSched.appliedExceptions.map(ex => `
          <div class="exception-rule-item">
            <span class="exception-course-name"><b>${escapeHtml(ex.courseName)}</b>:</span>
            <span class="exception-reason-text">${describeAppliedExceptionHtml(ex)}</span>
          </div>
        `).join('');
        exceptionBannerHtml = `
          <div class="schedule-exceptions-bar" role="status">
            <div class="exception-header">
              <span class="exception-icon">⚠️</span>
              <span class="exception-title">تم اختيار شعب تتضمن استثناءات من التفضيلات العامة:</span>
            </div>
            <div class="exceptions-list">
              ${items}
            </div>
          </div>
        `;
      }

      let meetingExceptionBannerHtml = '';
      if (completedSched.appliedMeetingExceptions?.length > 0) {
        meetingExceptionBannerHtml = `
          <div class="schedule-exception-bar" role="status">
            <span class="exception-icon">⚠️</span>
            <div class="exception-text">
              <span class="exception-badge">مواعيد مستثناة من التخطيط باختيار الطالب:</span>
              ${completedSched.appliedMeetingExceptions.map(ex => `<div class="exception-item"><b>${escapeHtml(ex.courseLabel)}</b> (شعبة ${escapeHtml(ex.section)}): ${escapeHtml(ex.day)} <bdi dir="ltr">${escapeHtml(ex.timeRange)}</bdi> (مستثنى من التخطيط باختيار الطالب)</div>`).join('')}
            </div>
          </div>
        `;
      }

      const unscheduledSecs = completedSched.sections.filter(s => s.isUnscheduled);
      let unscheduledHtml = '';
      if (unscheduledSecs.length > 0) {
        const names = unscheduledSecs.map(s => escapeHtml(s.courseLabel)).join('، ');
        unscheduledHtml = `
          <div class="unscheduled-courses-bar" role="status">
            <span class="unscheduled-icon">📌</span>
            <span class="unscheduled-text">مواد بدون موعد مجدول: <b>${names}</b></span>
          </div>
        `;
      }

      let bannerTitleHtml = '';
      let excludedDisclosureHtml = '';
      if (completedSched.excludedCourses && completedSched.excludedCourses.length > 0) {
        const exclCount = completedSched.excludedCourses.length;
        bannerTitleHtml = `
          <span>🎉</span>
          <span>اكتمل الجدول للمواد المشمولة (${totalCount} من ${totalCount} مادة مختارة — ${formatExcludedCountArabic(exclCount)})</span>
        `;
        const names = completedSched.excludedCourses.map(c => escapeHtml(c.courseLabel)).join('، ');
        excludedDisclosureHtml = `
          <div class="manual-excluded-disclosure" role="note">
            📌 <b>المواد المستبعدة من هذا الجدول اليدوي:</b> ${names}
          </div>
        `;
      } else {
        bannerTitleHtml = `
          <span>🎉</span>
          <span>اكتمل الجدول — تم اختيار شعب جميع المواد (${totalCount} من ${totalCount}) بدون أي تعارض!</span>
        `;
      }

      const meetingExBadge = completedSched.appliedMeetingExceptions?.length
        ? '<span class="badge badge-warning">⚠️ يتضمن استثناء موعد باختيار الطالب</span>'
        : '';

      card.innerHTML = `
        <div class="manual-completion-banner">
          <div class="manual-completion-title-row">
            ${bannerTitleHtml}
          </div>
          ${excludedDisclosureHtml}
          <div class="manual-completion-actions">
            <button type="button" class="export-btn print-card-btn" id="printManualScheduleBtn" title="طباعة أو تصدير هذا الجدول إلى PDF">🖨️ طباعة الجدول (PDF)</button>
            <button type="button" class="export-btn copy-btn" id="copyManualScheduleBtn">📋 نسخ تفاصيل الجدول</button>
            <button type="button" class="export-btn btn-manual-edit-sections" id="btnEditManualSections" aria-expanded="${state.editorReopened ? 'true' : 'false'}">
              ${state.editorReopened ? '✕ إخفاء تعديل الشعب' : '✏️ تعديل الشعب'}
            </button>
          </div>
        </div>
        <div class="schedule-title">
          <div class="metrics">
            <span class="badge">${completedSched.metrics.days} أيام دوام</span>
            ${meetingExBadge}
            <span class="badge">إجمالي الفراغات: ${formatDurationArabic(completedSched.metrics.gap)}</span>
            <span class="badge">أول محاضرة: <bdi dir="ltr">${minutesToTime(completedSched.metrics.earliest)}</bdi></span>
            <span class="badge">آخر محاضرة: <bdi dir="ltr">${minutesToTime(completedSched.metrics.latest)}</bdi></span>
          </div>
          <div class="daily-breaks-summary">
            <span class="daily-breaks-label">الفراغات اليومية:</span>
            ${(completedSched.metrics.byDay.has('السبت') ? [...DAY_ORDER, 'السبت'] : DAY_ORDER).map(d => {
              const mins = completedSched.metrics.gapsByDay?.get(d) || 0;
              const meetings = completedSched.metrics.byDay.get(d) || [];
              if (!meetings.length) return '';
              const label = meetings.every(m => m.remote) ? 'عن بعد فقط' : mins > 0 ? mins + ' د' : 'متواصل';
              return `<span class="day-break-pill ${mins > 0 ? 'warn-break' : 'no-break'}">${d}: ${label}</span>`;
            }).filter(Boolean).join(' ') || '<span class="day-break-pill no-break">لا توجد فراغات</span>'}
          </div>
        </div>
        <div class="schedule-body">
          ${calendarHtml}
          ${exceptionBannerHtml}
          ${meetingExceptionBannerHtml}
          ${unscheduledHtml}
          <div class="schedule-action-bar">
            <button type="button" class="details-toggle" aria-expanded="false" aria-controls="manual-schedule-details">عرض تفاصيل الجدول</button>
          </div>
          <div id="manual-schedule-details" class="schedule-details" hidden>
            ${completedSched.sections.map(sec => {
              const meetsHtml = formatSectionMeetingsDetailsHtml(sec, rules);
              const scheme = sec.deliveryScheme || (sec.isUnscheduled ? 'unspecified' : 'campus');
              const schemeBadge = scheme === 'unspecified' ? ' <span class="badge badge-neutral">غير محدد</span>' : '';
              return `<div class="schedule-section-detail course-color-${colors ? (colors.get(courseIdentity(sec)) ?? 0) : 0}">
                <h4>${escapeHtml(sec.courseLabel)}</h4>
                <div>شعبة ${escapeHtml(sec.section)}${sec.courseNumber ? ' · ' + escapeHtml(sec.courseNumber) : ''}</div>
                <div>المدرس: ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
                <div class="detail-meetings">${meetsHtml}${schemeBadge}</div>
                <div class="detail-location"><b>المكان:</b> ${formatSectionLocationsHtml(sec)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;

      const toggle = card.querySelector('.details-toggle');
      const details = card.querySelector('.schedule-details');
      toggle?.addEventListener('click', () => {
        const exp = !details.hidden;
        details.hidden = exp;
        toggle.setAttribute('aria-expanded', String(!exp));
        toggle.textContent = !exp ? 'إخفاء تفاصيل الجدول' : 'عرض تفاصيل الجدول';
      });

      card.querySelector('#printManualScheduleBtn')?.addEventListener('click', () => {
        openExport('schedules', 0, { customSchedule: completedSched });
      });
      card.querySelector('#copyManualScheduleBtn')?.addEventListener('click', () => {
        copyScheduleText(0, completedSched);
      });
      card.querySelector('#btnEditManualSections')?.addEventListener('click', () => {
        state.editorReopened = !state.editorReopened;
        renderManualBuilder();
      });

      timetableContainer.appendChild(card);
    } else {
      const selectedList = [...state.selectedSections.values()];
      if (selectedList.length > 0) {
        const card = document.createElement('div');
        card.className = 'schedule-card';

        const colors = buildCourseColorMap([{ sections: selectedList }]);
        const exceptionIdentities = new Set();
        for (const [k, s] of state.selectedSections.entries()) {
          if (state.acknowledgedOverrides.has(k)) exceptionIdentities.add(courseIdentity(s));
        }

        const calendarHtml = renderWeeklyCalendar(selectedList, colors, 0, exceptionIdentities, rules);

        const unscheduledSecs = selectedList.filter(s => s.isUnscheduled);
        let unscheduledHtml = '';
        if (unscheduledSecs.length > 0) {
          const names = unscheduledSecs.map(s => escapeHtml(s.courseLabel)).join('، ');
          unscheduledHtml = `
            <div class="unscheduled-courses-bar" role="status">
              <span class="unscheduled-icon">📌</span>
              <span class="unscheduled-text">مواد بدون موعد مجدول: <b>${names}</b></span>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="manual-timetable-header">
            <h3 class="manual-timetable-title">معاينة الجدول المباشرة</h3>
            <span class="badge badge-neutral">⏳ جدول قيد البناء (${selectedCount} من ${totalCount} مواد مختارة) — اختر بقية المواد لتفعيل الطباعة والاعتماد</span>
          </div>
          <div class="schedule-body">
            ${calendarHtml}
            ${unscheduledHtml}
            <div class="schedule-action-bar">
              <button type="button" class="details-toggle" aria-expanded="false" aria-controls="manual-partial-details">عرض تفاصيل المواد المختارة</button>
            </div>
            <div id="manual-partial-details" class="schedule-details" hidden>
              ${selectedList.map(sec => {
                const meetsHtml = sec.isUnscheduled ? escapeHtml('بدون موعد مجدول') : meetingHtml(sec.meetings);
                return `<div class="schedule-section-detail course-color-${colors ? (colors.get(courseIdentity(sec)) ?? 0) : 0}">
                  <h4>${escapeHtml(sec.courseLabel)}</h4>
                  <div>شعبة ${escapeHtml(sec.section)}${sec.courseNumber ? ' · ' + escapeHtml(sec.courseNumber) : ''}</div>
                  <div>المدرس: ${escapeHtml((sec.instructors || []).join('، ') || 'غير معلن')}</div>
                  <div class="detail-meetings">${meetsHtml}</div>
                  <div class="detail-location"><b>المكان:</b> ${formatSectionLocationsHtml(sec)}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        `;

        const toggle = card.querySelector('.details-toggle');
        const details = card.querySelector('.schedule-details');
        toggle?.addEventListener('click', () => {
          const exp = !details.hidden;
          details.hidden = exp;
          toggle.setAttribute('aria-expanded', String(!exp));
          toggle.textContent = !exp ? 'إخفاء تفاصيل المواد المختارة' : 'عرض تفاصيل المواد المختارة';
        });

        timetableContainer.appendChild(card);
      } else {
        timetableContainer.innerHTML = `
          <div class="manual-empty-timetable">
            <span>⏳ لم تختر أي شعبة بعد. اختر مادة من القائمة أعلاه ثم اضغط "اختيار هذه الشعبة" لعرضها في التقويم مباشرة.</span>
          </div>
        `;
      }
    }
  }
}

function initManualBuilderUI() {
  const tabAuto = $('tabAutoMode');
  const tabManual = $('tabManualMode');
  if (tabAuto && tabManual) {
    tabAuto.addEventListener('click', () => setScheduleMode('auto'));
    tabManual.addEventListener('click', () => setScheduleMode('manual'));
  }
  const resetBtn = $('btnResetManualBuilder');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetManualBuilder);
  }
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

const LEGACY_DEFAULT_COURSES = [
  "استرجاع المعلومات",
  "1910011423 | الحوسبة المتوازية والموزعة",
  "الروبوتات المتنقلة الذكية",
  "مشروع في علم البيانات والذكاء الاصطناعي (1)",
  "مختبر مقدمة في البرمجة",
  "القيادة والمسؤولية المجتمعية"
].join("\n");

function isLegacyDefaultCourses(val) {
  if (typeof val !== 'string') return false;
  const norm = s => s.split(/\r?\n/).map(x => x.trim()).filter(Boolean).join('\n');
  return norm(val) === norm(LEGACY_DEFAULT_COURSES);
}

let draftTimer = null;
function persistCourseDraft() {
  if (typeof clearTimeout === 'function') {
    clearTimeout(draftTimer);
  }
  const coursesEl = $("courses");
  const val = coursesEl ? coursesEl.value : "";
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ courseInputDraft: val });
  }
}

function handleCourseInput() {
  if (typeof clearTimeout === 'function') {
    clearTimeout(draftTimer);
  }
  if (typeof setTimeout === 'function') {
    draftTimer = setTimeout(persistCourseDraft, 150);
  } else {
    persistCourseDraft();
  }
}

function setPanelCollapsed(panelId, isCollapsed) {
  const panel = $(panelId);
  if (!panel) return;
  const toggleBtn = panel.querySelector('.collapsible-header');
  if (isCollapsed) {
    panel.classList.add('is-collapsed');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      const icon = toggleBtn.querySelector('.collapse-icon');
      if (icon) icon.textContent = '◂';
    }
  } else {
    panel.classList.remove('is-collapsed');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      const icon = toggleBtn.querySelector('.collapse-icon');
      if (icon) icon.textContent = '▾';
    }
  }
}

function togglePanelCollapse(panelId) {
  const panel = $(panelId);
  if (!panel) return;
  const isCurrentlyCollapsed = panel.classList.contains('is-collapsed');
  setPanelCollapsed(panelId, !isCurrentlyCollapsed);
}

function initCollapsiblePanels() {
  const sectionsToggle = $('sectionsToggle');
  if (sectionsToggle) {
    sectionsToggle.addEventListener('click', () => togglePanelCollapse('sectionsPanel'));
  }
  const conflictsToggle = $('conflictsToggle');
  if (conflictsToggle) {
    conflictsToggle.addEventListener('click', () => togglePanelCollapse('conflictsPanel'));
  }
}

let hasNotAfterMigrationV15 = false;

async function resolveNotAfterMigration(chosenTime) {
  const notAfterEl = $("notAfter");
  if (notAfterEl) {
    notAfterEl.value = chosenTime;
    syncTimePickerFromCanonical("notAfter");
  }
  const noticeEl = $("notAfterMigrationNotice");
  if (noticeEl) {
    noticeEl.classList.add("hidden");
  }
  hasNotAfterMigrationV15 = true;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get(["huSmartSchedule"]);
      const existing = (stored?.huSmartSchedule && typeof stored.huSmartSchedule === 'object')
        ? stored.huSmartSchedule
        : {};
      const updated = {
        ...existing,
        notAfter: chosenTime,
        notAfterDefaultMigrationV15: true
      };
      await chrome.storage.local.set({huSmartSchedule: updated});
    } catch (e) {
      console.error("Failed to persist notAfter migration decision:", e);
    }
  }

  if (workflowSession && typeof regenerateSchedulesFromSession === 'function') {
    regenerateSchedulesFromSession({ save: false });
  }
}

async function saveSettings() {
  const coursesVal = $("courses") ? $("courses").value : "";
  let existingData = {};
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get(["huSmartSchedule"]);
      if (stored?.huSmartSchedule && typeof stored.huSmartSchedule === 'object') {
        existingData = stored.huSmartSchedule;
      }
    } catch (_) {}
  }
  const data = {
    ...existingData,
    year: $("year") ? $("year").value : existingData.year,
    semester: $("semester") ? $("semester").value : existingData.semester,
    courses: coursesVal,
    notBefore: $("notBefore") ? $("notBefore").value : existingData.notBefore,
    notAfter: $("notAfter") ? $("notAfter").value : existingData.notAfter,
    ranking: $("ranking") ? $("ranking").value : existingData.ranking,
    offDays: [...document.querySelectorAll(".offday:checked")].map(x => x.value)
  };
  if (hasNotAfterMigrationV15 || existingData.notAfterDefaultMigrationV15) {
    data.notAfterDefaultMigrationV15 = true;
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({huSmartSchedule: data, courseInputDraft: coursesVal});
  }
}

async function loadSettings() {
  const obj = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? await chrome.storage.local.get(["huSmartSchedule", "courseInputDraft"])
    : {};
  const data = obj?.huSmartSchedule;
  let draft = obj?.courseInputDraft;

  hasNotAfterMigrationV15 = Boolean(data?.notAfterDefaultMigrationV15);

  if (typeof draft === 'string') {
    if (isLegacyDefaultCourses(draft)) {
      draft = '';
    }
  } else if (data?.courses) {
    draft = isLegacyDefaultCourses(data.courses) ? '' : data.courses;
  }

  if (typeof draft === 'string') {
    const coursesEl = $("courses");
    if (coursesEl) coursesEl.value = draft;
  }

  const noticeEl = $("notAfterMigrationNotice");

  if (!data) {
    if (noticeEl) noticeEl.classList.add("hidden");
    return;
  }

  if (data.year && $("year")) $("year").value = data.year;
  if (data.semester && $("semester")) $("semester").value = data.semester;
  if (typeof data.notBefore === 'string' && $("notBefore")) {
    $("notBefore").value = data.notBefore;
    syncTimePickerFromCanonical("notBefore");
  }

  if (typeof data.notAfter === 'string') {
    if ($("notAfter")) {
      $("notAfter").value = data.notAfter;
      syncTimePickerFromCanonical("notAfter");
    }
    if (data.notAfter === "18:00" && !hasNotAfterMigrationV15) {
      if (noticeEl) noticeEl.classList.remove("hidden");
    } else {
      if (noticeEl) noticeEl.classList.add("hidden");
    }
  } else {
    if (noticeEl) noticeEl.classList.add("hidden");
  }

  if (data.ranking && $("ranking")) {
    $("ranking").value = data.ranking;
    syncRankingChipsFromCanonical();
  }

  const off = new Set(data.offDays || []);
  for (const box of document.querySelectorAll(".offday")) {
    box.checked = off.has(box.value);
  }
}

function completeScheduleGeneration(allSections, prefs, courseRules = (workflowSession?.courseRules || null)) {
  currentAllSections = allSections;
  const originalCourseCount = allSections.size;
  const excludedCourses = [];
  for (const [key, sections] of allSections.entries()) {
    if (isCourseExcludedFromGeneration(courseRules, key)) {
      excludedCourses.push({
        courseKey: key,
        courseLabel: sections[0]?.courseLabel || key
      });
    }
  }
  const includedCourseCount = originalCourseCount - excludedCourses.length;
  lastGenerationContext = {
    originalCourseCount,
    includedCourseCount,
    excludedCourses
  };

  const unparseableCourses = [...allSections.entries()]
    .filter(([key]) => !isCourseExcludedFromGeneration(courseRules, key))
    .filter(([, sections]) => !sections.some(isValidSchedulingSection))
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

  // Use only valid scheduling sections when building schedules, skipping excluded courses.
  const parseable = new Map(
    [...allSections.entries()]
      .filter(([key]) => !isCourseExcludedFromGeneration(courseRules, key))
      .map(([key, sections]) => [
        key,
        sections.filter(isValidSchedulingSection)
      ])
  );

  const schedules = generateSchedules(parseable, prefs, 80, 50000, 5000, courseRules);
  const excluded = [...allSections.entries()]
    .filter(([key]) => !isCourseExcludedFromGeneration(courseRules, key))
    .flatMap(([, s]) => s)
    .filter(s => !isValidSchedulingSection(s)).length;

  if (!schedules.length) {
    lastZeroScheduleDiagnostic = diagnoseZeroSchedules(allSections, prefs, schedules, courseRules);
  } else {
    lastZeroScheduleDiagnostic = null;
  }

  setCandidateSchedules(schedules);

  if (schedules.truncated && schedules.length) {
    setStatus(`توقف البحث عند حد الأمان (${schedules.nodes} خطوة، ${schedules.totalFound} جدول محفوظ). النتائج جزئية؛ خيارات الاستراحة وأعدادها مبنية على الجداول المحفوظة فقط. لا يمكن تأكيد أفضل جدول أو عدم وجود حل. عُرض ${Math.min(80, schedules.length)} اقتراح.`, 'error');
  } else if (schedules.length) {
    let okMsg = `تم ✅ وجدت ${schedules.totalFound} جدولاً صالحاً من الشعب المقروءة. المعروض أفضل ${Math.min(80, schedules.length)}. استُبعدت ${excluded} شعبة ذات مواعيد غير مؤكدة.`;
    if (excludedCourses.length) {
      okMsg += ` (تم استبعاد ${excludedCourses.length} مواد من التوليد بطلبك).`;
    }
    setStatus(okMsg, "ok");
  } else if (schedules.truncated) {
    setStatus("توقف البحث عند حد الأمان قبل العثور على جدول كامل — راجع التفاصيل أدناه.", "error");
  } else {
    setStatus("تعذر إنشاء جدول كامل — راجع تفاصيل التشخيص أدناه.", "error");
  }
}

let workflowSession = null;
let workflowBusy = false;
let workflowEntryId = 0;

function userSearchError(error) {
  console.error(error);
  return 'تعذر قراءة بيانات الشعب من موقع الجامعة. حاول مرة ثانية، وإذا استمرت المشكلة أرفق صورة للشاشة عند التواصل معنا.';
}

function setWorkflowBusy(busy) {
  workflowBusy=busy;
  for(const id of ['run','addCourseConfirm','showAddCourse','changeCollege']) $(id).disabled=busy;
  for(const button of document.querySelectorAll('[data-remove-course]'))button.disabled=busy;
  $('continueWithoutUnavailable').disabled=busy;
}

function clearWorkflowResults() {
  currentSchedules=[];candidateSchedules=[];availableBreaks=[];candidateSetTruncated=false;
  currentAllSections=new Map();lastConflictReport=null;lastZeroScheduleDiagnostic=null;lastGenerationContext=null;
  if(workflowSession){workflowSession.breakKeys=[];workflowSession.breakMode='all';}
  $('breakFilters').replaceChildren();$('breakSummary').textContent='';
  for(const id of ['sections','schedules','sectionConflicts'])$(id).replaceChildren();
  for(const id of ['sectionsPanel','schedulesPanel','conflictsPanel','unavailablePanel','scheduleModeTabs','manualBuilderPanel'])$(id)?.classList.add('hidden');
  setScheduleMode('auto');
  const diagEl = $('zeroScheduleDiagnostic');
  if (diagEl) {
    diagEl.replaceChildren();
    diagEl.classList.add('hidden');
  }
  const breakControls = $('schedulesPanel')?.querySelector('.break-controls');
  if (breakControls) breakControls.classList.remove('hidden');
  $('continueWithoutUnavailable').onclick=null;
}

function getCourseListSignature(text) {
  if (typeof text !== 'string') return '';
  const lines = text
    .split(/\r?\n/)
    .map(l => cleanText(l))
    .filter(Boolean);
  return lines.sort().join('||');
}

function getSessionEntriesSignature(entries) {
  if (!Array.isArray(entries)) return '';
  const lines = entries
    .filter(e => !e.excluded)
    .map(e => cleanText(e.result?.original || e.result?.query || ''))
    .filter(Boolean);
  return lines.sort().join('||');
}

function regenerateSchedulesFromSession(options = {}) {
  if (workflowBusy || !workflowSession) return false;
  const active = workflowSession.entries ? workflowSession.entries.filter(e => !e.excluded) : [];
  const missing = active.filter(e => !e.sections || !e.sections.length);
  if (missing.length > 0 || !active.length) {
    return false;
  }
  const allSections = new Map(active.map(e => [e.id, e.sections]));
  if (!allSections.size) return false;

  if (!options.skipValidation) {
    const yearEl = $('year');
    const semesterEl = $('semester');
    if (yearEl && semesterEl && workflowSession.term) {
      const currentYear = arabicDigitsToAscii(cleanText(yearEl.value));
      const currentSemester = semesterEl.value;
      if (workflowSession.term.year && currentYear && workflowSession.term.year !== currentYear) {
        if (options.save !== false) saveSettings().catch(console.error);
        setStatus('تم حفظ التفضيلات. اضغط اجلب الشعب وابنِ الجداول لتحديث المواد الحالية.');
        return false;
      }
      if (workflowSession.term.semester && currentSemester && workflowSession.term.semester !== currentSemester) {
        if (options.save !== false) saveSettings().catch(console.error);
        setStatus('تم حفظ التفضيلات. اضغط اجلب الشعب وابنِ الجداول لتحديث المواد الحالية.');
        return false;
      }
    }

    const coursesEl = $('courses');
    if (coursesEl && workflowSession.courseSignature) {
      const currentSig = getCourseListSignature(coursesEl.value);
      if (currentSig !== workflowSession.courseSignature) {
        if (options.save !== false) saveSettings().catch(console.error);
        setStatus('تم حفظ التفضيلات. اضغط اجلب الشعب وابنِ الجداول لتحديث المواد الحالية.');
        return false;
      }
    }
  }

  let newPrefs;
  if (options.useSessionPrefs && workflowSession.prefs) {
    newPrefs = workflowSession.prefs;
  } else {
    try {
      newPrefs = getPrefs();
    } catch (error) {
      setStatus('وقت البداية يجب أن يسبق وقت النهاية.', 'error');
      return false;
    }
    workflowSession.prefs = newPrefs;
  }

  if (options.save !== false) {
    saveSettings().catch(console.error);
  }

  if (!workflowSession.courseRules) {
    workflowSession.courseRules = new Map();
  }

  completeScheduleGeneration(allSections, workflowSession.prefs, workflowSession.courseRules);
  if (currentScheduleMode === 'manual' || workflowSession?.manualBuilder) {
    renderManualBuilder();
  }
  if (!currentSchedules.length) {
    setStatus($('status').textContent + ' يمكنك إزالة مادة أو تغييرها بإزالتها ثم إضافة البديل.', 'error');
  }
  return true;
}

function rerunGenerationWithRules() {
  if (!workflowSession) return false;
  return regenerateSchedulesFromSession({ save: false, skipValidation: true, useSessionPrefs: true });
}

function duplicateWorkflowMessage(entries) {
  const identities=new Map();
  for(const entry of entries) {
    const r=entry.result,number=r.resolvedCourseNumber;
    if(!number||r.error)continue;
    if(identities.has(number))return `${identities.get(number)} و ${r.original} يشيران لنفس المادة\n(${number} — ${r.canonicalName||r.label}).\nاحذف أحدهما للمتابعة.`;
    identities.set(number,r.original);
  }
  return '';
}

function removeWorkflowCourse(id) {
  if(workflowBusy||!workflowSession)return;
  const entry=workflowSession.entries.find(e=>e.id===id);
  if(entry)entry.excluded=true;
  refreshWorkflow();
}

async function recheckWorkflowCourse(id) {
  if (workflowBusy || !workflowSession) return;
  const entry = workflowSession.entries.find(e => e.id === id);
  if (!entry) return;
  setWorkflowBusy(true);
  setStatus('جاري إعادة فحص المادة: ' + (entry.result.canonicalName || entry.result.label || entry.result.query));
  try {
    const course = {
      kind: 'number',
      query: entry.result.resolvedCourseNumber || entry.result.query,
      label: entry.result.canonicalName || entry.result.label,
      original: entry.result.original || entry.result.label
    };
    const result = await searchSmartCourse(course, workflowSession.term.year, workflowSession.term.semester, { forceRefresh: true });
    entry.result = result;
    try {
      entry.sections = buildSections(result);
    } catch (error) {
      entry.result.error = userSearchError(error);
      entry.sections = [];
    }
    entry.sections.forEach(s => { s.courseEntryId = entry.id; s.entryId = entry.id; });
    refreshWorkflow();
  } catch (error) {
    setStatus(userSearchError(error), 'error');
  } finally {
    setWorkflowBusy(false);
  }
}

function refreshWorkflow() {
  clearWorkflowResults();
  if(!workflowSession)return;
  currentResultTerm={...workflowSession.term};
  try {workflowSession.prefs=getPrefs();}catch(error){setStatus('وقت البداية يجب أن يسبق وقت النهاية.','error');return;}
  const active=workflowSession.entries.filter(e=>!e.excluded);
  $('courses').value=active.map(e=>e.result.original).join('\n');
  workflowSession.courseSignature = getCourseListSignature($('courses').value);
  if (workflowSession?.manualBuilder) {
    const activeIds = new Set(active.map(e => e.id));
    for (const key of workflowSession.manualBuilder.selectedSections.keys()) {
      if (!activeIds.has(key)) {
        workflowSession.manualBuilder.selectedSections.delete(key);
        workflowSession.manualBuilder.acknowledgedOverrides.delete(key);
      }
    }
    if (workflowSession.manualBuilder.excludedCourseKeys) {
      for (const key of workflowSession.manualBuilder.excludedCourseKeys) {
        if (!activeIds.has(key)) {
          workflowSession.manualBuilder.excludedCourseKeys.delete(key);
        }
      }
    }
    if (workflowSession.manualBuilder.activeCourseKey && !activeIds.has(workflowSession.manualBuilder.activeCourseKey)) {
      workflowSession.manualBuilder.activeCourseKey = activeIds.values().next().value || null;
    }
  }
  persistCourseDraft();
  $('workflowPanel').classList.remove('hidden');
  $('workflowScope').textContent=`السنة ${currentResultTerm.year} — ${currentResultTerm.semester}. الإضافة تستخدم نفس الفصل والبيانات المحفوظة لهذه الجلسة.`;
  updateSharedCollegeUI();
  workflowSession.entries.forEach(e => {
    (e.sections || []).forEach(s => {
      s.courseEntryId = e.id;
      s.entryId = e.id;
    });
  });
  const missing=active.filter(e=>!e.sections.length),allSections=new Map(active.filter(e=>e.sections.length).map(e=>[e.id,e.sections]));
  renderSections(allSections);renderSectionConflicts(allSections);
  if(!allSections.size){$('sectionsPanel').classList.add('hidden');$('conflictsPanel').classList.add('hidden');}
  const duplicate=duplicateWorkflowMessage(active);
  const list=$('unavailableCourses');list.replaceChildren();
  for(const entry of missing) {
    const r=entry.result,item=document.createElement('li');
    item.textContent=`${r.label} (${r.resolvedCourseNumber||r.query}) — ${r.error||r.searchMessage||'لم يتم تحديد المادة.'}`;
    if(r.searchState==='known_not_offered') {
      const badge=document.createElement('span');badge.className='badge availability-missing';badge.textContent='غير مطروح هذا الفصل';item.append(badge);
    }
    if(r.historicalHint){const hint=document.createElement('small');hint.className='historical-hint';hint.textContent=r.historicalHint;item.append(hint);}
    if(r.searchState==='known_not_offered') {
      const recheck=document.createElement('button');recheck.type='button';recheck.dataset.recheckCourse=entry.id;
      recheck.textContent='إعادة فحص';recheck.disabled=workflowBusy;recheck.onclick=()=>recheckWorkflowCourse(entry.id);item.append(recheck);
    }
    const remove=document.createElement('button');remove.type='button';remove.dataset.removeCourse=entry.id;
    remove.textContent=r.searchState==='known_not_offered'?'استبعاد المادة والمتابعة':'إزالة الطلب';remove.disabled=workflowBusy;remove.onclick=()=>removeWorkflowCourse(entry.id);item.append(remove);list.append(item);
  }
  const omitted=workflowSession.entries.filter(e=>e.excluded&&!e.sections.length);
  if(missing.length||omitted.length) {
    $('unavailablePanel').classList.remove('hidden');
    $('unavailableNotice').textContent=missing.length?'لم تُضف المواد التالية؛ استبعد المادة غير المطروحة للمتابعة:':'تم استبعاد المواد التالية باختيارك من الجداول المقترحة: '+omitted.map(e=>e.result.label).join('، ');
  }
  const proceed=$('continueWithoutUnavailable');
  proceed.hidden=!missing.length||!allSections.size||missing.some(e=>e.result.error||e.result.searchState!=='known_not_offered');
  proceed.disabled=!missing.length;
  if(missing.length)proceed.onclick=()=>{if(workflowBusy)return;for(const e of missing)e.excluded=true;refreshWorkflow();};
  if(duplicate){setStatus(duplicate,'error');return;}
  if(!active.length){setStatus('لا توجد مواد في الجدول الحالي. أضف مادة للبدء.');return;}
  if(missing.length){setStatus('لم يتم توليد جدول ناقص. استبعد المادة غير المطروحة للمتابعة أو أزل الطلب لتغييره.','error');return;}
  if (!workflowSession.courseRules) workflowSession.courseRules = new Map();
  completeScheduleGeneration(allSections, workflowSession.prefs, workflowSession.courseRules);
  if (allSections.size > 0) {
    $('scheduleModeTabs')?.classList.remove('hidden');
  } else {
    $('scheduleModeTabs')?.classList.add('hidden');
  }
  if (currentScheduleMode === 'manual') {
    renderManualBuilder();
  }
  if(!currentSchedules.length) setStatus($('status').textContent+' يمكنك إزالة مادة أو تغييرها بإزالتها ثم إضافة البديل.','error');
}

async function loadWorkflowEntry(course, options = {}) {
  let result;
  try {result=await searchSmartCourse(course,workflowSession.term.year,workflowSession.term.semester, options);}
  catch(error){result={...course,headers:[],rows:[],error:userSearchError(error)};}
  let sections=[];
  try {sections=buildSections(result);}catch(error){result.error=userSearchError(error);}
  const entryId = 'course-'+(++workflowEntryId);
  sections.forEach(s => { s.courseEntryId = entryId; s.entryId = entryId; });
  workflowSession.entries.push({id:entryId,result,sections,excluded:false});
}

async function addWorkflowCourse() {
  if(workflowBusy||!workflowSession)return;
  const course=parseCourseLine($('addCourseInput').value);
  if(!course){setStatus('اكتب اسم المادة أو رقمها لإضافتها.','error');return;}
  setWorkflowBusy(true);setStatus('جاري البحث عن المادة الجديدة: '+course.label);
  try {
    await loadWorkflowEntry(course);
    refreshWorkflow();$('addCourseInput').value='';$('addCourseForm').classList.add('hidden');
  } catch(error){setStatus(userSearchError(error),'error');}
  finally {setWorkflowBusy(false);}
}

async function run() {
  if(workflowBusy)return;
  setWorkflowBusy(true);workflowSession=null;currentResultTerm=null;clearWorkflowResults();$('workflowPanel').classList.add('hidden');
  try {
    await saveSettings();
    const year=arabicDigitsToAscii(cleanText($('year').value)),semester=$('semester').value;
    if(!/^\d{4}$/.test(year)){setStatus('أدخل سنة صحيحة من أربع خانات.','error');return;}
    let prefs;
    try {prefs=getPrefs();}catch(error){setStatus('وقت البداية يجب أن يسبق وقت النهاية.','error');return;}
    const courses=$('courses').value.split(/\r?\n/).map(parseCourseLine).filter(Boolean);
    if(!courses.length){setStatus('اكتب مادة واحدة على الأقل.','error');return;}
    workflowSession={
      term:{year,semester},
      prefs,
      entries:[],
      breakKeys:[],
      breakMode:'all',
      courseRules:new Map(),
      manualBuilder: createManualBuilderState(),
      courseSignature: getCourseListSignature($('courses').value)
    };
    for(let i=0;i<courses.length;i++) {
      setStatus(`جاري البحث ${i+1}/${courses.length}: ${courses[i].label}`);
      await loadWorkflowEntry(courses[i]);
    }
    refreshWorkflow();
  }catch(error){setStatus(userSearchError(error),'error');}
  finally{setWorkflowBusy(false);}
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

let reactivePrefTimer = null;

function handleReactivePrefChange(immediate = false) {
  if (reactivePrefTimer) {
    clearTimeout(reactivePrefTimer);
    reactivePrefTimer = null;
  }

  const execute = () => {
    if (!workflowSession) {
      try {
        getPrefs();
        saveSettings().catch(console.error);
      } catch (err) {
        setStatus('وقت البداية يجب أن يسبق وقت النهاية.', 'error');
      }
      return;
    }
    regenerateSchedulesFromSession();
  };

  if (immediate) {
    execute();
  } else {
    reactivePrefTimer = setTimeout(execute, 180);
  }
}

function initReactivePreferenceListeners() {
  const notBeforeEl = $('notBefore');
  if (notBeforeEl) {
    notBeforeEl.addEventListener('input', () => handleReactivePrefChange(false));
    notBeforeEl.addEventListener('change', () => handleReactivePrefChange(true));
  }
  const notAfterEl = $('notAfter');
  if (notAfterEl) {
    notAfterEl.addEventListener('input', () => handleReactivePrefChange(false));
    notAfterEl.addEventListener('change', () => handleReactivePrefChange(true));
  }
  const rankingEl = $('ranking');
  if (rankingEl) {
    rankingEl.addEventListener('change', () => handleReactivePrefChange(true));
  }
  const offdays = document.querySelectorAll('.offday');
  for (const cb of offdays) {
    cb.addEventListener('change', () => handleReactivePrefChange(true));
  }
}

const openTabBtn = $("openTab");
if (openTabBtn) {
  openTabBtn.addEventListener("click", openInTab);
}

initTabMode();
initCustomTimePickers();
initRankingChips();
initReactivePreferenceListeners();
initManualBuilderUI();

$("run").disabled = true;
loadSettings().catch(console.error).finally(() => { $("run").disabled = false; });
$("run").addEventListener("click", run);

const btnAcceptNotAfterMigration = $("btnAcceptNotAfterMigration");
if (btnAcceptNotAfterMigration) {
  btnAcceptNotAfterMigration.addEventListener("click", () => {
    resolveNotAfterMigration("22:00").catch(console.error);
  });
}
const btnKeepNotAfterMigration = $("btnKeepNotAfterMigration");
if (btnKeepNotAfterMigration) {
  btnKeepNotAfterMigration.addEventListener("click", () => {
    resolveNotAfterMigration("18:00").catch(console.error);
  });
}

$('showAddCourse').onclick=()=>{$('addCourseForm').classList.remove('hidden');$('addCourseInput').focus();};
$('addCourseConfirm').onclick=addWorkflowCourse;
$('changeCollege').onclick = async () => {
  const feedbackEl = $('sharedCollegeFeedback');
  if (feedbackEl) {
    feedbackEl.classList.add('hidden');
    feedbackEl.textContent = '';
  }
  let index;
  try {
    index = await getSmartSearchIndex();
  } catch (err) {
    setStatus('تعذر تحميل فهرس المواد لاختيار الكلية.', 'error');
    return;
  }
  const previousChoice = broadFacultyChoice;
  const newChoice = await chooseCollege(index, true);
  if (newChoice !== null && newChoice !== previousChoice) {
    const displayName = getCollegeDisplayName(newChoice);
    const msg = `تم تغيير كلية المواد المشتركة إلى: ${displayName}. المواد والجداول الحالية لم تتغير.`;
    setStatus(msg);
    if (feedbackEl) {
      feedbackEl.textContent = msg;
      feedbackEl.classList.remove('hidden');
    }
  } else if (newChoice !== null && newChoice === previousChoice) {
    if (feedbackEl) {
      feedbackEl.textContent = 'تم الإبقاء على نفس الكلية دون تغيير.';
      feedbackEl.classList.remove('hidden');
    }
  }
};

initCollapsiblePanels();
updateSharedCollegeUI();

const coursesInputEl = $("courses");
if (coursesInputEl) {
  coursesInputEl.addEventListener("input", handleCourseInput);
  coursesInputEl.addEventListener("change", persistCourseDraft);
  coursesInputEl.addEventListener("blur", persistCourseDraft);
}

const zeroDiagEl = $("zeroScheduleDiagnostic");
if (zeroDiagEl) {
  zeroDiagEl.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const courseKey = btn.dataset.courseKey;
    if (!action || !workflowSession) return;
    if (action !== "exclude-courses" && !courseKey) return;
    if (!workflowSession.courseRules) workflowSession.courseRules = new Map();

    const existingRule = courseKey ? (getCourseRule(workflowSession.courseRules, courseKey) || createCourseRule()) : null;

    if (action === "apply-exception") {
      let overrides = {};
      try {
        overrides = JSON.parse(btn.dataset.overrides || "{}");
      } catch (err) {
        console.error("Failed to parse overrides:", err);
      }
      const updatedRule = {
        ...existingRule,
        ...overrides,
        excludedFromGeneration: false
      };
      workflowSession.courseRules.set(courseKey, updatedRule);
      rerunGenerationWithRules();
    } else if (action === "exclude-course") {
      const updatedRule = {
        ...existingRule,
        excludedFromGeneration: true
      };
      workflowSession.courseRules.set(courseKey, updatedRule);
      rerunGenerationWithRules();
    } else if (action === "exclude-courses") {
      const rawKeys = btn.dataset.courseKeys || "";
      const keys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);
      for (const k of keys) {
        const rule = getCourseRule(workflowSession.courseRules, k) || createCourseRule();
        workflowSession.courseRules.set(k, {
          ...rule,
          excludedFromGeneration: true
        });
      }
      rerunGenerationWithRules();
    } else if (action === "reset-course-pattern") {
      const updatedRule = {
        ...existingRule,
        allowedDayPattern: null
      };
      workflowSession.courseRules.set(courseKey, updatedRule);
      const card = document.querySelector(`.course-card[data-course-key="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(courseKey) : courseKey}"]`);
      if (card) {
        const chips = card.querySelectorAll(".course-pattern-chip");
        chips.forEach(c => {
          const isAll = c.dataset.pattern === "__all__";
          c.classList.toggle("is-active", isAll);
          c.setAttribute("aria-checked", isAll ? "true" : "false");
          c.setAttribute("tabindex", isAll ? "0" : "-1");
        });
      }
      rerunGenerationWithRules();
    }
  });
}

const schedulesEl = $("schedules");
if (schedulesEl) {
  schedulesEl.addEventListener("click", e => {
    const undoBtn = e.target.closest("[data-undo-exclusion]");
    if (!undoBtn) return;
    const courseKey = undoBtn.dataset.undoExclusion;
    if (!courseKey || !workflowSession) return;
    if (!workflowSession.courseRules) workflowSession.courseRules = new Map();

    const existingRule = getCourseRule(workflowSession.courseRules, courseKey) || createCourseRule();
    existingRule.excludedFromGeneration = false;
    workflowSession.courseRules.set(courseKey, existingRule);
    rerunGenerationWithRules();
  });
}

const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
if (globalScope) {
  globalScope.UNSCHEDULED_DAY_PATTERN = UNSCHEDULED_DAY_PATTERN;
  globalScope.ALL_CANONICAL_DAYS = ALL_CANONICAL_DAYS;
  globalScope.getSectionDayPatternKey = getSectionDayPatternKey;
  globalScope.formatDayPatternLabel = formatDayPatternLabel;
  globalScope.getAvailableDayPatternsForCourse = getAvailableDayPatternsForCourse;
  globalScope.isSectionPatternAllowed = isSectionPatternAllowed;
  globalScope.formatSectionCountArabic = formatSectionCountArabic;
  globalScope.evaluateSectionEligibility = evaluateSectionEligibility;
  globalScope.diagnoseCourseSections = diagnoseCourseSections;
  globalScope.diagnoseZeroSchedules = diagnoseZeroSchedules;
  globalScope.renderZeroScheduleDiagnosticHtml = renderZeroScheduleDiagnosticHtml;
  globalScope.createCourseRule = createCourseRule;
  globalScope.getCourseRule = getCourseRule;
  globalScope.hasPreferenceOverride = hasPreferenceOverride;
  globalScope.isCourseExcludedFromGeneration = isCourseExcludedFromGeneration;
  globalScope.getEffectivePrefsForCourse = getEffectivePrefsForCourse;
  globalScope.deriveAppliedException = deriveAppliedException;
  globalScope.describeAppliedExceptionHtml = describeAppliedExceptionHtml;
  globalScope.describeAppliedExceptionText = describeAppliedExceptionText;
  globalScope.renderBlockedCourseDecisionsHtml = renderBlockedCourseDecisionsHtml;
  globalScope.formatCourseCountOfOriginal = formatCourseCountOfOriginal;
  globalScope.rerunGenerationWithRules = rerunGenerationWithRules;
  globalScope.regenerateSchedulesFromSession = regenerateSchedulesFromSession;
  globalScope.handleReactivePrefChange = handleReactivePrefChange;
  globalScope.getCourseListSignature = getCourseListSignature;
  globalScope.getSessionEntriesSignature = getSessionEntriesSignature;
  globalScope.initReactivePreferenceListeners = initReactivePreferenceListeners;
  globalScope.completeScheduleGeneration = completeScheduleGeneration;
  globalScope.generateSchedules = generateSchedules;
  globalScope.chooseCollege = chooseCollege;
  globalScope.getCollegeDisplayName = getCollegeDisplayName;
  globalScope.updateSharedCollegeUI = updateSharedCollegeUI;
  globalScope.to24HourTime = to24HourTime;
  globalScope.from24HourTime = from24HourTime;
  globalScope.populateTimePickerOptions = populateTimePickerOptions;
  globalScope.syncTimePickerFromCanonical = syncTimePickerFromCanonical;
  globalScope.syncCanonicalFromTimePicker = syncCanonicalFromTimePicker;
  globalScope.initCustomTimePickers = initCustomTimePickers;
  globalScope.openTimePickerPopover = openTimePickerPopover;
  globalScope.closeTimePickerPopover = closeTimePickerPopover;
  globalScope.toggleTimePickerPopover = toggleTimePickerPopover;
  globalScope.closeAllTimePickerPopovers = closeAllTimePickerPopovers;
  globalScope.formatTime12hArabic = formatTime12hArabic;
  globalScope.validateAndNormalizeMinute = validateAndNormalizeMinute;
  globalScope.commitMinuteInput = commitMinuteInput;
  globalScope.openMinuteDropdown = openMinuteDropdown;
  globalScope.closeMinuteDropdown = closeMinuteDropdown;
  globalScope.toggleMinuteDropdown = toggleMinuteDropdown;
  globalScope.isMinuteDropdownOpen = isMinuteDropdownOpen;
  globalScope.selectMinuteDropdownValue = selectMinuteDropdownValue;
  globalScope.validateAndNormalizeHour = validateAndNormalizeHour;
  globalScope.commitHourInput = commitHourInput;
  globalScope.openHourDropdown = openHourDropdown;
  globalScope.closeHourDropdown = closeHourDropdown;
  globalScope.toggleHourDropdown = toggleHourDropdown;
  globalScope.isHourDropdownOpen = isHourDropdownOpen;
  globalScope.syncHourDropdownSelected = syncHourDropdownSelected;
  globalScope.selectHourDropdownValue = selectHourDropdownValue;
  globalScope.positionDropdown = positionDropdown;
  globalScope.scrollHourMenuToSelected = scrollHourMenuToSelected;
  globalScope.navigateHourGrid = navigateHourGrid;
  globalScope.syncRankingChipsFromCanonical = syncRankingChipsFromCanonical;
  globalScope.selectRankingChip = selectRankingChip;
  globalScope.initRankingChips = initRankingChips;
  globalScope.checkScheduleFeasibility = checkScheduleFeasibility;
  globalScope.extractConflictCores = extractConflictCores;
  globalScope.findVerifiedExclusionRecommendations = findVerifiedExclusionRecommendations;
  globalScope.analyzeCombinationConflict = analyzeCombinationConflict;
  globalScope.createManualBuilderState = createManualBuilderState;
  globalScope.getManualBuilderState = getManualBuilderState;
  globalScope.resetManualBuilder = resetManualBuilder;
  globalScope.getManualBuilderActiveCourses = getManualBuilderActiveCourses;
  globalScope.getSectionTimeConflict = getSectionTimeConflict;
  globalScope.evaluateManualSection = evaluateManualSection;
  globalScope.computeManualBuilderGuidance = computeManualBuilderGuidance;
  globalScope.selectManualSection = selectManualSection;
  globalScope.deselectManualSection = deselectManualSection;
  globalScope.buildCompletedManualSchedule = buildCompletedManualSchedule;
  globalScope.excludeManualCourse = excludeManualCourse;
  globalScope.reincludeManualCourse = reincludeManualCourse;
  globalScope.getAllSectionTimeConflicts = getAllSectionTimeConflicts;
  globalScope.groupDuplicateConflictWarnings = groupDuplicateConflictWarnings;
  globalScope.formatExcludedCountArabic = formatExcludedCountArabic;
  globalScope.formatDaysListArabic = formatDaysListArabic;
  globalScope.setScheduleMode = setScheduleMode;
  globalScope.renderManualBuilder = renderManualBuilder;
  globalScope.initManualBuilderUI = initManualBuilderUI;
  globalScope.isProjectCourse = isProjectCourse;
  globalScope.getMeetingKey = getMeetingKey;
  globalScope.isMeetingEligibleForException = isMeetingEligibleForException;
  globalScope.isMeetingProactiveCandidate = isMeetingProactiveCandidate;
  globalScope.meetingRequiresConfirmation = meetingRequiresConfirmation;
  globalScope.isMeetingExcepted = isMeetingExcepted;
  globalScope.getPlanningMeetings = getPlanningMeetings;
  globalScope.toggleMeetingException = toggleMeetingException;
  globalScope.formatCompactInstructorName = formatCompactInstructorName;
  globalScope.meetingTier = meetingTier;
  globalScope.blockInstructorText = blockInstructorText;
  globalScope.formatMeetingLocation = formatMeetingLocation;
  globalScope.formatSectionLocationText = formatSectionLocationText;
  globalScope.formatSectionLocation = formatSectionLocation;
  globalScope.formatSectionLocationsHtml = formatSectionLocationsHtml;
  globalScope.getRoomFriendlyMeaning = getRoomFriendlyMeaning;
  globalScope.formatBlockLocation = formatBlockLocation;
  globalScope.formatFriendlyRoomCode = formatFriendlyRoomCode;
  globalScope.formatMeetingTooltipLocation = formatMeetingTooltipLocation;
  globalScope.ROOM_FRIENDLY_NAMES = ROOM_FRIENDLY_NAMES;
  Object.defineProperty(globalScope, 'currentScheduleMode', {
    get: () => currentScheduleMode,
    set: v => { currentScheduleMode = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'broadFacultyChoice', {
    get: () => broadFacultyChoice,
    set: v => { broadFacultyChoice = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'workflowSession', {
    get: () => workflowSession,
    set: v => { workflowSession = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'lastGenerationContext', {
    get: () => lastGenerationContext,
    set: v => { lastGenerationContext = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'currentAllSections', {
    get: () => currentAllSections,
    set: v => { currentAllSections = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'lastZeroScheduleDiagnostic', {
    get: () => lastZeroScheduleDiagnostic,
    set: v => { lastZeroScheduleDiagnostic = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'currentSchedules', {
    get: () => currentSchedules,
    set: v => { currentSchedules = v; },
    configurable: true
  });
  Object.defineProperty(globalScope, 'candidateSchedules', {
    get: () => candidateSchedules,
    set: v => { candidateSchedules = v; },
    configurable: true
  });
}
