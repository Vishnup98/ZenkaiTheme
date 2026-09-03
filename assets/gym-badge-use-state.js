(function () {
  'use strict';

  var root = document.querySelector('[data-gb-use-state]');
  if (!root || root.dataset.gbUseReady === 'true') return;
  root.dataset.gbUseReady = 'true';

  var variantId = String(root.dataset.collectorVariantId || '');
  var productId = String(root.dataset.productId || '');
  var landingVariant = String(root.dataset.landingVariant || 'use-state');
  var landingView = 'gympin-' + landingVariant;
  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-gb-use-checkout]'));
  var sticky = root.querySelector('[data-gb-use-sticky]');
  var stickyButton = sticky ? sticky.querySelector('[data-gb-use-checkout]') : null;
  var inlineButtons = buttons.filter(function (button) { return button !== stickyButton; });
  var status = root.querySelector('[data-gb-use-status]');
  var shopRoot = window.Shopify && window.Shopify.routes && window.Shopify.routes.root
    ? window.Shopify.routes.root
    : '/';
  var attributionKeys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
    'fbclid', 'campaign_id', 'adset_id', 'ad_id', 'placement', 'site_source_name'
  ];
  var attributionStorageKey = 'zk_gym_badge_use_state_attribution';
  var checkoutInFlight = false;
  var attribution = collectAttribution();

  function endpoint(path) {
    return shopRoot.replace(/\/?$/, '/') + path.replace(/^\//, '');
  }

  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 240);
  }

  function collectAttribution() {
    var current = {};
    var stored = {};
    var params = new URLSearchParams(window.location.search);

    try {
      stored = JSON.parse(window.sessionStorage.getItem(attributionStorageKey) || '{}');
    } catch (error) {
      stored = {};
    }

    attributionKeys.forEach(function (key) {
      var present = clean(params.get(key));
      var fallback = clean(stored[key]);
      if (present || fallback) current[key] = present || fallback;
    });

    try {
      window.sessionStorage.setItem(attributionStorageKey, JSON.stringify(current));
    } catch (error) {
      // Checkout must remain available when storage is blocked.
    }

    return current;
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try {
      return clean(new URL(document.referrer).hostname);
    } catch (error) {
      return '';
    }
  }

  function cartAttributes(placement) {
    var attributes = {
      '__zk_landing_view': clean(landingView),
      '__zk_cta_placement': clean(placement),
      '__zk_landing_path': clean(window.location.pathname),
      '__zk_referrer_host': referrerHost()
    };

    attributionKeys.forEach(function (key) {
      if (attribution[key]) attributes['__zk_' + key] = attribution[key];
    });

    return attributes;
  }

  function lineProperties(placement) {
    var properties = {
      '_zk_landing_view': clean(landingView),
      '_zk_cta_placement': clean(placement)
    };
    ['utm_campaign', 'utm_content', 'ad_id'].forEach(function (key) {
      if (attribution[key]) properties['_zk_' + key] = attribution[key];
    });
    return properties;
  }

  function pushEvent(name, extra) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({
      event: name,
      landing_page_variant: landingView,
      product_id: productId,
      product_variant_id: variantId,
      checkout_destination: 'direct'
    }, extra || {}));
  }

  function setStatus(message, state) {
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || '';
    status.dataset.state = state || 'info';
    status.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    if (state === 'error') {
      status.setAttribute('tabindex', '-1');
      status.focus({ preventScroll: true });
    }
  }

  function setBusy(isBusy) {
    buttons.forEach(function (button) {
      if (!button.dataset.gbUseOriginalMarkup) {
        button.dataset.gbUseOriginalMarkup = button.innerHTML;
        button.dataset.gbUseOriginalDisabled = button.disabled ? 'true' : 'false';
      }

      button.disabled = isBusy || button.dataset.gbUseOriginalDisabled === 'true';
      button.classList.toggle('is-busy', isBusy);
      button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      if (isBusy) button.textContent = 'Opening secure checkout…';
      else button.innerHTML = button.dataset.gbUseOriginalMarkup;
    });
  }

  function fetchJson(url, options) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 12000);
    var requestOptions = Object.assign({
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }, options || {}, { signal: controller.signal });

    if (requestOptions.body) {
      requestOptions.headers = Object.assign({}, requestOptions.headers, {
        'Content-Type': 'application/json'
      });
    }

    return window.fetch(url, requestOptions).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) {
          var error = new Error(clean(payload.description || payload.message || 'Request failed'));
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function updateCartAttributes(placement) {
    return fetchJson(endpoint('cart/update.js'), {
      method: 'POST',
      body: JSON.stringify({ attributes: cartAttributes(placement) })
    });
  }

  function fetchCart() {
    return fetchJson(endpoint('cart.js'), { method: 'GET' });
  }

  function addCollectorPack(placement) {
    return fetchJson(endpoint('cart/add.js'), {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          id: Number(variantId),
          quantity: 1,
          properties: lineProperties(placement)
        }]
      })
    });
  }

  function cartContainsCollector(cart) {
    return Boolean(cart && Array.isArray(cart.items) && cart.items.some(function (item) {
      return String(item.variant_id) === variantId && Number(item.quantity) > 0;
    }));
  }

  function checkoutErrorMessage(error) {
    if (error && error.name === 'AbortError') {
      return 'Checkout is taking longer than expected. Please check your connection and try again.';
    }
    if (!navigator.onLine) return 'You appear to be offline. Reconnect and try again.';
    if (error && (error.status === 422 || error.status === 404)) {
      return error.message || 'The Collector Pack is unavailable right now. Please refresh and try again.';
    }
    return 'We could not open checkout. Nothing was added twice—please try again.';
  }

  function beginCheckout(button) {
    if (checkoutInFlight) return;
    var placement = clean(button.dataset.placement || 'unknown');

    if (!/^\d+$/.test(variantId)) {
      setStatus('The Collector Pack is unavailable right now. Please refresh and try again.', 'error');
      return;
    }

    checkoutInFlight = true;
    setBusy(true);
    setStatus('Opening secure checkout…', 'info');
    pushEvent('gym_badge_use_state_checkout_start', { cta_placement: placement });

    var attributionNeedsRetry = false;
    var alreadyInCart = false;

    updateCartAttributes(placement).catch(function () {
      attributionNeedsRetry = true;
      return fetchCart();
    }).then(function (cart) {
      alreadyInCart = cartContainsCollector(cart);
      if (alreadyInCart) {
        pushEvent('gym_badge_use_state_cart_existing', {
          cta_placement: placement,
          collector_already_in_cart: true
        });
        return null;
      }

      return addCollectorPack(placement).then(function () {
        pushEvent('gym_badge_use_state_cart_add', {
          cta_placement: placement,
          collector_already_in_cart: false
        });
        pushEvent('gym_badge_paid_lp_add', {
          cta_placement: placement,
          collector_already_in_cart: false
        });
      });
    }).then(function () {
      if (!attributionNeedsRetry) return null;
      return updateCartAttributes(placement).catch(function () { return null; });
    }).then(function () {
      pushEvent('gym_badge_use_state_checkout_redirect', {
        cta_placement: placement,
        collector_already_in_cart: alreadyInCart
      });
      pushEvent('gym_badge_paid_lp_checkout_redirect', {
        cta_placement: placement,
        collector_already_in_cart: alreadyInCart
      });
      window.location.assign(endpoint('checkout'));
    }).catch(function (error) {
      checkoutInFlight = false;
      setBusy(false);
      setStatus(checkoutErrorMessage(error), 'error');
      pushEvent('gym_badge_use_state_checkout_error', {
        cta_placement: placement,
        error_status: error && error.status ? error.status : '',
        error_name: error && error.name ? error.name : 'Error'
      });
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () { beginCheckout(button); });
  });

  function updateSticky() {
    if (!sticky || !stickyButton || !inlineButtons.length) return;
    var stickyHeight = sticky.getBoundingClientRect().height || 72;
    var usableBottom = Math.max(0, window.innerHeight - stickyHeight);
    var anyInlineButtonVisible = inlineButtons.some(function (button) {
      var rect = button.getBoundingClientRect();
      return rect.top < usableBottom && rect.bottom > 0;
    });
    var firstButtonPassed = inlineButtons[0].getBoundingClientRect().bottom <= 0;
    var isMobile = window.matchMedia('(max-width: 749px)').matches;
    var shouldShow = !anyInlineButtonVisible && (isMobile || firstButtonPassed);

    sticky.classList.toggle('is-visible', shouldShow);
    sticky.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    stickyButton.tabIndex = shouldShow ? 0 : -1;
  }

  var stickyFrame = null;
  function requestStickyUpdate() {
    if (stickyFrame) return;
    stickyFrame = window.requestAnimationFrame(function () {
      stickyFrame = null;
      updateSticky();
    });
  }

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(requestStickyUpdate, { threshold: [0, 0.01, 0.25, 1] });
    inlineButtons.forEach(function (button) { observer.observe(button); });
  }
  window.addEventListener('scroll', requestStickyUpdate, { passive: true });
  window.addEventListener('resize', requestStickyUpdate, { passive: true });

  window.addEventListener('pageshow', function () {
    checkoutInFlight = false;
    setBusy(false);
    setStatus('', 'info');
    requestStickyUpdate();
  });

  pushEvent('gym_badge_use_state_view');
  pushEvent('gym_badge_paid_lp_view');
  requestStickyUpdate();
})();
