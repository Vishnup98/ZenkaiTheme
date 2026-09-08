(function () {
  'use strict';

  function initEvolutionCompanions(root) {
    if (!root || root.dataset.evoPlushInitialized === 'true') return;
    root.dataset.evoPlushInitialized = 'true';

    var mainImage = root.querySelector('[data-evo-plush-main-image]');
    var thumbs = root.querySelectorAll('[data-evo-plush-thumb]');

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
        }, 100);
      });
    });

    var photoRail = root.querySelector('.evo-plush-ugc__grid');
    var photoButtons = Array.from(root.querySelectorAll('[data-evo-plush-zoom]'));
    var photoDialog = root.querySelector('[data-evo-plush-lightbox]');
    var enlargedImage = root.querySelector('[data-evo-plush-enlarged]');
    var photoOpener;
    var previousBodyOverflow;
    if (photoDialog && enlargedImage) {
      photoButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          photoOpener = button;
          var sourcePhoto = button.querySelector('img');
          enlargedImage.width = sourcePhoto.naturalWidth || Number(sourcePhoto.getAttribute('width')) || 1200;
          enlargedImage.height = sourcePhoto.naturalHeight || Number(sourcePhoto.getAttribute('height')) || 1200;
          enlargedImage.src = button.dataset.evoPlushZoom;
          enlargedImage.alt = sourcePhoto.alt;
          previousBodyOverflow = document.body.style.overflow;
          document.body.style.overflow = 'hidden';
          photoDialog.showModal();
        });
      });
      photoDialog.querySelector('[data-evo-plush-close]').addEventListener('click', function () {
        photoDialog.close();
      });
      photoDialog.addEventListener('close', function () {
        document.body.style.overflow = previousBodyOverflow || '';
        if (photoOpener && photoOpener.isConnected) photoOpener.focus({ preventScroll: true });
      });
      photoDialog.addEventListener('click', function (event) {
        if (event.target !== photoDialog) return;
        var rect = photoDialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) photoDialog.close();
      });
    }
    if (photoRail) {
      photoRail.addEventListener('keydown', function (event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        var focusedIndex = photoButtons.indexOf(document.activeElement);
        var targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? photoButtons.length - 1 : Math.max(0, Math.min(photoButtons.length - 1, focusedIndex + (event.key === 'ArrowRight' ? 1 : -1)));
        if (focusedIndex >= 0 && photoButtons[targetIndex]) {
          photoButtons[targetIndex].focus({ preventScroll: true });
          photoButtons[targetIndex].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        } else {
          var distance = photoRail.firstElementChild ? photoRail.firstElementChild.getBoundingClientRect().width + 12 : photoRail.clientWidth;
          var left = event.key === 'Home' ? 0 : event.key === 'End' ? photoRail.scrollWidth : photoRail.scrollLeft + (event.key === 'ArrowRight' ? distance : -distance);
          photoRail.scrollTo({ left: left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
      });
    }

    var mainButton = root.querySelector('[data-add-to-cart]');
    var sticky = root.querySelector('[data-evo-plush-sticky]');
    var stickyButton = root.querySelector('[data-evo-plush-sticky-add]');

    if (stickyButton && mainButton) {
      stickyButton.addEventListener('click', function () {
        mainButton.click();
      });
    }

    if (sticky && mainButton && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        var show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', show);
        sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
      }, { threshold: 0 });
      observer.observe(mainButton);
    }
  }

  function boot() {
    document.querySelectorAll('[data-evo-plush-page]').forEach(initEvolutionCompanions);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initEvolutionCompanions(event.target.querySelector('[data-evo-plush-page]'));
  });
})();
