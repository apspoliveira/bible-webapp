// Clickable scripture references. Turns references in the study panel
// (Thompson chains, TSK, Strong's concordance) into <a class="ref"> links.
// Hovering (mouse) or focusing a link previews the verse text in a small
// card; clicking pins the card and offers "practise this verse", which jumps
// the single-verse tab to it (BibleNav.goTo, see app.js).
// Verse text always comes from BIBLE_PT.
window.BibleRefs = (function () {
  'use strict';

  var MAX_CARD_VERSES = 8;

  // Abbreviations used by the Thompson data (plus a few of its variants).
  var ABBR = ['Ge', 'Ex', 'Le', 'Nu', 'De', 'Jos', 'Jud', 'Ru', '1Sa', '2Sa', '1Ki', '2Ki', '1Ch', '2Ch', 'Ezr', 'Ne',
    'Es', 'Job', 'Ps', 'Pr', 'Ec', 'So', 'Isa', 'Jer', 'La', 'Eze', 'Da', 'Ho', 'Joe', 'Am', 'Ob', 'Jon', 'Mic', 'Na',
    'Hab', 'Zep', 'Hag', 'Zec', 'Mal', 'Mt', 'Mr', 'Lu', 'Joh', 'Ac', 'Ro', '1Co', '2Co', 'Ga', 'Eph', 'Php', 'Col',
    '1Th', '2Th', '1Ti', '2Ti', 'Tit', 'Phm', 'Heb', 'Jas', '1Pe', '2Pe', '1Jo', '2Jo', '3Jo', 'Jude', 'Re'];
  var EXTRA = { gal: 'Ga', lam: 'La', dan: 'Da', he: 'Heb', mi: 'Mic' };
  // Full and common English names (ISBE, Smith, ... write "Gen 1:1", "1 Sam 3:4").
  var NAMES = {
    genesis: 0, gen: 0, exodus: 1, exod: 1, exo: 1, leviticus: 2, lev: 2, numbers: 3, num: 3, deuteronomy: 4, deut: 4,
    joshua: 5, josh: 5, judges: 6, judg: 6, ruth: 7, '1samuel': 8, '1sam': 8, '2samuel': 9, '2sam': 9,
    '1kings': 10, '1kgs': 10, '2kings': 11, '2kgs': 11, '1chronicles': 12, '1chron': 12, '2chronicles': 13,
    '2chron': 13, ezra: 14, nehemiah: 15, neh: 15, esther: 16, esth: 16, psalms: 18, psalm: 18, proverbs: 19,
    prov: 19, ecclesiastes: 20, eccl: 20, song: 21, isaiah: 22, jeremiah: 23, lamentations: 24, ezekiel: 25,
    ezek: 25, daniel: 26, hosea: 27, hos: 27, joel: 28, amos: 29, obadiah: 30, obad: 30, jonah: 31, micah: 32,
    nahum: 33, nah: 33, habakkuk: 34, zephaniah: 35, zeph: 35, haggai: 36, zechariah: 37, zech: 37, malachi: 38,
    matthew: 39, matt: 39, mark: 40, luke: 41, john: 42, acts: 43, romans: 44, rom: 44, '1corinthians': 45,
    '1cor': 45, '2corinthians': 46, '2cor': 46, galatians: 47, ephesians: 48, philippians: 49, phil: 49,
    colossians: 50, '1thessalonians': 51, '1thess': 51, '2thessalonians': 52, '2thess': 52, '1timothy': 53,
    '1tim': 53, '2timothy': 54, '2tim': 54, titus: 55, philemon: 56, philem: 56, hebrews: 57, james: 58,
    '1peter': 59, '1pet': 59, '2peter': 60, '2pet': 60, '1john': 61, '2john': 62, '3john': 63, revelation: 65,
    rev: 65
  };
  var BOOK_IDX = {};
  ABBR.forEach(function (a, i) { BOOK_IDX[a.toLowerCase()] = i; });
  Object.keys(EXTRA).forEach(function (k) { BOOK_IDX[k] = BOOK_IDX[EXTRA[k].toLowerCase()]; });
  Object.keys(NAMES).forEach(function (k) { BOOK_IDX[k] = NAMES[k]; });

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function book(bi) { return window.BIBLE_PT && window.BIBLE_PT[bi]; }
  function chapterCount(bi) { var b = book(bi); return b ? b.chapters.length : 0; }
  function verseCount(bi, ch) { var b = book(bi); var c = b && b.chapters[ch - 1]; return c ? c.length : 0; }

  // One link. `ve` (optional) is the last verse of a same-chapter range.
  function link(bi, ch, vs, ve, label, labelIsHtml) {
    if (!verseCount(bi, ch) || vs < 1 || vs > verseCount(bi, ch)) return labelIsHtml ? '' : esc(label);
    return '<a href="#" class="ref" data-ref="' + [bi, ch, vs, ve && ve > vs ? ve : vs].join('.') + '">' + (labelIsHtml ? label : esc(label)) + '</a>';
  }

  // Finds "Book C:V, V-V; C:V; Book C:V ..." sequences in plain text and
  // returns HTML with every recognised passage linked. Chapter context
  // carries across ";" and "," the way Thompson writes them ("Ex 4:14; 5:20").
  var SEQ = /\b((?:[1-3]\s?)?[A-Z][a-z]{1,13})\.?\s+(\d+(?:\s*[:,;\-–]\s*\d+(?!\d|\s?[A-Z][a-z])|\s*[:,;\-–])*)/g;
  function linkify(text) {
    var out = '', last = 0, m;
    SEQ.lastIndex = 0;
    while ((m = SEQ.exec(text))) {
      var bi = BOOK_IDX[m[1].toLowerCase().replace(/\s/g, '')];
      if (bi === undefined) continue;
      out += esc(text.slice(last, m.index));
      var head = text.slice(m.index, m.index + m[0].length - m[2].length);
      out += esc(head);
      var ch = null, single = chapterCount(bi) === 1, rest = m[2], pos = 0, pm;
      var PIECE = /(\d+)(?::(\d+))?(?:\s*[-–]\s*(?:(\d+):)?(\d+))?/g;
      while ((pm = PIECE.exec(rest))) {
        out += esc(rest.slice(pos, pm.index));
        var label = pm[0], c, vs, ve;
        if (pm[2]) { c = +pm[1]; vs = +pm[2]; ve = (pm[4] && !pm[3]) ? +pm[4] : vs; if (pm[3]) ve = vs; ch = c; }
        else if (ch !== null || single) { c = ch || 1; vs = +pm[1]; ve = pm[4] ? +pm[4] : vs; ch = c; }
        else { c = +pm[1]; vs = 1; ve = 1; ch = null; label = pm[0]; }
        out += link(bi, c, vs, ve, label);
        pos = pm.index + pm[0].length;
        if (PIECE.lastIndex === pm.index) PIECE.lastIndex++;
      }
      out += esc(rest.slice(pos));
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  // Text carrying exact links as [[book.chapter.vStart.vEnd|label]] markers
  // (Nave's Topical Bible, see build_topics.py): escape, then turn each
  // marker into a link.
  function renderMarked(text) {
    var out = '', last = 0, m, re = /\[\[(\d+)\.(\d+)\.(\d+)\.(\d+)\|([^\]]*)\]\]/g;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index)) + link(+m[1], +m[2], +m[3], +m[4], m[5]);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  // ---------- Hover / pinned card ----------

  var card, cardRef = null, pinned = false, hideTimer = null;

  function refTitle(r) {
    var b = book(r[0]);
    return (b ? b.name : '?') + ' ' + r[1] + ':' + r[2] + (r[3] > r[2] ? '-' + r[3] : '');
  }

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'refCard';
    card.className = 'ref-card d-none';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Pré-visualização do versículo');
    document.body.appendChild(card);
    card.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    card.addEventListener('mouseleave', function () { if (!pinned) scheduleHide(); });
    card.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'go' && window.BibleNav) window.BibleNav.goTo(cardRef[0], cardRef[1], cardRef[2]);
      close();
    });
    return card;
  }

  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(close, 200); }

  function close() {
    pinned = false; cardRef = null;
    if (card) card.classList.add('d-none');
  }

  function open(anchor, isPinned) {
    var r = anchor.dataset.ref.split('.').map(Number);
    ensureCard();
    clearTimeout(hideTimer);
    pinned = isPinned;
    cardRef = r;
    var parts = [];
    var end = Math.min(r[3], r[2] + MAX_CARD_VERSES - 1);
    for (var v = r[2]; v <= end; v++) {
      var b = book(r[0]);
      var t = b && b.chapters[r[1] - 1] && b.chapters[r[1] - 1][v - 1];
      if (t) parts.push('<p><sup>' + v + '</sup> ' + esc(t) + '</p>');
    }
    if (end < r[3]) parts.push('<p class="ref-card-more">…</p>');
    card.innerHTML = '<div class="ref-card-title">' + esc(refTitle(r)) + '</div>' + parts.join('') +
      (isPinned ? '<div class="ref-card-actions"><button type="button" class="btn btn-primary btn-sm" data-act="go">Praticar este versículo</button>' +
        '<button type="button" class="btn btn-outline-secondary btn-sm" data-act="close">Fechar</button></div>' : '');
    card.classList.remove('d-none');

    var rect = anchor.getBoundingClientRect();
    var w = card.offsetWidth, h = card.offsetHeight;
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    var top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  document.addEventListener('pointerover', function (e) {
    var a = e.target.closest && e.target.closest('a.ref');
    if (a && e.pointerType === 'mouse' && !pinned) open(a, false);
  });
  document.addEventListener('pointerout', function (e) {
    var a = e.target.closest && e.target.closest('a.ref');
    if (a && e.pointerType === 'mouse' && !pinned) scheduleHide();
  });
  document.addEventListener('focusin', function (e) {
    var a = e.target.closest && e.target.closest('a.ref');
    if (a && !pinned) open(a, false);
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.ref');
    if (a) { e.preventDefault(); open(a, true); return; }
    if (pinned && card && !card.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && card && !card.classList.contains('d-none')) close();
  });

  return { linkify: linkify, renderMarked: renderMarked, link: link };
})();
