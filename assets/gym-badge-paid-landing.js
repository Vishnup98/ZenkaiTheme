(function () {
  'use strict';

  var section = document.querySelector('[data-gb-paid-landing]');
  if (!section) return;

  var params = new URLSearchParams(window.location.search);
  var requested = (params.get('lp') || '').trim().toLowerCase();
  var supported = ['complete', 'og-four', '32-of-32', 'collector', 'shelf', 'collection', 'premium', 'nostalgia', 'proof'].indexOf(requested) !== -1;
  if (!supported) return;

  var panel = section.querySelector('[data-gb-lp-panel="' + requested + '"]');
  if (!panel) return;

  var productSectionSelector = section.getAttribute('data-product-section-selector');
  var productSection = productSectionSelector ? document.querySelector(productSectionSelector) : null;
  var collectorVariantId = section.getAttribute('data-collector-variant-id');
  var collectorVariantTitle = (section.getAttribute('data-collector-variant-title') || '').toLowerCase();
  var singleRegionPrice = section.getAttribute('data-single-region-price') || '$29.99';
  var sticky = section.querySelector('[data-gb-lp-sticky]');
  var stickyButton = section.querySelector('[data-gb-lp-sticky-add]');
  var checkoutStatus = section.querySelector('[data-gb-lp-checkout-status]');
  var checkoutInFlight = false;
  var checkoutStatusTimer = null;
  var productVariants = [];
  var pageCopy = {
    complete: {
      hook: 'Every badge. Every box.',
      subheadline: 'The complete 32-badge collection across four fitted presentation boxes.'
    },
    'og-four': {
      hook: 'The OG four. All 32.',
      subheadline: 'Kanto, Johto, Hoenn, and Sinnoh—together in one complete hard-enamel collection.'
    },
    '32-of-32': {
      hook: '32 of 32. Nothing missing.',
      subheadline: 'The complete four-region badge collection across four fitted presentation boxes.'
    },
    collector: {
      hook: 'Not just merchandise. Your complete collection.',
      subheadline: 'All 32 polished hard-enamel badges, organized from Kanto through Sinnoh.'
    },
    shelf: {
      hook: 'The collection your shelf was waiting for.',
      subheadline: 'All four original regions, boxed and ready for the space you finally built.'
    },
    collection: {
      hook: 'One box is a souvenir. Four is the collection.',
      subheadline: 'The complete 32-badge run from Kanto through Sinnoh in four fitted presentation boxes.'
    },
    premium: {
      hook: "The definitive collector's set.",
      subheadline: 'Four boxed regional sets arranged as one premium, shelf-ready collection.'
    },
    nostalgia: {
      hook: 'You earned them. Now own them.',
      subheadline: 'All 32 badges from the four regions you remember, together in one complete collection.'
    },
    proof: {
      hook: 'Look closer.',
      subheadline: 'Glossy hard enamel, raised metal detail, secure clutch backs, and all 32 badges.'
    }
  };
  var buyerProof = {
    complete: {
      quote: 'The box presentation makes these feel like a real collector piece. I bought one region first and came back for the full set.',
      attribution: 'Verified buyer'
    },
    'og-four': {
      quote: "Wauw they look amazing, I really feel like a Pokemon trainer and it brings great nostalgia. Let's go to the elite four.",
      attribution: 'S.P. · Verified buyer'
    },
    '32-of-32': {
      quote: 'The box presentation makes these feel like a real collector piece. I bought one region first and came back for the full set.',
      attribution: 'Verified buyer'
    },
    collector: {
      quote: 'The badges look to be high quality as does the display box it came in, will definitely have a very happy brother once he gets them.',
      attribution: 'Customer review'
    },
    shelf: {
      quote: 'The badges look to be high quality as does the display box it came in, will definitely have a very happy brother once he gets them.',
      attribution: 'Customer review'
    },
    collection: {
      quote: 'The box presentation makes these feel like a real collector piece. I bought one region first and came back for the full set.',
      attribution: 'Verified buyer'
    },
    premium: {
      quote: 'The badges look to be high quality as does the display box it came in, will definitely have a very happy brother once he gets them.',
      attribution: 'Customer review'
    },
    nostalgia: {
      quote: "Wauw they look amazing, I really feel like a Pokemon trainer and it brings great nostalgia. Let's go to the elite four.",
      attribution: 'S.P. · Verified buyer'
    },
    proof: {
      quote: 'Very pretty and nice material too, perfect for gifting.',
      attribution: 'Customer review'
    }
  };

  section.dataset.activeLp = requested;
  section.hidden = false;
  panel.hidden = false;
  document.documentElement.classList.add('gb-paid-lp-active');
  document.documentElement.dataset.gbPaidLp = requested;

  function simplifyPaidHeader() {
    var rotatingAnnouncement = document.querySelector('.announcement__text--rotating');
    if (rotatingAnnouncement) {
      var staticAnnouncement = rotatingAnnouncement.cloneNode(false);
      staticAnnouncement.classList.remove('announcement__text--rotating');
      staticAnnouncement.classList.add('gb-paid-lp-announcement');
      staticAnnouncement.removeAttribute('data-rotating-messages');
      staticAnnouncement.textContent = 'Free U.S. shipping · Typical U.S. delivery: 1 business week';
      rotatingAnnouncement.parentNode.replaceChild(staticAnnouncement, rotatingAnnouncement);
    }

    var announcementLink = document.querySelector('.announcement__link');
    if (announcementLink) announcementLink.removeAttribute('href');
  }

  simplifyPaidHeader();

  var activeImage = panel.querySelector('[data-gb-lp-src]');
  if (activeImage && !activeImage.getAttribute('src')) {
    activeImage.src = activeImage.getAttribute('data-gb-lp-src');
  }

  try {
    window.sessionStorage.setItem('gb_paid_lp', requested);
  } catch (error) {
    // Storage may be unavailable in privacy-restricted browsing modes.
  }

  function getMainButton() {
    return productSection ? productSection.querySelector('[data-add-to-cart]') : null;
  }

  function getProductForm() {
    return productSection ? productSection.querySelector('.product-single__form') : null;
  }

  if (productSection) {
    var variantJson = productSection.querySelector('[data-variant-json]');
    if (variantJson) {
      try {
        productVariants = JSON.parse(variantJson.textContent || '[]');
      } catch (error) {
        productVariants = [];
      }
    }
  }

  function getSelectedVariantId() {
    var checkedInput = productSection ? productSection.querySelector('[data-variant-input]:checked') : null;
    if (checkedInput && productVariants.length) {
      var checkedValue = checkedInput.value;
      for (var index = 0; index < productVariants.length; index += 1) {
        var variant = productVariants[index];
        if (variant.title === checkedValue ||
            (variant.options && variant.options.length === 1 && variant.options[0] === checkedValue)) {
          return String(variant.id);
        }
      }
    }

    var select = productSection ? productSection.querySelector('[data-product-select]') : null;
    return select && select.value ? select.value : collectorVariantId;
  }

  function isCollectorLabel(value) {
    var label = (value || '').toLowerCase();
    return label.indexOf('collector') !== -1 ||
      label.indexOf('4 regions') !== -1 ||
      label.indexOf('4-region') !== -1 ||
      label.indexOf('all four') !== -1 ||
      (collectorVariantTitle && label === collectorVariantTitle);
  }

  function selectCollectorVariant() {
    if (!productSection) return false;

    var collectorInput = null;
    var inputs = productSection.querySelectorAll('[data-variant-input]');
    for (var index = 0; index < inputs.length; index += 1) {
      if (isCollectorLabel(inputs[index].value)) {
        collectorInput = inputs[index];
        break;
      }
    }

    var select = productSection.querySelector('[data-product-select]');
    if (collectorInput && !collectorInput.checked) collectorInput.click();
    if (select && collectorVariantId) {
      select.value = collectorVariantId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return Boolean(collectorInput || (select && select.value === collectorVariantId));
  }

  function enhanceVariantPicker() {
    if (!productSection) return;

    var fieldset = productSection.querySelector('.variant-input-wrap');
    if (!fieldset || fieldset.hasAttribute('data-gb-paid-lp-picker')) return;

    var collectorOption = fieldset.querySelector('.variant-input--collector');
    var regionOptions = Array.prototype.filter.call(fieldset.children, function (child) {
      return child.classList &&
        child.classList.contains('variant-input') &&
        !child.classList.contains('variant-input--collector');
    });
    if (!collectorOption || !regionOptions.length) return;

    fieldset.setAttribute('data-gb-paid-lp-picker', 'true');
    fieldset.classList.add('gb-paid-lp-variant-picker');

    var legend = fieldset.querySelector('legend');
    if (legend) {
      legend.classList.remove('hidden-label');
      legend.textContent = 'Choose your collection';
    }

    var regionDetails = document.createElement('details');
    regionDetails.className = 'gb-paid-lp-region-options';
    var regionSummary = document.createElement('summary');
    regionSummary.textContent = 'Prefer one region? Choose one boxed set — ' + singleRegionPrice;
    var regionChoices = document.createElement('div');
    regionChoices.className = 'gb-paid-lp-region-options__choices';

    regionOptions.forEach(function (option) {
      regionChoices.appendChild(option);
      var input = option.querySelector('[data-variant-input]');
      if (input && input.checked) regionDetails.open = true;
      if (input) {
        input.addEventListener('change', function () {
          if (input.checked) regionDetails.open = true;
        });
      }
    });

    var collectorInput = collectorOption.querySelector('[data-variant-input]');
    if (collectorInput) {
      collectorInput.addEventListener('change', function () {
        if (collectorInput.checked) regionDetails.open = false;
      });
    }

    regionDetails.appendChild(regionSummary);
    regionDetails.appendChild(regionChoices);
    fieldset.appendChild(collectorOption);

    var mainButton = getMainButton();
    if (mainButton) {
      mainButton.insertAdjacentElement('afterend', regionDetails);
    } else {
      fieldset.appendChild(regionDetails);
    }
  }

  function moveCustomerProofForward() {
    if (!productSection) return;

    var customerProof = productSection.querySelector('.zenkai-pin-collector-photos');
    if (!customerProof) {
      panel.querySelectorAll('[data-gb-lp-details]').forEach(function (link) {
        link.setAttribute('href', productSectionSelector || '#');
      });
      return;
    }

    customerProof.id = 'gb-paid-customer-proof';
    customerProof.classList.add('zenkai-pin-collector-photos--paid-placement');
    section.insertBefore(customerProof, sticky || null);
  }

  function addDirectCheckoutNote() {
    var mainButton = getMainButton();
    if (!mainButton || productSection.querySelector('[data-gb-lp-direct-note]')) return;

    var note = document.createElement('p');
    note.className = 'gb-paid-lp-direct-note';
    note.setAttribute('data-gb-lp-direct-note', '');
    note.textContent = 'Goes directly to secure checkout · Free U.S. shipping.';
    mainButton.insertAdjacentElement('afterend', note);

    var shippingBadgeText = productSection.querySelector('.zenkai-shipping-badge__text');
    if (shippingBadgeText) {
      shippingBadgeText.textContent = 'Typical U.S. delivery: 1 business week';
    }
  }

  function moveBuyerQuoteForward() {
    if (panel.querySelector('[data-gb-lp-buyer-quote]')) return;

    var source = productSection ? productSection.querySelector('.zenkai-proof-nudge') : null;
    var sourceQuote = source ? source.querySelector('.zenkai-proof-nudge__quote') : null;
    var sourceAttribution = source ? source.querySelector('.zenkai-proof-nudge__attr') : null;
    var primaryButton = panel.querySelector('.gb-paid-landing__primary');
    var matchedProof = buyerProof[requested] || null;
    var quoteText = matchedProof && matchedProof.quote
      ? matchedProof.quote
      : (sourceQuote ? sourceQuote.textContent.trim() : '');
    var attributionText = matchedProof && matchedProof.attribution
      ? matchedProof.attribution
      : (sourceAttribution && sourceAttribution.textContent.trim()
        ? sourceAttribution.textContent.trim()
        : 'Verified buyer');
    if (!quoteText || !primaryButton) return;

    var proof = document.createElement('figure');
    proof.className = 'gb-paid-landing__buyer-quote';
    proof.setAttribute('data-gb-lp-buyer-quote', '');
    proof.setAttribute('aria-label', 'Verified buyer review');

    var quote = document.createElement('blockquote');
    quote.textContent = '“' + quoteText + '”';
    proof.appendChild(quote);

    var attribution = document.createElement('figcaption');
    attribution.textContent = attributionText;
    proof.appendChild(attribution);

    primaryButton.insertAdjacentElement('afterend', proof);
  }

  function hideRepeatedBuyerQuote() {
    var matchedProof = buyerProof[requested] || null;
    if (!productSection || !matchedProof || !matchedProof.quote) return;

    function normalizeQuote(value) {
      return String(value || '')
        .replace(/[“”"']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    var matchedQuote = normalizeQuote(matchedProof.quote);
    var lowerReviews = document.querySelectorAll(
      '.zenkai-proof-nudge, .zenkai-context-review, .zenkai-pin-photo-card--quote'
    );

    for (var index = 0; index < lowerReviews.length; index += 1) {
      var review = lowerReviews[index];
      var quote = review.querySelector('blockquote, .zenkai-proof-nudge__quote');
      if (!quote || normalizeQuote(quote.textContent) !== matchedQuote) continue;

      review.hidden = true;
      review.setAttribute('data-gb-lp-matched-duplicate', '');
      break;
    }
  }

  if (productSection) {
    var hook = productSection.querySelector('.zenkai-signal-hook');
    var subheadline = productSection.querySelector('.zenkai-social-subheadline');
    if (hook) hook.textContent = pageCopy[requested].hook;
    if (subheadline) subheadline.textContent = pageCopy[requested].subheadline;

    var pinDetails = productSection.querySelector('[id^="zenkai-size-"]');
    if (pinDetails) {
      var pinDetailsIntro = pinDetails.querySelector('p strong');
      var pinDetailsItems = pinDetails.querySelectorAll('li');
      if (pinDetailsIntro) {
        pinDetailsIntro.textContent = 'The complete 32-badge hard-enamel collection across four fitted presentation boxes.';
      }
      if (pinDetailsItems[0]) {
        pinDetailsItems[0].textContent = 'Includes four distinct 8-badge regional sets — 32 badges total';
      }
    }
  }

  selectCollectorVariant();
  enhanceVariantPicker();
  moveCustomerProofForward();
  addDirectCheckoutNote();
  moveBuyerQuoteForward();
  hideRepeatedBuyerQuote();

  function getShopifyRoot() {
    var root = window.Shopify && window.Shopify.routes && window.Shopify.routes.root
      ? window.Shopify.routes.root
      : '/';
    return root.charAt(root.length - 1) === '/' ? root : root + '/';
  }

  function showCheckoutStatus(message, isError) {
    if (!checkoutStatus) return;

    window.clearTimeout(checkoutStatusTimer);
    checkoutStatus.textContent = message;
    checkoutStatus.hidden = false;
    checkoutStatus.classList.toggle('is-error', Boolean(isError));

    if (isError) {
      checkoutStatusTimer = window.setTimeout(function () {
        checkoutStatus.hidden = true;
      }, 9000);
    }
  }

  function setCheckoutBusy(isBusy) {
    section.querySelectorAll('[data-gb-lp-add], [data-gb-lp-sticky-add]').forEach(function (button) {
      if (!button.hasAttribute('data-gb-lp-original-label')) {
        button.setAttribute('data-gb-lp-original-label', button.textContent.trim());
        button.setAttribute('data-gb-lp-original-disabled', button.disabled ? 'true' : 'false');
      }

      button.disabled = isBusy || button.getAttribute('data-gb-lp-original-disabled') === 'true';
      button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      button.textContent = isBusy
        ? 'Opening checkout…'
        : button.getAttribute('data-gb-lp-original-label');
    });

    var mainButton = getMainButton();
    if (mainButton) {
      mainButton.classList.toggle('btn--loading', isBusy);
      mainButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
  }

  function pushCheckoutEvent(variantId, placement) {
    if (!window.dataLayer || typeof window.dataLayer.push !== 'function') return;

    window.dataLayer.push({
      event: 'gym_badge_paid_lp_add',
      landing_variant: requested,
      cta_placement: placement,
      checkout_destination: 'direct',
      product_variant_id: String(variantId)
    });
  }

  function checkoutVariant(variantId, placement) {
    if (checkoutInFlight) return;
    if (!variantId || !/^\d+$/.test(String(variantId))) {
      showCheckoutStatus('Please choose a set, then try checkout again.', true);
      return;
    }

    checkoutInFlight = true;
    setCheckoutBusy(true);
    showCheckoutStatus('Adding your set and opening secure checkout…', false);
    pushCheckoutEvent(variantId, placement);

    var root = getShopifyRoot();
    window.fetch(root + 'cart/add.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{
          id: Number(variantId),
          quantity: 1
        }]
      })
    })
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            throw new Error(payload.description || payload.message || 'Could not add this set.');
          }
          return payload;
        });
      })
      .then(function () {
        if (window.dataLayer && typeof window.dataLayer.push === 'function') {
          window.dataLayer.push({
            event: 'gym_badge_paid_lp_checkout_redirect',
            landing_variant: requested,
            cta_placement: placement,
            product_variant_id: String(variantId)
          });
        }
        showCheckoutStatus('Set added. Opening secure checkout…', false);
        window.location.assign(root + 'checkout');
      })
      .catch(function (error) {
        checkoutInFlight = false;
        setCheckoutBusy(false);
        showCheckoutStatus(
          error && error.message
            ? error.message + ' Please try again.'
            : 'We could not open checkout. Please try again.',
          true
        );
      });
  }

  function addCollectorPack(placement) {
    selectCollectorVariant();
    checkoutVariant(collectorVariantId, placement);
  }

  panel.querySelectorAll('[data-gb-lp-add]').forEach(function (button) {
    button.addEventListener('click', function () {
      addCollectorPack('inline');
    });
  });

  if (stickyButton) {
    stickyButton.addEventListener('click', function () {
      addCollectorPack('sticky');
    });
  }

  var mainButton = getMainButton();
  var productForm = getProductForm();
  if (mainButton) {
    document.addEventListener('click', function (event) {
      var clickedButton = event.target.closest ? event.target.closest('[data-add-to-cart]') : null;
      if (clickedButton !== mainButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      checkoutVariant(getSelectedVariantId(), 'product_form');
    }, true);
  }

  if (productForm) {
    document.addEventListener('submit', function (event) {
      if (event.target !== productForm) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      checkoutVariant(getSelectedVariantId(), 'product_form');
    }, true);
  }

  function isInViewport(element) {
    if (!element) return false;
    var rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function syncStickyVisibility() {
    if (!sticky) return;

    var inlineVisible = false;
    panel.querySelectorAll('[data-gb-lp-add]').forEach(function (button) {
      if (isInViewport(button)) inlineVisible = true;
    });

    var mainButtonVisible = isInViewport(getMainButton());
    var showSticky = window.scrollY > 140 && !inlineVisible && !mainButtonVisible;
    sticky.hidden = !showSticky;
    sticky.classList.toggle('is-visible', showSticky);
  }

  var stickyFrame = null;
  function requestStickySync() {
    if (stickyFrame !== null) return;
    stickyFrame = window.requestAnimationFrame(function () {
      stickyFrame = null;
      syncStickyVisibility();
    });
  }

  if (sticky) {
    window.addEventListener('scroll', requestStickySync, { passive: true });
    window.addEventListener('resize', requestStickySync);
    window.setTimeout(syncStickyVisibility, 100);
  }

  panel.querySelectorAll('[data-gb-lp-details]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'gym_badge_paid_lp_details',
          landing_variant: requested,
          product_variant_id: collectorVariantId
        });
      }
    });
  });

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push({
      event: 'gym_badge_paid_lp_view',
      landing_variant: requested,
      product_variant_id: collectorVariantId
    });
  }
})();
