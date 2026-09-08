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
      var mainButton = root.querySelector("[data-ec-main-cta]");
      var mainPassed = mainButton && mainButton.getBoundingClientRect().bottom <= top;
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
        !mainPassed || usable || !!(root.querySelector("[data-ec-lightbox]") || {}).open;
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

    var galleryCleanups = [];
    root.querySelectorAll("[data-ec-gallery]").forEach(function (gallery) {
      var stage = gallery.closest(".ec-gallery-stage") || gallery.closest(".ec-included");
      var controls = stage && stage.querySelector("[data-ec-gallery-controls]");
      var previous = controls && controls.querySelector("[data-ec-gallery-prev]");
      var next = controls && controls.querySelector("[data-ec-gallery-next]");
      var position = controls && controls.querySelector("[data-ec-gallery-position]");
      var slides = Array.from(gallery.children);
      var thumbs = Array.from(root.querySelectorAll("[data-ec-thumb]")).filter(function (thumb) {
        return thumb.getAttribute("aria-controls") === gallery.id;
      });
      var galleryFrame;
      var galleryResize;
      var selectedThumb = null;
      var activeThumb = -1;
      var selectingThumb = false;
      var selectionCorrections = 0;
      var gallerySettleTimer;
      if (!slides.length) return;

      function maximumScroll() {
        return Math.max(0, gallery.scrollWidth - gallery.clientWidth);
      }
      function slideOffset(index) {
        return Math.max(0, Math.min(maximumScroll(),
          slides[index].getBoundingClientRect().left -
          slides[0].getBoundingClientRect().left));
      }
      function scrollToSlide(index) {
        if (thumbs.length) {
          selectedThumb = index;
          selectingThumb = true;
          selectionCorrections = 0;
          updateGallery();
          scheduleGallerySettle();
        }
        gallery.scrollTo({
          left: slideOffset(index),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto" : "smooth",
        });
      }
      function updateGallery() {
        var bounds = gallery.getBoundingClientRect();
        if (controls) controls.hidden = maximumScroll() <= 2;
        var visible = slides.map(function (slide, index) {
          var rect = slide.getBoundingClientRect();
          var overlap = Math.max(0, Math.min(rect.right, bounds.right) -
            Math.max(rect.left, bounds.left));
          return overlap >= Math.min(rect.width, gallery.clientWidth) / 2 && overlap > 0
            ? index : -1;
        }).filter(function (index) { return index >= 0; });
        if (previous) previous.disabled = gallery.scrollLeft <= 2;
        if (next) next.disabled = gallery.scrollLeft >= maximumScroll() - 2;
        if (visible.length) {
          gallery.dataset.ecPortraitMode = visible[0] === 0 ? "group" : "individual";
          var currentThumb = selectedThumb !== null &&
            (selectingThumb || visible.includes(selectedThumb)) ? selectedThumb : visible[0];
          thumbs.forEach(function (thumb, index) {
            thumb.setAttribute("aria-pressed", String(index === currentThumb));
          });
          if (thumbs[currentThumb] && currentThumb !== activeThumb) {
            activeThumb = currentThumb;
            var thumb = thumbs[currentThumb];
            var strip = thumb.parentElement;
            var thumbBounds = thumb.getBoundingClientRect();
            var stripBounds = strip.getBoundingClientRect();
            // Move only the thumbnail strip; never scroll the page vertically.
            if (thumbBounds.left < stripBounds.left + 3) {
              strip.scrollLeft += thumbBounds.left - stripBounds.left - 3;
            } else if (thumbBounds.right > stripBounds.right - 3) {
              strip.scrollLeft += thumbBounds.right - stripBounds.right + 3;
            }
          }
          if (position) {
            var start = visible[0] + 1;
            var end = visible[visible.length - 1] + 1;
            var label = (start === end ? start : start + "–" + end) + " of " + slides.length;
            if (position.textContent !== label) position.textContent = label;
          }
        }
      }
      function requestGalleryUpdate() {
        if (galleryFrame) return;
        galleryFrame = window.requestAnimationFrame(function () {
          galleryFrame = null;
          updateGallery();
        });
      }
      function moveGallery(direction) {
        releaseThumbSelection();
        var current = gallery.scrollLeft;
        var targets = slides.map(function (_, index) { return slideOffset(index); });
        var target = direction > 0
          ? targets.find(function (left) { return left > current + 2; })
          : targets.reverse().find(function (left) { return left < current - 2; });
        gallery.scrollTo({
          left: target === undefined ? (direction > 0 ? maximumScroll() : 0) : target,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto" : "smooth",
        });
      }
      function goPrevious() { moveGallery(-1); }
      function goNext() { moveGallery(1); }
      function settleGallery() {
        window.clearTimeout(gallerySettleTimer);
        if (selectedThumb !== null && selectionCorrections < 2 &&
          Math.abs(gallery.scrollLeft - slideOffset(selectedThumb)) > 3) {
          // Honor a deliberate selection after interrupted wheel momentum settles.
          selectingThumb = true;
          selectionCorrections += 1;
          gallery.scrollTo({ left: slideOffset(selectedThumb), behavior: "auto" });
          scheduleGallerySettle();
          requestGalleryUpdate();
          return;
        }
        selectingThumb = false;
        // The final desktop photos share a scroll limit; keep the chosen one active.
        if (selectedThumb !== null && Math.abs(gallery.scrollLeft - slideOffset(selectedThumb)) > 3) {
          selectedThumb = null;
        }
        requestGalleryUpdate();
      }
      function scheduleGallerySettle() {
        window.clearTimeout(gallerySettleTimer);
        gallerySettleTimer = window.setTimeout(settleGallery, 180);
      }
      function releaseThumbSelection() {
        selectedThumb = null;
        selectingThumb = false;
        selectionCorrections = 0;
        window.clearTimeout(gallerySettleTimer);
      }
      function onGalleryScroll() {
        requestGalleryUpdate();
        if (thumbs.length) scheduleGallerySettle();
      }
      function onGalleryKeydown(event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        var photoButton = event.target.closest("[data-ec-zoom]");
        if (event.target !== gallery && (!photoButton || !gallery.contains(photoButton))) return;
        event.preventDefault();
        var focusedIndex = photoButton ? slides.findIndex(function (slide) {
          return slide.contains(photoButton);
        }) : -1;
        var destination;
        if (event.key === "Home" || event.key === "End") {
          destination = event.key === "Home" ? 0 : slides.length - 1;
        } else if (focusedIndex >= 0) {
          destination = Math.max(0, Math.min(slides.length - 1,
            focusedIndex + (event.key === "ArrowRight" ? 1 : -1)));
        } else {
          moveGallery(event.key === "ArrowRight" ? 1 : -1);
          return;
        }
        if (photoButton) {
          var destinationButton = slides[destination].querySelector("[data-ec-zoom]");
          if (destinationButton) destinationButton.focus({ preventScroll: true });
        }
        scrollToSlide(destination);
      }
      var thumbHandlers = thumbs.map(function (thumb, index) {
        var handler = function () { if (slides[index]) scrollToSlide(index); };
        thumb.addEventListener("click", handler);
        return handler;
      });
      if (previous) previous.addEventListener("click", goPrevious);
      if (next) next.addEventListener("click", goNext);
      gallery.addEventListener("scroll", onGalleryScroll, { passive: true });
      gallery.addEventListener("keydown", onGalleryKeydown);
      if (thumbs.length) {
        gallery.addEventListener("pointerdown", releaseThumbSelection, { passive: true });
        gallery.addEventListener("wheel", releaseThumbSelection, { passive: true });
        gallery.addEventListener("scrollend", settleGallery);
      }
      if (controls) controls.hidden = false;
      if (typeof ResizeObserver === "function") {
        galleryResize = new ResizeObserver(function () {
          activeThumb = -1;
          requestGalleryUpdate();
        });
        galleryResize.observe(gallery);
        slides.forEach(function (slide) { galleryResize.observe(slide); });
      }
      updateGallery();
      galleryCleanups.push(function () {
        if (galleryFrame) window.cancelAnimationFrame(galleryFrame);
        window.clearTimeout(gallerySettleTimer);
        if (galleryResize) galleryResize.disconnect();
        if (previous) previous.removeEventListener("click", goPrevious);
        if (next) next.removeEventListener("click", goNext);
        gallery.removeEventListener("scroll", onGalleryScroll);
        gallery.removeEventListener("keydown", onGalleryKeydown);
        gallery.removeEventListener("pointerdown", releaseThumbSelection);
        gallery.removeEventListener("wheel", releaseThumbSelection);
        gallery.removeEventListener("scrollend", settleGallery);
        thumbs.forEach(function (thumb, index) {
          thumb.removeEventListener("click", thumbHandlers[index]);
        });
      });
    });
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
        "site_source_name",
        "experiment",
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
        dialog.style.removeProperty("--ec-zoom-width");
        zoomToggle.setAttribute("aria-pressed", "false");
        zoomToggle.textContent = "Zoom in";
        photoViewport.scrollTo(0, 0);
      }
      zoomToggle.addEventListener("click", function () {
        var image = dialog.querySelector("img");
        if (!dialog.classList.contains("is-zoomed")) {
          var fittedWidth = image.getBoundingClientRect().width;
          var zoomWidth = Math.min(fittedWidth * 2, Math.max(image.naturalWidth, fittedWidth * 1.25));
          dialog.style.setProperty("--ec-zoom-width", zoomWidth + "px");
        }
        var zoomed = dialog.classList.toggle("is-zoomed");
        zoomToggle.setAttribute("aria-pressed", String(zoomed));
        zoomToggle.textContent = zoomed ? "Fit photo" : "Zoom in";
        if (zoomed) {
          photoViewport.scrollTo({
            left: Math.max(0, (photoViewport.scrollWidth - photoViewport.clientWidth) / 2),
            top: Math.max(0, (photoViewport.scrollHeight - photoViewport.clientHeight) / 2),
            behavior: "auto",
          });
        } else photoViewport.scrollTo(0, 0);
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
      galleryCleanups.forEach(function (cleanup) { cleanup(); });
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
