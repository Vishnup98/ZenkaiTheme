(function () {
  'use strict';

  var section = document.querySelector('[data-sg-paid-landing]');
  if (!section) return;

  var params = new URLSearchParams(window.location.search);
  var requested = (params.get('lp') || '').trim().toLowerCase();
  var supported = requested === 'reveal' || requested === 'desk';

  if (!supported) return;

  var panel = section.querySelector('[data-sg-lp-panel="' + requested + '"]');
  if (!panel) return;

  section.dataset.activeLp = requested;
  section.hidden = false;
  panel.hidden = false;
  document.documentElement.classList.add('sg-paid-lp-active');
  document.documentElement.dataset.sgPaidLp = requested;

  try {
    window.sessionStorage.setItem('sg_paid_lp', requested);
  } catch (error) {
    // Storage may be unavailable in privacy-restricted browsing modes.
  }

  var productSectionSelector = section.getAttribute('data-product-section-selector');
  var productSection = productSectionSelector ? document.querySelector(productSectionSelector) : null;
  var content = {
    reveal: {
      hook: 'Watch the shelf wake up.',
      subheadline: 'Seven translucent spheres, one coiled dragon, and a warm LED base built to become the focal point after dark.'
    },
    desk: {
      hook: "Built for the collector's shelf.",
      subheadline: 'A complete illuminated display with enough presence to anchor the setup—without taking over the entire desk.'
    }
  };

  if (productSection) {
    var hook = productSection.querySelector('.zenkai-signal-hook');
    var subheadline = productSection.querySelector('.zenkai-social-subheadline');
    if (hook) hook.textContent = content[requested].hook;
    if (subheadline) subheadline.textContent = content[requested].subheadline;
  }

  function getMainButton() {
    return productSection ? productSection.querySelector('[data-add-to-cart]') : null;
  }

  function syncHeroButtons() {
    var mainButton = getMainButton();
    section.querySelectorAll('[data-sg-lp-add]').forEach(function (button) {
      button.disabled = !mainButton || mainButton.disabled;
    });
  }

  section.querySelectorAll('[data-sg-lp-add]').forEach(function (button) {
    button.addEventListener('click', function () {
      var mainButton = getMainButton();
      if (!mainButton || mainButton.disabled) {
        if (productSection) productSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'summoning_glow_paid_lp_add',
          landing_variant: requested
        });
      }

      mainButton.click();
    });
  });

  section.querySelectorAll('[data-sg-lp-details]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'summoning_glow_paid_lp_details',
          landing_variant: requested
        });
      }
    });
  });

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push({
      event: 'summoning_glow_paid_lp_view',
      landing_variant: requested
    });
  }

  syncHeroButtons();
  var mainButton = getMainButton();
  if (mainButton && window.MutationObserver) {
    new MutationObserver(syncHeroButtons).observe(mainButton, {
      attributes: true,
      attributeFilter: ['disabled']
    });
  }
})();
