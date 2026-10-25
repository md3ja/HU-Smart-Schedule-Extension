"use strict";

(function (root) {
  // Stage 1 only: accepts decoded cell text, never parses or changes days,
  // times, delivery classification, or existing meeting objects.
  // Evidence: research/room-location-audit/{abbreviations_evidence.md,
  // abbreviations_catalog.csv,detailed_catalog.json} (2026-10-14).
  const BUILDINGS = [
    'مجمع قاعات ابن خلدون', 'مجمع قاعات ابن رشد',
    'مبنى الحسين الباني', 'مبنى الحارث الرابع', 'مبنى الهندسة',
    'مبنى تكنولوجيا المعلومات', 'مبنى كلية الملكة رانيا للطفولة',
    'مبنى كلية العلوم الصيدلانية', 'مبنى العلوم الطبية المساندة',
    'مبنى الاقتصاد', 'مبنى الاحياء', 'مبنى الكيمياء', 'مبنى التمريض',
    'مبنى الفيزباء', 'مبنى الفيزياء', 'مبنى الرياضيات', 'مبنى الجيولوجيا',
    'مبنى النشاط الرياضي', 'مبنى الرياضة', 'صالة كلية التربية الرياضية',
    'مختبرات الانترنت'
  ].sort((a, b) => b.length - a.length);

  const DIGITS = '[0-9٠-٩۰-۹]';
  // Anchored whole-room patterns: never accept a code hidden in unknown prose.
  // No building is inferred from a room abbreviation alone.
  const ROOM_PATTERNS = [
    `م\\.\\s*[غش]\\s*${DIGITS}{3}`,
    `ح\\.[بر]\\s*${DIGITS}{3}`,
    `هـ?\\s*${DIGITS}{4}`,
    `(?:مختبر\\s+)?[حكفرع]\\s*${DIGITS}{3}`,
    `ق\\s*${DIGITS}{3}`,
    `تك\\s*${DIGITS}{3}`,
    `م[.0٠]\\s*تك\\s*\\(${DIGITS}{3}\\)`,
    `(?:ع\\s+ط|ت\\s+م|صيدلة|طفولة)\\s*${DIGITS}{3}`,
    `م\\.\\s*ر\\s*${DIGITS}{3}`,
    `(?:مشغل|مرسم)\\s+${DIGITS}{3}(?:\\s+[أاب])?`,
    `م\\.يدوي\\s*${DIGITS}{4}`,
    `ض\\s*${DIGITS}{3}`,
    `ص\\.ك\\.ر\\s*${DIGITS}{3}`,
    `م\\.شرقي\\(${DIGITS}\\)?`,
    `م\\.ش\\s+مدرج\\)${DIGITS}`,
    'م\\.الحارث', 'م\\.\\s*تربية',
    `م\\.\\s*طفولة(?:\\s+${DIGITS})?`,
    'مدرج\\s+(?:ع\\s+ط|تمريض)',
    'مختبر\\s+(?:gis|يدوي)', 'ق\\.\\s*مختبر'
  ].map(pattern => new RegExp(`^(?:${pattern})$`, 'iu'));

  function clean(value) {
    return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /** Split decoded university cell text; results retain source spelling/spacing. */
  function splitMeetingChunks(text) {
    if (text == null) return [];
    if (typeof text !== 'string') throw new TypeError('Expected decoded meeting text');
    return text.split(/\*{2,}|\/{2,}|\r\n|[\n\r]/).map(chunk => chunk.trim()).filter(Boolean);
  }

  /**
   * Parse ONE chunk into five enumerable location fields.
   * rawLocation is the verbatim trimmed suffix after the location preposition
   * (including any trailing platform segment), or the location-only input.
   * Source typos/codes are preserved; display normalization belongs to a later
   * stage. Unknown tails are unrecognized even when a building is identified.
   * Both documented platforms are returned as 'Microsoft Teams, Moodle'.
   */
  function parseMeetingLocation(chunk) {
    if (chunk == null) chunk = '';
    if (typeof chunk !== 'string') throw new TypeError('Expected one decoded meeting chunk');
    if (splitMeetingChunks(chunk).length > 1) {
      throw new RangeError('Use parseMeetingLocations for multiple meeting chunks');
    }
    const source = chunk.trim();
    const inMatch = /(?:^|\s)في(?=\s|\/|$)/u.exec(source);
    const slash = source.indexOf('/');
    let rawLocation;
    if (inMatch) rawLocation = source.slice(inMatch.index + inMatch[0].length).trim();
    else if (slash >= 0 && /تدرس|[0-9٠-٩۰-۹]\s*[,.:،][0-9٠-٩۰-۹]{2}/u.test(source.slice(0, slash))) rawLocation = source.slice(slash + 1).trim();
    else rawLocation = source;

    const timingOnly = /^[\d٠-٩۰-۹\s:,.،\-–—()حثرخنسجمصap]+$/iu;
    if (!inMatch && slash < 0 && /[\-–—]/u.test(source) && timingOnly.test(clean(source))) rawLocation = '';
    // Delivery wording is not itself an unknown room.
    if (/^(?:(?:المادة\s+)?تدرس\s+)?(?:وجاهي(?:ا)?|عن\s+بعد|(?:بشكل\s+)?مدمج)$/u.test(clean(rawLocation))) rawLocation = '';

    const platforms = [];
    const locationText = clean(rawLocation);
    if (/\bteams\b|مايكروسوفت\s+تيمز/iu.test(locationText)) platforms.push('Microsoft Teams');
    if (/\bmoodle\b|مودال|مودل/iu.test(locationText)) platforms.push('Moodle');
    const onlinePlatform = platforms.length ? platforms.join(', ') : null;
    const result = {building: null, room: null, rawLocation, onlinePlatform, locationStatus: 'tbd'};

    // Remove ONLY explicit online segments from physical-location parsing.
    // Keep the entire suffix untouched in rawLocation, including unknown text.
    const segments = rawLocation.split('/').map(segment => clean(segment)
      .replace(/^(?:(?:المادة\s+)?تدرس\s+)?(?:عن\s+بعد|وجاهي(?:ا)?|بشكل\s+مدمج|مدمج)(?:\s+|$)/u, '').trim()).filter(Boolean);
    const platformSegment = /^(?:(?:على\s+)?منصة\s*\(?[^()]*\)?|(?:(?:مايكروسوفت|microsoft)\s+)?teams(?:\s*[,،]\s*(?:moodle|مودال|مودل))?|moodle|مودال|مودل)$/iu;
    const physicalSegments = segments.filter(segment => !platformSegment.test(segment));
    const physical = physicalSegments[0] || '';
    const building = BUILDINGS.find(name => physical === name || physical.startsWith(name + ' '));
    const roomText = building ? physical.slice(building.length).trim() : physical;
    if (building) result.building = building;
    if (roomText && ROOM_PATTERNS.some(pattern => pattern.test(roomText))) result.room = roomText;

    if (result.room) result.locationStatus = building ? 'assigned' : 'room_only';
    else if (building) result.locationStatus = roomText ? 'unrecognized' : 'building_only';
    else if (physical && !/^(?:عن\s+بعد|أونلاين|اونلاين|online|remote)$/iu.test(physical)) result.locationStatus = 'unrecognized';
    else if (onlinePlatform) result.locationStatus = 'remote_platform';
    else if (/تدرس\s+عن\s+بعد|أونلاين|اونلاين|\bonline\b|\bremote\b|(?:على\s+)?منصة/iu.test(source)) result.locationStatus = 'remote_no_platform';

    if (physicalSegments.length > 1) result.locationStatus = 'unrecognized';
    return result;
  }

  /** One record per source chunk, in order; no expansion/deduplication of days. */
  function parseMeetingLocations(text) {
    return splitMeetingChunks(text).map(chunk => ({chunk, ...parseMeetingLocation(chunk)}));
  }

  const api = {splitMeetingChunks, parseMeetingLocation, parseMeetingLocations};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HURoomLocationParser = api;
})(globalThis);
