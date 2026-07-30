/*
  PhysioNutra festive header decoration
  ----------------------------------------
  Auto-shows a themed decoration strip during festival/occasion windows,
  and removes itself automatically once the window ends. Supports:
  Independence Day, Republic Day, Raksha Bandhan, Dussehra, Diwali,
  Christmas/New Year, Holi, and Guru Purnima.

  No manual add/remove needed each year — just update FESTIVAL_DATES
  below once a year (most of these shift on the lunar calendar; only
  Independence Day and Republic Day are fixed).

  MANUAL OVERRIDE (for testing or early/late activation):
    - URL:  yoursite.com/?festival=diwali      (forces Diwali on)
            yoursite.com/?festival=independence (forces tricolor on)
            yoursite.com/?festival=none         (forces everything off)
    - Or set FORCE_FESTIVAL below permanently (leave null for auto).
*/

(function () {
  "use strict";

  // ── 1. Update these once a year ── (Diwali/Holi/Dussehra/Rakhi/Guru Purnima shift dates
  // on the lunar calendar; Independence Day & Republic Day are fixed). Each festival can hold
  // a single {start,end} range OR an array of ranges — an array is handy for keeping this
  // year's AND next year's window both defined ahead of time, so nothing breaks if you forget
  // to update it right on the boundary. Old/past ranges are harmless and can be pruned anytime.
  var FESTIVAL_DATES = {
    guruPurnima: [
      { start: "2026-07-29", end: "2026-07-30" }, // Guru Purnima 2026 = Wed, 29 Jul 2026
      { start: "2027-07-17", end: "2027-07-18" }  // Guru Purnima 2027 = Sun, 18 Jul 2027
    ],
    independence: { start: "2026-08-14", end: "2026-08-16" },
    rakhi:        { start: "2026-08-27", end: "2026-08-28" },
    dussehra:     { start: "2026-10-19", end: "2026-10-21" },
    diwali:       { start: "2026-11-05", end: "2026-11-12" },
    christmas:    { start: "2026-12-20", end: "2027-01-02" },
    republic:     { start: "2027-01-25", end: "2027-01-27" },
    holi:         { start: "2027-03-01", end: "2027-03-04" }
  };

  // Some festivals share the same visual theme (Independence Day and
  // Republic Day both use the tricolor bunting look).
  var THEME_MAP = {
    independence: "tricolor",
    republic: "tricolor",
    rakhi: "rakhi",
    dussehra: "dussehra",
    diwali: "diwali",
    christmas: "christmas",
    holi: "holi",
    guruPurnima: "guru-purnima"
  };

  // ── 2. Permanent manual override (null = auto by date) ──
  var FORCE_FESTIVAL = null; // e.g. "diwali", "christmas", "holi", or "none"

  function getUrlOverride() {
    var params = new URLSearchParams(window.location.search);
    return params.get("festival"); // null if not present
  }

  function isDateInRange(today, range) {
    return today >= range.start && today <= range.end;
  }

  function activeFestivalByDate() {
    var today = new Date().toISOString().slice(0, 10);
    for (var name in FESTIVAL_DATES) {
      var entry = FESTIVAL_DATES[name];
      var ranges = Array.isArray(entry) ? entry : [entry];
      for (var i = 0; i < ranges.length; i++) {
        if (isDateInRange(today, ranges[i])) return name;
      }
    }
    return null;
  }

  function resolveFestival() {
    var urlOverride = getUrlOverride();
    if (urlOverride) return urlOverride === "none" ? null : urlOverride;
    if (FORCE_FESTIVAL) return FORCE_FESTIVAL === "none" ? null : FORCE_FESTIVAL;
    return activeFestivalByDate();
  }

  function renderStrip(festival) {
    var theme = THEME_MAP[festival] || festival;
    var strip = document.createElement("div");
    strip.className = "festive-strip";
    strip.setAttribute("aria-hidden", "true"); // decorative only
    for (var i = 0; i < 14; i++) {
      var bulb = document.createElement("span");
      bulb.className = "bulb";
      strip.appendChild(bulb);
    }
    document.body.classList.add("festival-" + theme);
    document.body.insertBefore(strip, document.body.firstChild);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var festival = resolveFestival();
    if (festival) renderStrip(festival);
  });
})();
