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
    var saving = root.querySelector('[data-gb-color-saving]');
    var countBadge = root.querySelector('[data-gb-color-count]');
    var countNumber = root.querySelector('[data-gb-color-count-number]');
    var countLabel = root.querySelector('[data-gb-color-count-label]');
    var countDetail = root.querySelector('[data-gb-color-count-detail]');
    var submit = root.querySelector('[data-gb-color-submit]');
    var submitText = root.querySelector('[data-gb-color-submit-text]');
    var sticky = root.querySelector('[data-gb-color-sticky]');
    var stickyPrice = root.querySelector('[data-gb-color-sticky-price]');
    var stickyLabel = root.querySelector('[data-gb-color-sticky-label]');
    var stickyButton = root.querySelector('[data-gb-color-sticky-add]');
    var collectorButton = root.querySelector('[data-gb-color-variant][data-is-collector="true"]');
    var chooseCollectorButtons = root.querySelectorAll('[data-gb-color-choose-collector]');
    var regionPurchaseCards = root.querySelectorAll('[data-gb-color-region-purchase]');
    var form = root.querySelector('.gb-color-form');
    var checkoutStatus = root.querySelector('[data-gb-color-checkout-status]');
    var directCheckout = root.dataset.gbDirectCheckout === 'true';
    var forceCollector = root.dataset.gbForceCollector === 'true';
    var landingVariant = root.dataset.gbLandingVariant || 'standard';
    var checkoutInFlight = false;
    var checkoutStatusTimer = null;

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

    function getShopifyRoot() {
      return window.Shopify && window.Shopify.routes && window.Shopify.routes.root
        ? window.Shopify.routes.root
        : '/';
    }

    function showCheckoutStatus(message, isError) {
      if (!checkoutStatus) return;
      window.clearTimeout(checkoutStatusTimer);
      checkoutStatus.textContent = message;
      checkoutStatus.hidden = false;
      checkoutStatus.dataset.status = isError ? 'error' : 'working';

      if (isError) {
        checkoutStatusTimer = window.setTimeout(function () {
          checkoutStatus.hidden = true;
        }, 6500);
      }
    }

    function setCheckoutBusy(isBusy, trigger) {
      var controls = [];
      [submit, stickyButton, trigger].forEach(function (button) {
        if (button && controls.indexOf(button) === -1) controls.push(button);
      });
      chooseCollectorButtons.forEach(function (button) {
        if (controls.indexOf(button) === -1) controls.push(button);
      });
      variantButtons.forEach(function (button) {
        if (controls.indexOf(button) === -1) controls.push(button);
      });

      root.classList.toggle('is-checkout-busy', isBusy);

      controls.forEach(function (button) {
        if (!button) return;
        button.classList.toggle('is-checkout-busy', isBusy);
        button.setAttribute('aria-busy', isBusy ? 'true' : 'false');

        if (isBusy && !button.dataset.gbCheckoutWasDisabled) {
          button.dataset.gbCheckoutWasDisabled = button.disabled ? 'true' : 'false';
          button.disabled = true;
        } else if (button.dataset.gbCheckoutWasDisabled) {
          button.disabled = button.dataset.gbCheckoutWasDisabled === 'true';
          delete button.dataset.gbCheckoutWasDisabled;
        }
      });

      if (submitText) {
        if (isBusy) {
          submitText.dataset.previousText = submitText.textContent;
          submitText.textContent = 'Opening secure checkout…';
        } else if (submitText.dataset.previousText) {
          submitText.textContent = submitText.dataset.previousText;
          delete submitText.dataset.previousText;
        }
      }
    }

    function pushCheckoutEvent(name, variantId) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: name,
        landing_page_variant: landingVariant,
        ecommerce: {
          items: [{ item_id: String(variantId), quantity: 1 }]
        }
      });
    }

    function pushLandingViewEvent(variantId) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'gym_badge_color_landing_view',
        landing_page_variant: landingVariant,
        collector_variant_id: String(root.dataset.collectorVariantId || ''),
        selected_variant_id: String(variantId || ''),
        direct_checkout: directCheckout
      });

      try {
        window.sessionStorage.setItem('gym_badge_landing_variant', landingVariant);
      } catch (error) {
        return;
      }
    }

    function getSelectedVariantId() {
      if (variantSelect && variantSelect.value) return variantSelect.value;
      return root.dataset.collectorVariantId || '';
    }

    function checkoutSelectedVariant(trigger) {
      if (checkoutInFlight) return;

      var variantId = getSelectedVariantId();
      if (!variantId) {
        showCheckoutStatus('Please choose a collection before continuing.', true);
        return;
      }

      checkoutInFlight = true;
      setCheckoutBusy(true, trigger);
      showCheckoutStatus('Adding your collection and opening secure checkout…', false);
      pushCheckoutEvent('gym_badge_color_checkout_start', variantId);

      var shopifyRoot = getShopifyRoot();
      var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
      var checkoutTimeout = window.setTimeout(function () {
        if (controller) controller.abort();
      }, 12000);
      var requestOptions = {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
      };
      if (controller) requestOptions.signal = controller.signal;

      fetch(shopifyRoot + 'cart/add.js', requestOptions)
        .then(function (response) {
          window.clearTimeout(checkoutTimeout);
          if (!response.ok) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
              throw new Error(payload.description || payload.message || 'This option could not be added.');
            });
          }
          return response.json();
        })
        .then(function () {
          pushCheckoutEvent('gym_badge_color_checkout_redirect', variantId);
          window.location.assign(shopifyRoot + 'checkout');
        })
        .catch(function (error) {
          window.clearTimeout(checkoutTimeout);
          checkoutInFlight = false;
          setCheckoutBusy(false, trigger);
          var message = error && error.name === 'AbortError'
            ? 'Checkout took too long to open. Please try again.'
            : (error && error.message ? error.message : 'Checkout could not open. Please try again.');
          showCheckoutStatus(message, true);
        });
    }

    function selectVariant(button, options) {
      if (!button || button.disabled) return;
      options = options || {};

      variantButtons.forEach(function (item) {
        var isSelected = item === button;
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      regionPurchaseCards.forEach(function (card) {
        card.classList.toggle('is-selected', card.dataset.variantId === button.dataset.variantId);
      });

      if (variantSelect) {
        variantSelect.value = button.dataset.variantId;
        variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      var isCollector = button.dataset.isCollector === 'true';
      var variantTitle = button.dataset.variantTitle || '';
      var variantPrice = button.dataset.price || '';
      var label = isCollector ? 'Get All 32' : 'Get ' + variantTitle;

      if (countBadge) {
        countBadge.setAttribute('aria-label', isCollector
          ? 'Collector Pack includes 32 badges in four boxes'
          : variantTitle + ' includes eight badges in one box');
      }
      if (countNumber) countNumber.textContent = isCollector ? '32' : '8';
      if (countLabel) countLabel.textContent = 'badges';
      if (countDetail) countDetail.textContent = isCollector ? '4 fitted boxes' : '1 fitted box';

      if (price) price.textContent = variantPrice;
      if (priceNote) priceNote.textContent = button.dataset.priceNote || '';

      if (compare) {
        compare.textContent = button.dataset.compare || '';
        compare.hidden = !button.dataset.compare;
      }

      if (saving) saving.hidden = !isCollector || saving.dataset.gbHasSavings !== 'true';

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

        if (button.hasAttribute('data-gb-color-region-add')) {
          var liveSubmit = root.querySelector('[data-gb-color-submit]');
          if (liveSubmit && !liveSubmit.disabled) liveSubmit.click();
        }
      });
    });

    var initialVariantId = getSelectedVariantId();
    if (forceCollector && root.dataset.collectorVariantId) {
      initialVariantId = root.dataset.collectorVariantId;
      updateUrl(initialVariantId);
    }
    pushLandingViewEvent(initialVariantId);

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

    if (chooseCollectorButtons.length && collectorButton) {
      chooseCollectorButtons.forEach(function (chooseCollectorButton) {
        chooseCollectorButton.addEventListener('click', function () {
          selectVariant(collectorButton);
          if (directCheckout) {
            checkoutSelectedVariant(chooseCollectorButton);
            return;
          }
          var offer = root.querySelector('.gb-color-offer');
          if (offer) offer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }

    if (stickyButton && submit) {
      stickyButton.addEventListener('click', function () {
        var liveSubmit = root.querySelector('[data-gb-color-submit]');
        if (liveSubmit) liveSubmit.click();
      });
    }

    if (directCheckout && form && submit) {
      submit.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        checkoutSelectedVariant(submit);
      }, true);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        checkoutSelectedVariant(submit);
      }, true);
    }

    if (sticky && submit && 'IntersectionObserver' in window) {
      var setStickyVisibility = function (shouldShow) {
        sticky.classList.toggle('is-visible', shouldShow);
        sticky.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        if (stickyButton) stickyButton.tabIndex = shouldShow ? 0 : -1;
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
