(function () {
  "use strict";

  function init(root) {
    if (!root || root.dataset.lsReady) return;
    root.dataset.lsReady = "true";

    var sticky = root.querySelector("[data-ls-sticky]");
    var frame;
    function updateSticky() {
      if (!sticky) return;
      var viewport = window.visualViewport;
      var top = viewport ? viewport.offsetTop : 0;
      var bottom = top + (viewport ? viewport.height : window.innerHeight);
      var left = viewport ? viewport.offsetLeft : 0;
      var right = left + (viewport ? viewport.width : window.innerWidth);
      var visibleBuyControl = Array.from(
        root.querySelectorAll(
          "[data-ls-main-cta], [data-ls-inline-cta], .shopify-payment-button button, .shopify-payment-button iframe",
        ),
      ).some(function (control) {
        if (control.closest("[data-ls-sticky]") || control.disabled) return false;
        var rect = control.getBoundingClientRect();
        var style = window.getComputedStyle(control);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 80 &&
          rect.height > 38 &&
          rect.top >= top &&
          rect.bottom <= bottom &&
          rect.left >= left &&
          rect.right <= right
        );
      });
      var lightbox = root.querySelector("[data-ls-lightbox]");
      var upsell = root.querySelector('[data-ls-upsell]');
      sticky.hidden = visibleBuyControl || Boolean(lightbox && lightbox.open) || Boolean(upsell && upsell.open);
    }

    function requestStickyUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = null;
        updateSticky();
      });
    }
    if (sticky) {
      window.addEventListener("scroll", requestStickyUpdate, { passive: true });
      window.addEventListener("resize", requestStickyUpdate);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", requestStickyUpdate);
        window.visualViewport.addEventListener("scroll", requestStickyUpdate);
      }
      updateSticky();
    }

    var form = root.querySelector(".ls-product-form");
    if (form) {
      var tracked = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ad_id",
        "adset_id",
        "campaign_id",
        "placement",
      ];
      var params = new URLSearchParams(window.location.search);
      tracked.forEach(function (key) {
        var value = params.get(key);
        if (!value) return;
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = "properties[_zk_" + key + "]";
        input.value = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
        form.appendChild(input);
      });

      var submitting = false;
      var submitButton;
      var submitHtml;
      form.addEventListener("submit", function (event) {
        if (root.dataset.preview === "true" || submitting) {
          event.preventDefault();
          return;
        }
        submitting = true;
        submitButton = event.submitter;
        if (submitButton && submitButton.classList.contains("ls-cta")) {
          submitHtml = submitButton.innerHTML;
          submitButton.textContent = "Adding to cart…";
          submitButton.setAttribute("aria-busy", "true");
        }
      });
      window.addEventListener("pageshow", function () {
        submitting = false;
        if (submitButton && submitHtml) {
          submitButton.innerHTML = submitHtml;
          submitButton.removeAttribute("aria-busy");
        }
      });
    }

    var dialog = root.querySelector("[data-ls-lightbox]");
    if (dialog && typeof dialog.showModal === "function") {
      var dialogImage = dialog.querySelector("img");
      root.querySelectorAll("[data-ls-zoom]").forEach(function (button) {
        button.addEventListener("click", function () {
          var sourceImage = button.querySelector("img");
          dialogImage.src = button.dataset.lsZoom || sourceImage.currentSrc || sourceImage.src;
          dialogImage.alt = sourceImage.alt;
          dialog.showModal();
          requestStickyUpdate();
        });
      });
      dialog.querySelector("[data-ls-close]").addEventListener("click", function () {
        dialog.close();
      });
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", requestStickyUpdate);
    }
  }

  function boot() {
    document.querySelectorAll("[data-ls-page]").forEach(init);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("shopify:section:load", boot);
})();
