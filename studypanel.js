// Builds the study panel's sections for one verse and hands them to
// EastonPopup. Shared by the single-verse tab (app.js) and the .md tab
// (fileapp.js), which used to carry two copies of this list.
//
// Two things keep it cheap:
//  - Resources whose data has not been loaded yet show up as "pending" tabs;
//    opening one loads its data (dataloader.js) and the panel re-renders.
//  - show() remembers the last verse it rendered. The .md editor calls it on
//    every keystroke; recomputing every dictionary and rebuilding the panel's
//    HTML each time was the main per-keystroke cost.
window.StudyPanel = (function () {
  'use strict';

  var DL = window.DataLoader;

  // group: DataLoader group(s) the section needs (null = always available);
  // compute(ctx) returns the entries once the group is loaded.
  var SECTIONS = [
    {
      id: 'easton', title: "Easton's Bible Dictionary", shortTitle: 'Dicionário', icon: 'book', open: true,
      group: function (ctx) { return ctx.isPt ? null : 'easton_en'; },
      compute: function (ctx) {
        var lookup = ctx.isPt ? window.EastonLookupPt : window.EastonLookup;
        return (lookup && lookup.hasAny) ? lookup.computeDefinitions(ctx.words) : [];
      }
    },
    {
      id: 'smith', title: "Smith's Bible Dictionary", shortTitle: 'Smith', icon: 'journal-text', translatable: true,
      group: 'smith',
      compute: function (ctx) { return window.SmithLookup ? window.SmithLookup.forVerse(ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    },
    extra('cbc', 'Condensed Biblical Cyclopedia', 'CBC', 'journal-bookmark'),
    extra('isbe', 'International Standard Bible Encyclopedia', 'ISBE', 'bank'),
    extra('webster1828', "Webster's Dictionary 1828", 'Webster 1828', 'spellcheck'),
    extra('webster1913', "Webster's Dictionary 1913", 'Webster 1913', 'spellcheck'),
    {
      id: 'ptdict', title: 'Dicionário da Língua Portuguesa', shortTitle: 'Português', icon: 'translate',
      only: function (ctx) { return ctx.isPt; },
      group: 'ptdict',
      compute: function (ctx) { return (window.PtDictLookup && window.PtDictLookup.hasAny) ? window.PtDictLookup.computeDefinitions(ctx.words) : []; }
    },
    {
      id: 'bdb', title: 'Brown-Driver-Briggs Lexicon (hebraico)', shortTitle: 'Hebraico', icon: 'alphabet', translatable: true,
      group: 'hebrew',
      compute: function (ctx) { return window.BdbLookup ? window.BdbLookup.getEntries(ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    },
    {
      id: 'thayer', title: "Thayer's Greek Lexicon (grego)", shortTitle: 'Grego', icon: 'alphabet-uppercase', translatable: true,
      group: 'greek',
      compute: function (ctx) { return window.ThayerLookup ? window.ThayerLookup.getEntries(ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    },
    {
      id: 'tsk', title: 'Treasury of Scripture Knowledge (referências cruzadas)', shortTitle: 'Referências', icon: 'link-45deg',
      group: 'tsk',
      compute: function (ctx) { return window.TskLookup ? window.TskLookup.getEntries(ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    },
    topical('tcr', 'Thompson Chain Reference (tópicos em cadeia)', 'Thompson', 'diagram-3', 'TcrLookup'),
    topical('nave', "Nave's Topical Bible (índice temático)", 'Nave', 'tags', 'NaveLookup'),
    topical('torrey', "Torrey's New Topical Textbook (índice temático)", 'Torrey', 'bookmarks', 'TorreyLookup'),
    {
      id: 'concordance', title: 'Concordância de Strong (outras ocorrências)', shortTitle: 'Concordância', icon: 'search',
      concordanceMode: true,
      group: ['hebrew', 'greek'],
      compute: function (ctx) {
        if (!window.StrongConcordance) return [];
        var wordEntries = [];
        if (window.BdbLookup) wordEntries = wordEntries.concat(window.BdbLookup.getEntries(ctx.bookIdx, ctx.chapter, ctx.verse));
        if (window.ThayerLookup) wordEntries = wordEntries.concat(window.ThayerLookup.getEntries(ctx.bookIdx, ctx.chapter, ctx.verse));
        return window.StrongConcordance.getEntries(wordEntries, ctx.bookIdx, ctx.chapter, ctx.verse);
      }
    }
  ];

  function extra(id, title, shortTitle, icon) {
    return {
      id: id, title: title, shortTitle: shortTitle, icon: icon, translatable: true, group: id,
      compute: function (ctx) { return window.ExtraDicts ? window.ExtraDicts.forVerse(id, ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    };
  }

  function topical(id, title, shortTitle, icon, lookupName) {
    return {
      id: id, title: title, shortTitle: shortTitle, icon: icon, group: id,
      compute: function (ctx) { return window[lookupName] ? window[lookupName].getEntries(ctx.bookIdx, ctx.chapter, ctx.verse) : []; }
    };
  }

  function groupsOf(spec, ctx) {
    var g = typeof spec.group === 'function' ? spec.group(ctx) : spec.group;
    return g ? [].concat(g) : [];
  }

  function buildSections(ctx) {
    var sections = [];
    SECTIONS.forEach(function (spec) {
      if (spec.only && !spec.only(ctx)) return;
      var groups = groupsOf(spec, ctx);
      var missing = groups.filter(function (g) { return !DL.isLoaded(g); });
      var section = {
        id: spec.id, title: spec.title, shortTitle: spec.shortTitle, icon: spec.icon,
        openByDefault: !!spec.open, translatable: !!spec.translatable, concordanceMode: !!spec.concordanceMode,
        entries: []
      };
      if (missing.length) {
        section.pending = true;
        section.pendingMb = DL.sizeMb(missing);
        section.onActivate = function () { return DL.loadMany(missing); };
      } else {
        section.entries = spec.compute(ctx);
      }
      sections.push(section);
    });
    return sections;
  }

  var last = null;      // {ctx, key, sig}
  var dataVersion = 0;  // bumped whenever a data group finishes loading

  // `key` identifies the verse (same meaning as EastonPopup.show's key).
  function show(ctx, key) {
    if (!window.EastonPopup) return;
    var sig = key + '|' + (ctx.isPt ? 1 : 0) + '|' + dataVersion;
    if (last && last.sig === sig) return; // same verse, nothing new to show
    last = { ctx: ctx, key: key, sig: sig };
    window.EastonPopup.show(buildSections(ctx), key);
  }

  function hide() {
    last = null;
    if (window.EastonPopup) window.EastonPopup.hide();
  }

  document.addEventListener('dataloaded', function () {
    dataVersion++;
    if (last) show(last.ctx, last.key);
  });

  return { show: show, hide: hide };
})();
