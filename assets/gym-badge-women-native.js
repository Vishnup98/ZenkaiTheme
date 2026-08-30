(function () {
  'use strict';

  function getShopifyRoot() {
    var root = window.Shopify && window.Shopify.routes && window.Shopify.routes.root
      ? window.Shopify.routes.root
      : '/';
    return root.charAt(root.length - 1) === '/' ? root : root + '/';
  }

  function initialize(root) {
    if (!root || root.dataset.gbWomenNativeInitialized === 'true') return;
    root.dataset.gbWomenNativeInitialized = 'true';

    var journeyRoot = document.querySelector('.gb-color-page[data-gb-theme^="women-"]');
    var proofSection = journeyRoot ? journeyRoot.querySelector('.gb-women-proof') : null;
    var shopifySection = root.closest ? root.closest('.shopify-section') : null;
    var movableSection = shopifySection || root;
    if (proofSection && movableSection.parentNode !== journeyRoot) {
      proofSection.insertAdjacentElement('afterend', movableSection);
    }

    var productSection = root.querySelector('.product-section');
    var productForm = productSection ? productSection.querySelector('.product-single__form') : null;
    var productSelect = productSection ? productSection.querySelector('[data-product-select]') : null;
    var mainButton = productSection ? productSection.querySelector('[data-add-to-cart]') : null;
    var mainButtonLabel = mainButton ? mainButton.querySelector('[data-add-to-cart-text]') : null;
    var status = root.querySelector('[data-gb-women-native-status]');
    var collectorId = root.dataset.gbWomenNativeCollectorId || '';
    var checkoutInFlight = false;

    function showStatus(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
      status.classList.toggle('is-error', Boolean(isError));
    }

    function setBusy(isBusy) {
      if (!mainButton) return;
      if (!mainButton.dataset.gbWomenNativeLabel) {
        mainButton.dataset.gbWomenNativeLabel = mainButtonLabel
          ? mainButtonLabel.textContent.trim()
          : mainButton.textContent.trim();
      }
      mainButton.disabled = isBusy;
      mainButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      if (mainButtonLabel) {
        mainButtonLabel.textContent = isBusy ? 'Opening checkout…' : mainButton.dataset.gbWomenNativeLabel;
      }
    }

    function isCollectorLabel(value) {
      var label = String(value || '').toLowerCase();
      return label.indexOf('collector') !== -1 ||
        label.indexOf('4 region') !== -1 ||
        label.indexOf('4-region') !== -1 ||
        label.indexOf('all four') !== -1;
    }

    function forceCollectorSelection() {
      if (productSelect && collectorId && productSelect.value !== collectorId) {
        productSelect.value = collectorId;
      }

      var inputs = productSection ? productSection.querySelectorAll('[data-variant-input]') : [];
      for (var index = 0; index < inputs.length; index += 1) {
        if (!isCollectorLabel(inputs[index].value)) continue;
        inputs[index].checked = true;
        break;
      }
    }

    function setMainButtonLabel(input) {
      if (!mainButton || !mainButtonLabel || !input) return;
      var label = isCollectorLabel(input.value)
        ? 'Get All 32'
        : 'Get ' + String(input.value || '').trim() + ' Set';
      mainButton.dataset.gbWomenNativeLabel = label;
      mainButton.setAttribute('data-cta-label', label);
      if (!checkoutInFlight) mainButtonLabel.textContent = label;
    }

    function queueMainButtonLabel(input) {
      window.setTimeout(function () {
        if (input.checked) setMainButtonLabel(input);
      }, 0);
    }

    function enhanceVariantPicker() {
      if (!productSection) return;
      var fieldset = productSection.querySelector('.variant-input-wrap');
      if (!fieldset || fieldset.dataset.gbWomenNativePicker === 'true') return;

      var collectorOption = fieldset.querySelector('.variant-input--collector');
      var regionOptions = Array.prototype.filter.call(fieldset.children, function (child) {
        return child.classList &&
          child.classList.contains('variant-input') &&
          !child.classList.contains('variant-input--collector');
      });
      if (!collectorOption || !regionOptions.length) return;

      fieldset.dataset.gbWomenNativePicker = 'true';
      fieldset.classList.add('gb-women-native-picker');

      var legend = fieldset.querySelector('legend');
      if (legend) {
        legend.classList.remove('hidden-label');
        legend.textContent = 'Choose your collection';
        legend.insertAdjacentElement('afterend', collectorOption);
      } else {
        fieldset.insertBefore(collectorOption, fieldset.firstChild);
      }

      var details = document.createElement('details');
      details.className = 'gb-women-native-regions';
      var summary = document.createElement('summary');
      summary.textContent = 'Only want one region? See the 8-badge sets';
      var choices = document.createElement('div');
      choices.className = 'gb-women-native-regions__choices';

      regionOptions.forEach(function (option) {
        choices.appendChild(option);
        var input = option.querySelector('[data-variant-input]');
        if (input) {
          input.addEventListener('change', function () {
            if (!input.checked) return;
            details.open = true;
            queueMainButtonLabel(input);
          });
        }
      });

      var collectorInput = collectorOption.querySelector('[data-variant-input]');
      if (collectorInput) {
        collectorInput.addEventListener('change', function () {
          if (!collectorInput.checked) return;
          details.open = false;
          queueMainButtonLabel(collectorInput);
        });
        if (collectorInput.checked) setMainButtonLabel(collectorInput);
      }

      details.appendChild(summary);
      details.appendChild(choices);
      fieldset.appendChild(details);
    }

    function getSelectedVariantId() {
      if (productSelect && productSelect.value) return productSelect.value;
      return collectorId;
    }

    function directCheckout() {
      if (checkoutInFlight) return;
      var variantId = getSelectedVariantId();
      if (!/^\d+$/.test(String(variantId))) {
        showStatus('Please choose a collection before continuing.', true);
        return;
      }

      checkoutInFlight = true;
      setBusy(true);
      showStatus('Adding your collection and opening secure checkout…', false);

      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'gym_badge_women_native_checkout_start',
          landing_page_variant: root.dataset.gbWomenNativeVariant || '',
          product_variant_id: String(variantId)
        });
      }

      var shopifyRoot = getShopifyRoot();
      window.fetch(shopifyRoot + 'cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
      })
        .then(function (response) {
          return response.json().then(function (payload) {
            if (!response.ok) {
              throw new Error(payload.description || payload.message || 'Could not add this collection.');
            }
            return payload;
          });
        })
        .then(function () {
          window.location.assign(shopifyRoot + 'checkout');
        })
        .catch(function (error) {
          checkoutInFlight = false;
          setBusy(false);
          showStatus(
            error && error.message
              ? error.message + ' Please try again.'
              : 'Checkout could not open. Please try again.',
            true
          );
        });
    }

    forceCollectorSelection();
    enhanceVariantPicker();

    if (mainButton && productForm) {
      mainButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        directCheckout();
      }, true);
    }

    window.requestAnimationFrame(function () {
      if (window.Shopify && window.Shopify.PaymentButton && typeof window.Shopify.PaymentButton.init === 'function') {
        window.Shopify.PaymentButton.init();
      }
    });
  }

  document.querySelectorAll('[data-gb-women-native-product]').forEach(initialize);
  document.addEventListener('shopify:section:load', function (event) {
    var root = event.target.querySelector('[data-gb-women-native-product]');
    if (root) initialize(root);
  });
})();
