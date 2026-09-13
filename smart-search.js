"use strict";

(function (root) {
  function normalize(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
      .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/ة(?=$|[^\p{L}\p{M}])/gu, 'ه')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const NEVER_AUTO = new Set(['java', 'جافا', 'c++', 'ai', 'ros']);
  function createIndex(data) {
    if (data.schemaVersion !== 1 || !Array.isArray(data.courses)) throw new Error('Invalid search catalog');
    const courses = data.courses.map(course => ({...course, faculties: (course.facultyIds || []).map(id=>data.faculties?.[id]).filter(Boolean), normalizedName: normalize(course.officialName)}));
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
    const terms = data.searchTermsV2?.terms || [];
    if (data.searchTermsV2 && data.searchTermsV2.schemaVersion !== 2) throw new Error('Invalid V2 term schema');
    const termMap = new Map();
    for (const entry of terms) {
      if (!['EXACT_ALIAS','SEARCH_TAG','REJECT'].includes(entry.termType) || typeof entry.autoResolve !== 'boolean' || !Array.isArray(entry.courseNumbers) || !entry.courseNumbers.length || entry.courseNumbers.some(id=>!byNumber.has(id))) throw new Error('Invalid V2 search term');
      const key = normalize(entry.term);
      const group = termMap.get(key) || [];
      group.push({...entry,term:key,tokens:termTokens(key)}); termMap.set(key,group);
    }
    for (const group of termMap.values()) {
      if (group.some(e=>e.autoResolve) && (group.some(e=>e.termType!=='EXACT_ALIAS'||!e.autoResolve) || new Set(group.flatMap(e=>e.courseNumbers)).size!==1)) throw new Error('Unsafe V2 automatic alias');
    }
    return {courses, byNumber, aliases, ambiguous, blocked, termMap,termCache:new Map()};
  }

  function termTokens(value) {
    return normalize(value).replace(/\b(?:labs?|laboratory)\b|(?:مختبر|لاب)(?=$|\s)/g,'lab').split(/\s+/);
  }

  function v2Matches(index, query) {
    if (!index.termCache.has(query)) index.termCache.set(query,computeV2Matches(index,query));
    return index.termCache.get(query);
  }

  function computeV2Matches(index, query) {
    const direct = index.termMap.get(query) || [];
    if (direct.some(e=>e.termType==='REJECT')) return {rejected:true,entries:[]};
    const exact = direct.filter(e=>e.termType==='EXACT_ALIAS');
    if (exact.length) return {entries:exact,match:'exact_alias',autoResolve:exact.every(e=>e.autoResolve)};
    const tokens = termTokens(query);
    const related = [...index.termMap.values()].flat().filter(e=>e.termType!=='REJECT' && tokens.every(t=>e.tokens.includes(t)));
    // Exact technology tags keep their audited component identities. Broad stems
    // extend to qualified terms (Cloud Security, Java 1, etc.), always as tags.
    const tags = direct.filter(e=>e.termType==='SEARCH_TAG');
    const qualified = related.filter(e=>!tags.length || !tokens.some(t=>/\d/.test(t)) && !['c++','cpp','سي++','سي بلس بلس'].includes(query));
    const entries = [...new Set([...tags,...qualified])];
    return {entries,match:'search_tag',autoResolve:false};
  }

  function candidateRank(index, input, candidate) {
    if (candidate.officialName === String(input).trim()) return 2;
    const query = normalize(input);
    if (normalize(candidate.officialName) === query) return 3;
    const terms = v2Matches(index,query);
    if (terms.entries.some(e=>e.courseNumbers.includes(candidate.courseNumber))) return terms.match==='exact_alias'?(terms.autoResolve?4:5):6;
    return index.byNumber.has(candidate.courseNumber) && normalize(candidate.officialName).includes(query) ? 7 : 8;
  }

  function resolve(index, input) {
    const query = normalize(input);
    if (/^\d{6,}$/.test(query)) return {state: 'resolved', courseNumber: query, course: index.byNumber.get(query), match: 'number'};
    const selection = (courses, match, force = false) => courses.length === 1 && !force
      ? {state: 'resolved', courseNumber: courses[0].courseNumber, course: courses[0], match}
      : {state: 'ambiguous', candidates: courses, match};
    const fromIds = ids => ids.map(id => index.byNumber.get(id)).filter(Boolean);
    if (!query) return {state: 'unknown', suggestions: []};
    const v2 = v2Matches(index,query);
    if (v2.rejected) return {state:'unknown',suggestions:[],reviewRequired:true,rejected:true};
    const requiresTermChoice = (index.termMap.get(query) || []).some(e=>!e.autoResolve);
    const literal = index.courses.filter(c=>c.officialName===String(input).trim());
    if (literal.length && !requiresTermChoice) return selection(literal,'official_name');
    const exact = index.courses.filter(c => c.normalizedName === query);
    if (exact.length && !requiresTermChoice) return selection(exact, 'official_name');
    if (v2.entries.length) {
      const ids = [...new Set(v2.entries.flatMap(e=>e.courseNumbers))];
      if (!v2.autoResolve) ids.push(...exact.map(c=>c.courseNumber));
      // Preserve university-wide collision evidence for broad tags such as ROS.
      const collisionKey = query === 'روس' ? 'ros' : query;
      if (!v2.autoResolve && v2.match==='search_tag' && index.ambiguous.has(collisionKey)) ids.push(...index.ambiguous.get(collisionKey));
      if (!v2.autoResolve && query.length>=3) ids.push(...index.courses.filter(c=>query.split(' ').every(t=>c.normalizedName.split(/[\s()[\]{}]+/).includes(t))).map(c=>c.courseNumber));
      const result = selection(fromIds([...new Set(ids)]),v2.match,!v2.autoResolve);
      result.requiresChoice = !v2.autoResolve;
      return result;
    }
    if (NEVER_AUTO.has(query)) return selection(fromIds(index.ambiguous.get(query) || []), 'ambiguous_alias', true);
    if (!index.blocked.has(query) && index.aliases.has(query)) return selection(fromIds(index.aliases.get(query)), 'approved_alias');
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

  const api = {normalize, createIndex, resolve, historicalHint, liveState, candidateRank};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HUSmartSearch = api;
})(globalThis);
