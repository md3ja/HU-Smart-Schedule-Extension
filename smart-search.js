"use strict";

(function (root) {
  function normalize(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
      .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const NEVER_AUTO = new Set(['java', 'جافا', 'c++', 'ai', 'ros']);
  function createIndex(data) {
    if (data.schemaVersion !== 1 || !Array.isArray(data.courses)) throw new Error('Invalid search catalog');
    const courses = data.courses.map(course => ({...course, normalizedName: normalize(course.officialName)}));
    const byNumber = new Map();
    for (const course of courses) {
      if (!/^\d{6,10}$/.test(course.courseNumber) || !course.normalizedName || byNumber.has(course.courseNumber)) throw new Error('Invalid catalog identity');
      byNumber.set(course.courseNumber, course);
    }
    const aliases = new Map(), ambiguous = new Map(), blocked = new Set((data.blockedAliases || []).map(normalize));
    for (const entry of data.ambiguousAliases || []) {
      const key = normalize(entry.alias);
      const ids = [...new Set(entry.courseNumbers)].filter(id => byNumber.has(id));
      ambiguous.set(key, ids); // Even a single remaining candidate still needs a choice.
    }
    for (const entry of data.approvedAliases || []) {
      const key = normalize(entry.alias);
      if (entry.approved !== true || entry.ambiguous || /reject|review|ambiguous/i.test(entry.confidence || '') || blocked.has(key) || NEVER_AUTO.has(key)) continue;
      if (!byNumber.has(entry.courseNumber)) throw new Error('Unknown alias target');
      const ids = [...new Set([...(aliases.get(key) || []), entry.courseNumber])];
      aliases.set(key, ids);
    }
    return {courses, byNumber, aliases, ambiguous, blocked};
  }

  function resolve(index, input) {
    const query = normalize(input);
    if (/^\d{6,}$/.test(query)) return {state: 'resolved', courseNumber: query, course: index.byNumber.get(query), match: 'number'};
    const selection = (courses, match, force = false) => courses.length === 1 && !force
      ? {state: 'resolved', courseNumber: courses[0].courseNumber, course: courses[0], match}
      : {state: 'ambiguous', candidates: courses, match};
    const fromIds = ids => ids.map(id => index.byNumber.get(id)).filter(Boolean);
    if (!query) return {state: 'unknown', suggestions: []};
    if (NEVER_AUTO.has(query)) return selection(fromIds(index.ambiguous.get(query) || []), 'ambiguous_alias', true);
    const exact = index.courses.filter(c => c.normalizedName === query);
    if (exact.length) return selection(exact, 'official_name');
    // Complete query tokens only: a short fragment must not silently select a longer word.
    const tokens = query.split(' ');
    const partial = query.length >= 3 ? index.courses.filter(c => {
      const words = c.normalizedName.split(/[\s()[\]{}]+/);
      return tokens.every(token => words.includes(token));
    }) : [];
    if (partial.length) return selection(partial, 'official_tokens');
    if (index.ambiguous.has(query)) return selection(fromIds(index.ambiguous.get(query)), 'ambiguous_alias', true);
    if (!index.blocked.has(query) && index.aliases.has(query)) return selection(fromIds(index.aliases.get(query)), 'approved_alias');
    if (index.blocked.has(query)) return {state: 'unknown', suggestions: [], reviewRequired: true};
    // Only literal official-name fragments; no edit distance, token deletion or symbol folding.
    const suggestions = query.length >= 3 ? index.courses.filter(c => c.normalizedName.includes(query)).slice(0, 12) : [];
    return {state: 'unknown', suggestions};
  }

  function historicalHint(course) {
    if (!course || !['medium', 'high'].includes(course.termConfidence)) return '';
    const labels = {primarily_fall: 'الفصل الأول', primarily_spring: 'الفصل الثاني', primarily_summer: 'الفصول الصيفية', regular_both_semesters: 'الفصلين الأول والثاني'};
    const label = labels[course.termPattern];
    return label ? `تاريخيًا، تُطرح غالبًا في ${label}؛ هذا ليس ضمانًا للطرح القادم.` : '';
  }

  function liveState(course, rows) {
    return rows.length ? 'offered' : course ? 'known_not_offered' : 'unknown';
  }

  const api = {normalize, createIndex, resolve, historicalHint, liveState};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HUSmartSearch = api;
})(globalThis);
