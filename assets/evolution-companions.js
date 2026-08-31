(function () {
  'use strict';

  function initEvolutionCompanions(root) {
    if (!root || root.dataset.evoPlushInitialized === 'true') return;
    root.dataset.evoPlushInitialized = 'true';

    var mainImage = root.querySelector('[data-evo-plush-main-image]');
    var thumbs = root.querySelectorAll('[data-evo-plush-thumb]');

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        if (!mainImage || thumb.classList.contains('is-active')) return;

        thumbs.forEach(function (item) {
          item.classList.remove('is-active');
          item.setAttribute('aria-current', 'false');
        });
        thumb.classList.add('is-active');
        thumb.setAttribute('aria-current', 'true');

        mainImage.classList.add('is-changing');
        window.setTimeout(function () {
          mainImage.src = thumb.dataset.fullSrc;
          mainImage.srcset = thumb.dataset.fullSrcset || '';
          mainImage.alt = thumb.dataset.alt || '';
          mainImage.classList.remove('is-changing');
        }, 100);
      });
    });

    var mainButton = root.querySelector('[data-add-to-cart]');
    var sticky = root.querySelector('[data-evo-plush-sticky]');
    var stickyButton = root.querySelector('[data-evo-plush-sticky-add]');

    if (stickyButton && mainButton) {
      stickyButton.addEventListener('click', function () {
        mainButton.click();
      });
    }

    if (sticky && mainButton && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        var show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', show);
        sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
      }, { threshold: 0 });
      observer.observe(mainButton);
    }
  }

  function boot() {
    document.querySelectorAll('[data-evo-plush-page]').forEach(initEvolutionCompanions);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initEvolutionCompanions(event.target.querySelector('[data-evo-plush-page]'));
  });
})();
