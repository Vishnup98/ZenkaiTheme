(function () {
  function initEvolutionPinPage(root) {
    if (!root || root.dataset.evoInitialized === 'true') return;
    root.dataset.evoInitialized = 'true';

    var mainImage = root.querySelector('[data-evo-main-image]');
    var thumbs = root.querySelectorAll('[data-evo-thumb]');

    function setText(selector, value) {
      var node = root.querySelector(selector);
      if (node && value) node.textContent = value;
    }

    function setLeadCopy(selector, lead, copy) {
      var node = root.querySelector(selector);
      if (!node || !lead) return;

      node.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = lead;
      node.appendChild(strong);
      node.appendChild(document.createTextNode(' ' + (copy || '')));
    }

    function applyAngleJourney() {
      var params = new URLSearchParams(window.location.search);
      var requested = (params.get('angle') || '').trim().toLowerCase();
      if (!requested) return;

      var configNode = root.querySelector('[data-evo-angle-config]');
      if (!configNode) return;

      var angleConfig;
      try {
        angleConfig = JSON.parse(configNode.textContent || '{}');
      } catch (error) {
        return;
      }

      var config = angleConfig[requested];
      if (!config) return;

      root.dataset.activeAngle = requested;
      document.documentElement.dataset.evolutionAngle = requested;

      if (mainImage && config.heroImage) {
        mainImage.src = config.heroImage;
        mainImage.srcset = '';
        mainImage.sizes = '(min-width: 990px) 52vw, 100vw';
        mainImage.alt = config.heroAlt || '';
        mainImage.width = 1080;
        mainImage.height = 1350;
      }

      setText('[data-evo-hero-eyebrow]', config.heroEyebrow);
      setText('[data-evo-hero-title]', config.heroTitle);
      setText('[data-evo-hero-lede]', config.heroLede);
      setLeadCopy('[data-evo-gift-note]', config.giftLead, config.giftCopy);
      setLeadCopy('[data-evo-mini-proof]', config.miniLead, config.miniCopy);
      setText('[data-evo-manifesto-eyebrow]', config.manifestoEyebrow);
      setText('[data-evo-manifesto-title]', config.manifestoTitle);
      setText('[data-evo-manifesto-copy]', config.manifestoCopy);
      setText('[data-evo-story-eyebrow]', config.storyEyebrow);
      setText('[data-evo-story-title]', config.storyTitle);
      setText('[data-evo-story-copy]', config.storyCopy);

      var proofCards = root.querySelectorAll('[data-evo-proof-card]');
      if (Array.isArray(config.proof)) {
        config.proof.forEach(function (proof, index) {
          var card = proofCards[index];
          if (!card || !Array.isArray(proof)) return;
          var title = card.querySelector('h3');
          var copy = card.querySelector('p');
          if (title && proof[0]) title.textContent = proof[0];
          if (copy && proof[1]) copy.textContent = proof[1];
        });
      }

      var angleInput = root.querySelector('[data-evo-angle-input]');
      if (angleInput) angleInput.value = requested;

      var manifesto = root.querySelector('.evo-pin-manifesto');
      var story = root.querySelector('.evo-pin-story');
      var inHand = root.querySelector('.evo-pin-inhand');
      if (requested === 'style' && manifesto && story) {
        root.insertBefore(story, manifesto);
      } else if (requested === 'nostalgia' && manifesto && inHand) {
        root.insertBefore(inHand, manifesto);
      }

      try {
        window.sessionStorage.setItem('evolution_landing_angle', requested);
      } catch (error) {
        // Storage can be unavailable in privacy-restricted browsing modes.
      }

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'evolution_angle_viewed',
        evolution_angle: requested,
        product_id: root.dataset.sectionId || ''
      });
    }

    applyAngleJourney();

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
