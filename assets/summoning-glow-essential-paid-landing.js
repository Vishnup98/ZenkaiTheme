(function () {
  'use strict';

  var section = document.querySelector('[data-sge-paid-landing]');
  if (!section) return;

  var params = new URLSearchParams(window.location.search);
  var requested = (params.get('lp') || '').trim().toLowerCase();
  if (requested !== 'reveal' && requested !== 'desk') return;

  var panel = section.querySelector('[data-sge-lp-panel="' + requested + '"]');
  if (!panel) return;

  section.dataset.activeLp = requested;
  section.hidden = false;
  panel.hidden = false;
  document.documentElement.classList.add('sge-paid-lp-active');
  document.documentElement.dataset.sgePaidLp = requested;

  var productSectionSelector = section.getAttribute('data-product-section-selector');
  var productSection = productSectionSelector ? document.querySelector(productSectionSelector) : null;
  var content = {
    reveal: {
      hook: 'All seven lights. None of the extra visual noise.',
      subheadline: 'One coiled dragon, seven translucent spheres, and a remote-controlled RGB base with a clean, open silhouette.'
    },
    desk: {
      hook: 'The desk glow, toned down in all the right places.',
      subheadline: 'A low-profile RGB display with enough presence to anchor the setup—without the tall explosion pieces.'
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
    section.querySelectorAll('[data-sge-lp-add]').forEach(function (button) {
      button.disabled = !mainButton || mainButton.disabled;
    });
  }

  section.querySelectorAll('[data-sge-lp-add]').forEach(function (button) {
    button.addEventListener('click', function () {
      var mainButton = getMainButton();
      if (!mainButton || mainButton.disabled) {
        if (productSection) productSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'summoning_glow_essential_paid_lp_add',
          landing_variant: requested
        });
      }

      mainButton.click();
    });
  });

  section.querySelectorAll('[data-sge-lp-details]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'summoning_glow_essential_paid_lp_details',
          landing_variant: requested
        });
      }
    });
  });

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push({
      event: 'summoning_glow_essential_paid_lp_view',
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
