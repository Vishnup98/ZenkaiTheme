(function () {
  "use strict";
  function init(root) {
    if (!root || root.dataset.ecReady) return;
    root.dataset.ecReady = "true";
    var sticky = root.querySelector("[data-ec-sticky]");
    var header = document.querySelector(".ec-header");
    var stickyFrame;
    function updateSticky() {
      if (!sticky) return;
      var viewport = window.visualViewport;
      var visibleTop = viewport ? viewport.offsetTop : 0;
      var left = viewport ? viewport.offsetLeft : 0;
      var right = left + (viewport ? viewport.width : window.innerWidth);
      var bottom =
        visibleTop + (viewport ? viewport.height : window.innerHeight);
      var headerRect = header && header.getBoundingClientRect();
      var top =
        headerRect && headerRect.bottom > visibleTop && headerRect.top < bottom
          ? Math.max(visibleTop, headerRect.bottom)
          : visibleTop;
      var inline = root.querySelectorAll(
        "[data-ec-main-cta], [data-ec-inline-cta], .shopify-payment-button shopify-accelerated-checkout, .shopify-payment-button button, .shopify-payment-button iframe",
      );
      var usable = Array.from(inline).some(function (button) {
        var rect = button.getBoundingClientRect(),
          style = window.getComputedStyle(button);
        return (
          !button.disabled &&
          !button.closest("[hidden]") &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.height >= 40 &&
          rect.width >= 80 &&
          rect.top >= top &&
          rect.bottom <= bottom &&
          rect.left >= left &&
          rect.right <= right
        );
      });
      sticky.hidden =
        usable || !!(root.querySelector("[data-ec-lightbox]") || {}).open;
    }
    function requestStickyUpdate() {
      if (stickyFrame) return;
      stickyFrame = window.requestAnimationFrame(function () {
        stickyFrame = null;
        updateSticky();
      });
    }
    window.addEventListener("scroll", requestStickyUpdate, { passive: true });
    window.addEventListener("resize", requestStickyUpdate);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", requestStickyUpdate);
      window.visualViewport.addEventListener("scroll", requestStickyUpdate);
    }
    var sizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(requestStickyUpdate)
        : null;
    if (sizeObserver) {
      sizeObserver.observe(root);
      if (header) sizeObserver.observe(header);
    }
    var paymentObserver = new MutationObserver(requestStickyUpdate);
    paymentObserver.observe(root, { childList: true, subtree: true });
    updateSticky();

    var gallery = root.querySelector("[data-ec-gallery]");
    var controls = root.querySelector("[data-ec-gallery-controls]");
    var galleryResize;
    if (gallery && controls) {
      var previous = controls.querySelector("[data-ec-gallery-prev]");
      var next = controls.querySelector("[data-ec-gallery-next]");
      var position = controls.querySelector("[data-ec-gallery-position]");
      var slides = Array.from(gallery.children);
      function updateGallery() {
        var bounds = gallery.getBoundingClientRect();
        var visible = slides
          .map(function (slide, index) {
            var rect = slide.getBoundingClientRect();
            return Math.min(rect.right, bounds.right) -
              Math.max(rect.left, bounds.left) >
              rect.width / 2
              ? index
              : -1;
          })
          .filter(function (index) {
            return index >= 0;
          });
        previous.disabled = gallery.scrollLeft <= 2;
        next.disabled =
          gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 2;
        if (visible.length) {
          var start = visible[0] + 1,
            end = visible[visible.length - 1] + 1;
          position.textContent =
            (start === end ? start : start + "–" + end) +
            " of " +
            slides.length;
        }
      }
      function moveGallery(direction) {
        var step =
          slides.length > 1
            ? slides[1].offsetLeft - slides[0].offsetLeft
            : gallery.clientWidth;
        gallery.scrollBy({
          left: direction * step,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      }
      previous.addEventListener("click", function () {
        moveGallery(-1);
      });
      next.addEventListener("click", function () {
        moveGallery(1);
      });
      gallery.addEventListener("scroll", updateGallery, { passive: true });
      gallery.addEventListener("keydown", function (event) {
        if (event.target !== gallery) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          moveGallery(event.key === "ArrowRight" ? 1 : -1);
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          gallery.scrollTo({
            left: event.key === "Home" ? 0 : gallery.scrollWidth,
            behavior: "auto",
          });
        }
      });
      controls.hidden = false;
      if (typeof ResizeObserver === "function") {
        galleryResize = new ResizeObserver(updateGallery);
        galleryResize.observe(gallery);
      }
      updateGallery();
    }
    var form = root.querySelector(".ec-product-form");
    if (form) {
      var allowed = [
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
      allowed.forEach(function (key) {
        var value = params.get(key);
        if (!value) return;
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = "properties[_zk_" + key + "]";
        input.value = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
        form.appendChild(input);
      });
      var submitted = false;
      var busyButton = null;
      var originalButtonHTML = null;
      form.addEventListener("submit", function (event) {
        if (root.dataset.preview === "true") {
          event.preventDefault();
          var note = document.querySelector("[data-ec-preview-status]");
          if (note) {
            note.hidden = false;
            note.textContent =
              "Review preview only — no cart or checkout was submitted.";
          }
          return;
        }
        if (submitted) {
          event.preventDefault();
          return;
        }
        submitted = true;
        busyButton = event.submitter;
        if (busyButton && busyButton.classList.contains("ec-cta")) {
          originalButtonHTML = busyButton.innerHTML;
          busyButton.textContent = "Opening checkout…";
          busyButton.setAttribute("aria-busy", "true");
        }
        /* Native Shopify product POST preserves a no-JavaScript purchase path.
           No custom Meta events are fired: the configured pixel owns tracking. */
      });
      window.addEventListener("pageshow", function () {
        submitted = false;
        if (busyButton && originalButtonHTML !== null) {
          busyButton.innerHTML = originalButtonHTML;
          busyButton.removeAttribute("aria-busy");
        }
        busyButton = null;
        originalButtonHTML = null;
      });
    }
    var dialog = root.querySelector("[data-ec-lightbox]");
    if (dialog && typeof dialog.showModal === "function") {
      var zoomToggle = dialog.querySelector("[data-ec-zoom-toggle]");
      var photoViewport = dialog.querySelector(".ec-lightbox-viewport");
      function resetZoom() {
        dialog.classList.remove("is-zoomed");
        zoomToggle.setAttribute("aria-pressed", "false");
        zoomToggle.textContent = "Zoom in";
        photoViewport.scrollTo(0, 0);
      }
      zoomToggle.addEventListener("click", function () {
        var zoomed = dialog.classList.toggle("is-zoomed");
        zoomToggle.setAttribute("aria-pressed", String(zoomed));
        zoomToggle.textContent = zoomed ? "Fit photo" : "Zoom in";
        if (!zoomed) photoViewport.scrollTo(0, 0);
      });
      root.querySelectorAll("[data-ec-zoom]").forEach(function (button) {
        button.addEventListener("click", function () {
          resetZoom();
          var photo = dialog.querySelector("img");
          photo.src = button.dataset.ecZoom;
          photo.alt = button.querySelector("img").alt;
          photo.width = button.querySelector("img").getAttribute("width");
          photo.height = button.querySelector("img").getAttribute("height");
          dialog.showModal();
          requestStickyUpdate();
        });
      });
      dialog
        .querySelector("[data-ec-close]")
        .addEventListener("click", function () {
          dialog.close();
        });
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", requestStickyUpdate);
    }
    root._ecCleanup = function () {
      window.removeEventListener("scroll", requestStickyUpdate);
      window.removeEventListener("resize", requestStickyUpdate);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          requestStickyUpdate,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          requestStickyUpdate,
        );
      }
      if (stickyFrame) window.cancelAnimationFrame(stickyFrame);
      if (sizeObserver) sizeObserver.disconnect();
      if (galleryResize) galleryResize.disconnect();
      paymentObserver.disconnect();
    };
  }
  function boot() {
    document.querySelectorAll("[data-ec-page]").forEach(init);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
  document.addEventListener("shopify:section:load", boot);
  document.addEventListener("shopify:section:unload", function (event) {
    var root = event.target.querySelector("[data-ec-page]");
    if (root && root._ecCleanup) root._ecCleanup();
  });
})();
