(function () {
  'use strict';

  var STORAGE_KEY = 'bibleEditorAppearance';

  var FONT_STACKS = {
    reading: '"Literata", Georgia, "Times New Roman", serif',
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    arial: 'Arial, Helvetica, sans-serif',
    times: '"Times New Roman", Times, serif',
    verdana: 'Verdana, Geneva, sans-serif'
  };

  var defaults = {
    fontFamily: 'reading',
    fontSize: 17,
    lineHeight: 1.6,
    noWrap: false
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, defaults);
      var parsed = JSON.parse(raw);
      return Object.assign({}, defaults, parsed);
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  function save(settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function apply(settings) {
    var root = document.documentElement;
    root.style.setProperty('--editor-font-family', FONT_STACKS[settings.fontFamily] || FONT_STACKS.system);
    root.style.setProperty('--editor-font-size', settings.fontSize + 'px');
    root.style.setProperty('--editor-line-height', String(settings.lineHeight));

    ['typingArea', 'fileEditor'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.classList.toggle('no-wrap', !!settings.noWrap);
    });
  }

  function init() {
    els.fontFamily = $('editorFontFamily');
    els.fontSize = $('editorFontSize');
    els.fontSizeValue = $('editorFontSizeValue');
    els.lineHeight = $('editorLineHeight');
    els.lineHeightValue = $('editorLineHeightValue');
    els.noWrap = $('editorNoWrap');

    var settings = load();
    els.fontFamily.value = settings.fontFamily;
    els.fontSize.value = String(settings.fontSize);
    els.fontSizeValue.textContent = settings.fontSize + 'px';
    els.lineHeight.value = String(settings.lineHeight);
    els.lineHeightValue.textContent = String(settings.lineHeight);
    els.noWrap.checked = settings.noWrap;
    apply(settings);

    function update() {
      var next = {
        fontFamily: els.fontFamily.value,
        fontSize: Number(els.fontSize.value),
        lineHeight: Number(els.lineHeight.value),
        noWrap: els.noWrap.checked
      };
      els.fontSizeValue.textContent = next.fontSize + 'px';
      els.lineHeightValue.textContent = String(next.lineHeight);
      apply(next);
      save(next);
    }

    els.fontFamily.addEventListener('change', update);
    els.fontSize.addEventListener('input', update);
    els.lineHeight.addEventListener('input', update);
    els.noWrap.addEventListener('change', update);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
