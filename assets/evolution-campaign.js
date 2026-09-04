(function () {
  'use strict';
  function init(root) {
    if (!root || root.dataset.ecReady) return;
    root.dataset.ecReady = 'true';
    var sticky = root.querySelector('[data-ec-sticky]');
    var inline = root.querySelectorAll('[data-ec-main-cta], [data-ec-inline-cta], .shopify-payment-button');
    var visible = new Map();
    if (sticky && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { visible.set(entry.target, entry.isIntersecting); });
        sticky.hidden = Array.from(visible.values()).some(Boolean);
      }, { rootMargin: '-56px 0px -82px 0px', threshold: 0 });
      inline.forEach(function (button) { observer.observe(button); });
      root._ecObserver = observer;
    }
    var form = root.querySelector('.ec-product-form');
    if (form) {
      var allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'adset_id', 'campaign_id', 'placement'];
      var params = new URLSearchParams(window.location.search);
      allowed.forEach(function (key) {
        var value = params.get(key);
        if (!value) return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'properties[_zk_' + key + ']';
        input.value = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240);
        form.appendChild(input);
      });
      var submitted = false;
      form.addEventListener('submit', function (event) {
        if (root.dataset.preview === 'true') {
          event.preventDefault();
          var note = document.querySelector('[data-ec-preview-status]');
          if (note) { note.hidden = false; note.textContent = 'Review preview only — no cart or checkout was submitted.'; }
          return;
        }
        if (submitted) { event.preventDefault(); return; }
        submitted = true;
        /* Native Shopify product POST preserves a no-JavaScript purchase path.
           No custom Meta events are fired: the configured pixel owns tracking. */
      });
      window.addEventListener('pageshow', function () { submitted = false; });
    }
    var dialog = root.querySelector('[data-ec-lightbox]');
    if (dialog && typeof dialog.showModal === 'function') {
      root.querySelectorAll('[data-ec-zoom]').forEach(function (button) {
        button.addEventListener('click', function () {
          var photo = dialog.querySelector('img');
          photo.src = button.dataset.ecZoom;
          photo.alt = button.querySelector('img').alt;
          dialog.showModal();
        });
      });
      dialog.querySelector('[data-ec-close]').addEventListener('click', function () { dialog.close(); });
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    }
  }
  function boot() { document.querySelectorAll('[data-ec-page]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('shopify:section:load', boot);
  document.addEventListener('shopify:section:unload', function (event) {
    var root = event.target.querySelector('[data-ec-page]');
    if (root && root._ecObserver) root._ecObserver.disconnect();
  });
})();
