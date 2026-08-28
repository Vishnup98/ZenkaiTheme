(function () {
  function initGymBadgeColorPage(root) {
    if (!root || root.dataset.gbColorInitialized === 'true') return;
    root.dataset.gbColorInitialized = 'true';

    var mainImage = root.querySelector('[data-gb-color-main-image]');
    var thumbs = root.querySelectorAll('[data-gb-color-thumb]');
    var variantButtons = root.querySelectorAll('[data-gb-color-variant]');
    var variantSelect = root.querySelector('[data-gb-color-select]');
    var price = root.querySelector('[data-gb-color-price]');
    var compare = root.querySelector('[data-gb-color-compare]');
    var priceNote = root.querySelector('[data-gb-color-price-note]');
    var submit = root.querySelector('[data-gb-color-submit]');
    var submitText = root.querySelector('[data-gb-color-submit-text]');
    var sticky = root.querySelector('[data-gb-color-sticky]');
    var stickyPrice = root.querySelector('[data-gb-color-sticky-price]');
    var stickyLabel = root.querySelector('[data-gb-color-sticky-label]');
    var stickyButton = root.querySelector('[data-gb-color-sticky-add]');
    var collectorButton = root.querySelector('[data-gb-color-variant][data-is-collector="true"]');
    var chooseCollectorButton = root.querySelector('[data-gb-color-choose-collector]');

    function setMainImage(source) {
      if (!mainImage || !source || !source.dataset.imageSrc) return;

      mainImage.classList.add('is-changing');
      window.setTimeout(function () {
        mainImage.src = source.dataset.imageSrc;
        mainImage.srcset = source.dataset.imageSrcset || '';
        mainImage.alt = source.dataset.imageAlt || '';
        mainImage.classList.remove('is-changing');
      }, 90);
    }

    function setActiveThumb(mediaId) {
      if (!mediaId) return;

      thumbs.forEach(function (thumb) {
        var isActive = thumb.dataset.mediaId === String(mediaId);
        thumb.classList.toggle('is-active', isActive);
        thumb.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }

    function updateUrl(variantId) {
      if (!window.history || !window.history.replaceState) return;

      try {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variantId);
        window.history.replaceState({}, '', url.toString());
      } catch (error) {
        return;
      }
    }

    function selectVariant(button, options) {
      if (!button || button.disabled) return;
      options = options || {};

      variantButtons.forEach(function (item) {
        var isSelected = item === button;
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      if (variantSelect) {
        variantSelect.value = button.dataset.variantId;
        variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      var isCollector = button.dataset.isCollector === 'true';
      var variantTitle = button.dataset.variantTitle || '';
      var variantPrice = button.dataset.price || '';
      var label = isCollector ? 'Add all 32' : 'Add ' + variantTitle;

      if (price) price.textContent = variantPrice;
      if (priceNote) priceNote.textContent = button.dataset.priceNote || '';

      if (compare) {
        compare.textContent = button.dataset.compare || '';
        compare.hidden = !button.dataset.compare;
      }

      if (submit) submit.disabled = button.disabled;
      if (submitText) submitText.textContent = label + ' — ' + variantPrice;
      if (stickyPrice) stickyPrice.textContent = variantPrice;
      if (stickyLabel) stickyLabel.textContent = isCollector ? 'Collector Pack · 32 badges' : variantTitle + ' · 8 badges';
      if (stickyButton) {
        stickyButton.textContent = label;
        stickyButton.disabled = button.disabled;
      }

      setMainImage(button);
      setActiveThumb(button.dataset.mediaId);

      if (options.updateUrl !== false) updateUrl(button.dataset.variantId);
    }

    variantButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        selectVariant(button);
      });
    });

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

    if (chooseCollectorButton && collectorButton) {
      chooseCollectorButton.addEventListener('click', function () {
        selectVariant(collectorButton);
        var offer = root.querySelector('.gb-color-offer');
        if (offer) offer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    if (stickyButton && submit) {
      stickyButton.addEventListener('click', function () {
        var liveSubmit = root.querySelector('[data-gb-color-submit]');
        if (liveSubmit) liveSubmit.click();
      });
    }

    if (sticky && submit && 'IntersectionObserver' in window) {
      var setStickyVisibility = function (shouldShow) {
        sticky.classList.toggle('is-visible', shouldShow);
        sticky.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      };

      var updateStickyFromSubmit = function () {
        var liveSubmit = root.querySelector('[data-gb-color-submit]');
        if (!liveSubmit) return;
        setStickyVisibility(liveSubmit.getBoundingClientRect().bottom < 0);
      };

      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        setStickyVisibility(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      }, { threshold: 0 });

      observer.observe(submit);
      window.addEventListener('scroll', updateStickyFromSubmit, { passive: true });
      window.addEventListener('resize', updateStickyFromSubmit);
      window.requestAnimationFrame(updateStickyFromSubmit);
    }
  }

  function boot() {
    document.querySelectorAll('[data-gb-color-page]').forEach(initGymBadgeColorPage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initGymBadgeColorPage(event.target.querySelector('[data-gb-color-page]'));
  });
})();
