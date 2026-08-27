(function () {
  function initEvolutionPinPage(root) {
    if (!root || root.dataset.evoInitialized === 'true') return;
    root.dataset.evoInitialized = 'true';

    var mainImage = root.querySelector('[data-evo-main-image]');
    var thumbs = root.querySelectorAll('[data-evo-thumb]');

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
        }, 90);
      });
    });

    var mainButton = root.querySelector('[data-add-to-cart]');
    var sticky = root.querySelector('[data-evo-sticky]');
    var stickyButton = root.querySelector('[data-evo-sticky-add]');

    if (stickyButton && mainButton) {
      stickyButton.addEventListener('click', function () {
        var liveButton = root.querySelector('[data-add-to-cart]');
        if (liveButton) liveButton.click();
      });
    }

    if (sticky && mainButton && 'IntersectionObserver' in window) {
      var setStickyVisibility = function (shouldShow) {
        sticky.classList.toggle('is-visible', shouldShow);
        sticky.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      };

      var updateStickyFromLiveButton = function () {
        var liveButton = root.querySelector('[data-add-to-cart]');
        if (!liveButton) return;
        setStickyVisibility(liveButton.getBoundingClientRect().bottom < 0);
      };

      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        var shouldShow = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setStickyVisibility(shouldShow);
      }, { threshold: 0 });
      observer.observe(mainButton);

      window.addEventListener('scroll', updateStickyFromLiveButton, { passive: true });
      window.addEventListener('resize', updateStickyFromLiveButton);
      window.requestAnimationFrame(updateStickyFromLiveButton);
    }
  }

  function boot() {
    document.querySelectorAll('[data-evolution-pin-page]').forEach(initEvolutionPinPage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initEvolutionPinPage(event.target.querySelector('[data-evolution-pin-page]'));
  });
})();
