(() => {
  const initialize = (scope = document) => {
    scope.querySelectorAll('[data-sg-reviews]:not([data-sg-ready])').forEach((root) => {
      const grid = root.querySelector('[data-sg-review-grid]');
      const previousButton = root.querySelector('[data-sg-review-previous]');
      const nextButton = root.querySelector('[data-sg-review-next]');
      const status = root.querySelector('[data-sg-review-page-status]');
      const lightbox = root.querySelector('[data-sg-review-lightbox]');
      const lightboxImage = lightbox?.querySelector('[data-sg-lightbox-image]');
      const lightboxCaption = lightbox?.querySelector('[data-sg-lightbox-caption]');
      const lightboxClose = lightbox?.querySelector('[data-sg-lightbox-close]');
      const lightboxPrevious = lightbox?.querySelector('[data-sg-lightbox-previous]');
      const lightboxNext = lightbox?.querySelector('[data-sg-lightbox-next]');
      const deferredPages = Array.from(root.querySelectorAll('template[data-sg-review-page]'))
        .sort((left, right) => Number(left.dataset.sgReviewPage) - Number(right.dataset.sgReviewPage));

      if (!grid || !previousButton || !nextButton || !status || deferredPages.length === 0) return;

      const firstPage = document.createElement('template');
      Array.from(grid.children).forEach((card) => firstPage.content.append(card.cloneNode(true)));
      const pages = [firstPage, ...deferredPages];
      let currentPage = 0;
      let activePhotoIndex = 0;
      let lastPhotoTrigger = null;

      const getPhotoButtons = () => Array.from(grid.querySelectorAll('[data-sg-review-photo]'));

      const cleanUpLightbox = () => {
        document.documentElement.classList.remove('sg-review-lightbox-open');

        if (lightboxImage) {
          lightboxImage.removeAttribute('src');
          lightboxImage.alt = '';
        }

        if (lightboxCaption) lightboxCaption.textContent = '';

        const focusTarget = lastPhotoTrigger;
        lastPhotoTrigger = null;
        if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
      };

      const closeLightbox = () => {
        if (!lightbox?.open) return;

        if (typeof lightbox.close === 'function') {
          lightbox.close();
        } else {
          lightbox.removeAttribute('open');
          cleanUpLightbox();
        }
      };

      const showPhoto = (index) => {
        if (!lightboxImage || !lightboxCaption) return;

        const photoButtons = getPhotoButtons();
        if (photoButtons.length === 0) return;

        activePhotoIndex = (index + photoButtons.length) % photoButtons.length;
        const photoButton = photoButtons[activePhotoIndex];
        lightboxImage.src = photoButton.dataset.fullSrc;
        lightboxImage.alt = photoButton.dataset.fullAlt || '';
        lightboxCaption.textContent = photoButton.dataset.caption || '';

        const hideArrows = photoButtons.length < 2;
        if (lightboxPrevious) lightboxPrevious.hidden = hideArrows;
        if (lightboxNext) lightboxNext.hidden = hideArrows;
      };

      const openLightbox = (photoButton) => {
        if (!lightbox || !lightboxImage || !lightboxCaption) return;

        const photoButtons = getPhotoButtons();
        const photoIndex = photoButtons.indexOf(photoButton);
        if (photoIndex < 0) return;

        lastPhotoTrigger = photoButton;
        showPhoto(photoIndex);
        document.documentElement.classList.add('sg-review-lightbox-open');

        if (typeof lightbox.showModal === 'function') {
          if (!lightbox.open) lightbox.showModal();
        } else {
          lightbox.setAttribute('open', '');
        }
      };

      const renderPage = (pageIndex) => {
        if (pageIndex < 0 || pageIndex >= pages.length || pageIndex === currentPage) return;

        closeLightbox();
        grid.replaceChildren(pages[pageIndex].content.cloneNode(true));
        currentPage = pageIndex;
        previousButton.disabled = currentPage === 0;
        nextButton.disabled = currentPage === pages.length - 1;
        status.textContent = `Page ${currentPage + 1} of ${pages.length}`;
      };

      previousButton.addEventListener('click', () => renderPage(currentPage - 1));
      nextButton.addEventListener('click', () => renderPage(currentPage + 1));

      root.addEventListener('click', (event) => {
        const photoButton = event.target.closest('[data-sg-review-photo]');
        if (photoButton && grid.contains(photoButton)) openLightbox(photoButton);
      });

      lightboxClose?.addEventListener('click', closeLightbox);
      lightboxPrevious?.addEventListener('click', () => showPhoto(activePhotoIndex - 1));
      lightboxNext?.addEventListener('click', () => showPhoto(activePhotoIndex + 1));

      lightbox?.addEventListener('click', (event) => {
        if (event.target === lightbox) closeLightbox();
      });

      lightbox?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeLightbox();
          return;
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          showPhoto(activePhotoIndex - 1);
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          showPhoto(activePhotoIndex + 1);
        }
      });

      lightbox?.addEventListener('close', cleanUpLightbox);
      root.dataset.sgReady = 'true';
    });
  };

  initialize();

  if (!window.__summoningGlowReviewsSectionListener) {
    window.__summoningGlowReviewsSectionListener = true;
    document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  }
})();
