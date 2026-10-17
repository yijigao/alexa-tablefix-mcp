/*
 * Messy-text → table structure detection.
 * Runs identically in the browser (window.MessyDetect) and in Node (module.exports).
 *
 * Strategy:
 *  1. Rule-based delimiter scoring (tab, comma, semicolon, pipe, 2+ spaces).
 *  2. Column-count consistency check across non-empty lines.
 *  3. Rows whose column count deviates from the mode are flagged "suspect"
 *     (rendered yellow in the preview) instead of being silently dropped.
 *  4. LLM fallback: optional. If `options.llmEndpoint` is configured, ambiguous
 *     inputs are sent there for a second opinion. In the validation build it is
 *     NOT configured (documented, no key, no cost), so the UI falls back to
 *     "auto-detect uncertain — review flagged rows or request manual cleanup".
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.MessyDetect = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  var CANDIDATES = [
    { name: "tab",            re: /\t/ },
    { name: "comma",          re: /,/ },
    { name: "semicolon",      re: /;/ },
    { name: "pipe",           re: /\|/ },
    { name: "multi-space",    re: / {2,}|\u3000/ }
  ];

  function splitBy(line, name) {
    switch (name) {
      case "tab":         return line.split("\t");
      case "comma":       return splitCsv(line, ",");
      case "semicolon":   return splitCsv(line, ";");
      case "pipe":        return line.split("|");
      case "multi-space": return line.split(/ {2,}|\u3000/).filter(function (c) { return c !== ""; });
      default:            return [line];
    }
  }

  // Minimal CSV-aware splitter (handles quoted fields).
  function splitCsv(line, delim) {
    var out = [], cur = "", inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) {
        out.push(cur); cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function mode(arr) {
    var counts = {}, best = arr[0], bestN = 0;
    arr.forEach(function (v) {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > bestN) { bestN = counts[v]; best = v; }
    });
    return { value: best, count: bestN };
  }

  function scoreDelimiter(lines, name) {
    var colCounts = lines.map(function (ln) { return splitBy(ln, name).length; });
    var m = mode(colCounts);
    // Score: fraction of lines matching the modal column count, weighted by
    // absolute column count (a 4-col structure beats a 1-col "structure").
    var consistency = m.count / lines.length;
    return { name: name, score: consistency * Math.min(m.value, 8) / 8 + (m.value > 1 ? 0.15 : 0),
             columns: m.value, colCounts: colCounts };
  }

  function detect(rawText) {
    var lines = rawText.split(/\r?\n/)
      .map(function (l) { return l.replace(/\s+$/, ""); })
      .filter(function (l) { return l.trim().length > 0; });

    if (lines.length === 0) {
      return { ok: false, reason: "empty", lines: [], columns: 0, delimiter: null, suspectRows: [] };
    }

    var scored = CANDIDATES.map(function (c) { return scoreDelimiter(lines, c.name); })
      .sort(function (a, b) { return b.score - a.score; });
    var best = scored[0];

    // Uncertain when even the best delimiter barely structures anything.
    var confident = best.score >= 0.35 && best.columns > 1;

    var rows = lines.map(function (ln, idx) {
      var cells = splitBy(ln, best.name).map(function (c) { return c.trim(); });
      return { index: idx, cells: cells, suspect: confident && cells.length !== best.columns };
    });

    var suspectRows = rows.filter(function (r) { return r.suspect; }).map(function (r) { return r.index; });

    return {
      ok: true,
      confident: confident,
      delimiter: best.name,
      columns: confident ? best.columns : 0,
      lines: lines,
      rows: rows,
      suspectRows: suspectRows,
      scores: scored.map(function (s) { return { delimiter: s.name, score: +s.score.toFixed(3), columns: s.columns }; })
    };
  }

  /*
   * LLM fallback (optional, NOT wired in the validation build).
   * Configure via options.llmEndpoint = { url, apiKey } to POST
   * { text } and receive { rows: string[][] }. Returns a Promise that
   * resolves to null when unconfigured or on any error, so the caller
   * always falls back to rule-based results + manual review.
   */
  function llmFallback(rawText, options) {
    options = options || {};
    if (!options.llmEndpoint || !options.llmEndpoint.url) {
      return Promise.resolve(null); // not configured: documented no-op
    }
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    var headers = { "Content-Type": "application/json" };
    if (options.llmEndpoint.apiKey) headers["Authorization"] = "Bearer " + options.llmEndpoint.apiKey;
    return fetch(options.llmEndpoint.url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ text: rawText.slice(0, 20000) }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && Array.isArray(j.rows)) return { rows: j.rows, via: "llm" };
        return null;
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  return { detect: detect, llmFallback: llmFallback, _splitBy: splitBy };
});
