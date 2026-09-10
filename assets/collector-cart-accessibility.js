/* UpCart keeps its closed drawer off-screen inside #upCart's shadow root.
 * Its verified open-state signal is body.upcartPopupShow. Keep that closed
 * subtree out of keyboard navigation and the accessibility tree, including
 * cart items UpCart renders after initialization.
 */
(function () {
  'use strict';

  var host = null;
  var returnFocus = null;
  var wasOpen = false;

  function sync() {
    var currentHost = document.getElementById('upCart');
    if (!currentHost) return;
    host = currentHost;

    var isOpen = document.body.classList.contains('upcartPopupShow');
    if (!isOpen && wasOpen && document.activeElement === host) {
      if (returnFocus && returnFocus.isConnected && !returnFocus.closest('[inert]')) {
        returnFocus.focus({ preventScroll: true });
      } else if (host.shadowRoot && host.shadowRoot.activeElement) {
        host.shadowRoot.activeElement.blur();
      }
    }

    if (isOpen) {
      host.removeAttribute('inert');
      host.removeAttribute('aria-hidden');
    } else {
      host.setAttribute('inert', '');
      host.setAttribute('aria-hidden', 'true');
    }
    wasOpen = isOpen;
  }

  function init() {
    document.addEventListener('focusin', function (event) {
      if (!document.body.classList.contains('upcartPopupShow') && event.target !== host) {
        returnFocus = event.target;
      }
    });

    // Observe the public open-state class separately from lazy app mounting.
    new MutationObserver(sync).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
    new MutationObserver(function () {
      if (!host || !host.isConnected) sync();
    }).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
