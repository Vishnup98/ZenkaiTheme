(function () {
  'use strict';

  var section = document.querySelector('[data-sge-paid-landing]');
  if (!section) return;

  var params = new URLSearchParams(window.location.search);
  var requestedParam = (params.get('lp') || '').trim().toLowerCase();
  var aliases = {
    reveal: 'transform',
    desk: 'transform',
    transformation: 'transform',
    kit: 'complete',
    testimonial: 'review'
  };
  var requested = aliases[requestedParam] || requestedParam;
  if (['transform', 'complete', 'review'].indexOf(requested) === -1) return;

  var panel = section.querySelector('[data-sge-lp-panel="' + requested + '"]');
  if (!panel) return;

  var activeImage = panel.querySelector('.sge-paid-landing__visual img');
  if (activeImage) {
    activeImage.loading = 'eager';
    activeImage.fetchPriority = 'high';
    var activeSource = activeImage.getAttribute('data-src');
    if (activeSource) {
      activeImage.src = activeSource;
      activeImage.removeAttribute('data-src');
    }
  }

  section.dataset.activeLp = requested;
  section.hidden = false;
  panel.hidden = false;
  document.documentElement.classList.add('sge-paid-lp-active');
  document.documentElement.dataset.sgePaidLp = requested;

  var productSectionSelector = section.getAttribute('data-product-section-selector');
  var productSection = productSectionSelector ? document.querySelector(productSectionSelector) : null;
  var content = {
    transform: {
      hook: 'Your shelf after one switch.',
      subheadline: 'One coiled dragon, seven translucent spheres, and a remote-controlled RGB base built to become the centerpiece.'
    },
    complete: {
      hook: 'All seven. One remote.',
      subheadline: 'The complete RGB display: coiled dragon, seven one-through-seven-star spheres, light base, remote, cable, and clear supports.'
    },
    review: {
      hook: '“The lights really elevate the product.”',
      subheadline: 'See the verified-customer setup, then explore the close-up detail, included pieces, and RGB controls.'
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
          landing_variant: requested,
          landing_variant_requested: requestedParam
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
          landing_variant: requested,
          landing_variant_requested: requestedParam
        });
      }
    });
  });

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push({
      event: 'summoning_glow_essential_paid_lp_view',
      landing_variant: requested,
      landing_variant_requested: requestedParam
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
