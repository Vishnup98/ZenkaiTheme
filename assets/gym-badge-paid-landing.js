(function () {
  'use strict';

  var section = document.querySelector('[data-gb-paid-landing]');
  if (!section) return;

  var params = new URLSearchParams(window.location.search);
  var requested = (params.get('lp') || '').trim().toLowerCase();
  var supported = ['complete', 'premium', 'nostalgia', 'proof'].indexOf(requested) !== -1;
  if (!supported) return;

  var panel = section.querySelector('[data-gb-lp-panel="' + requested + '"]');
  if (!panel) return;

  var productSectionSelector = section.getAttribute('data-product-section-selector');
  var productSection = productSectionSelector ? document.querySelector(productSectionSelector) : null;
  var collectorVariantId = section.getAttribute('data-collector-variant-id');
  var collectorVariantTitle = (section.getAttribute('data-collector-variant-title') || '').toLowerCase();
  var pageCopy = {
    complete: {
      hook: 'Every badge. Every box.',
      subheadline: 'The complete 32-badge collection across four fitted presentation boxes.'
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

  section.dataset.activeLp = requested;
  section.hidden = false;
  panel.hidden = false;
  document.documentElement.classList.add('gb-paid-lp-active');
  document.documentElement.dataset.gbPaidLp = requested;

  var activeImage = panel.querySelector('[data-gb-lp-src]');
  if (activeImage && !activeImage.getAttribute('src')) {
    activeImage.src = activeImage.getAttribute('data-gb-lp-src');
  }

  try {
    window.sessionStorage.setItem('gb_paid_lp', requested);
  } catch (error) {
    // Storage may be unavailable in privacy-restricted browsing modes.
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

  function getMainButton() {
    return productSection ? productSection.querySelector('[data-add-to-cart]') : null;
  }

  function isCollectorLabel(value) {
    var label = (value || '').toLowerCase();
    return label.indexOf('collector') !== -1 ||
      label.indexOf('4 regions') !== -1 ||
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

    if (collectorInput) {
      if (!collectorInput.checked) collectorInput.click();
      return true;
    }

    var select = productSection.querySelector('[data-product-select]');
    if (select && collectorVariantId) {
      select.value = collectorVariantId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value === collectorVariantId;
    }

    return false;
  }

  function syncHeroButtons() {
    var mainButton = getMainButton();
    panel.querySelectorAll('[data-gb-lp-add]').forEach(function (button) {
      button.disabled = !mainButton || mainButton.disabled;
    });
  }

  selectCollectorVariant();
  window.setTimeout(syncHeroButtons, 80);

  panel.querySelectorAll('[data-gb-lp-add]').forEach(function (button) {
    button.addEventListener('click', function () {
      selectCollectorVariant();

      window.setTimeout(function () {
        var mainButton = getMainButton();
        if (!mainButton || mainButton.disabled) {
          if (productSection) productSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }

        if (window.dataLayer && typeof window.dataLayer.push === 'function') {
          window.dataLayer.push({
            event: 'gym_badge_paid_lp_add',
            landing_variant: requested,
            product_variant_id: collectorVariantId
          });
        }

        mainButton.click();
      }, 80);
    });
  });

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

  var mainButton = getMainButton();
  if (mainButton && window.MutationObserver) {
    new MutationObserver(syncHeroButtons).observe(mainButton, {
      attributes: true,
      attributeFilter: ['disabled']
    });
  }
})();
