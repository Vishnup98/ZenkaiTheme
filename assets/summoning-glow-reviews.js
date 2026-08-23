(() => {
  const initialize = (scope = document) => {
    scope.querySelectorAll('[data-sg-reviews]:not([data-sg-ready])').forEach((root) => {
      const grid = root.querySelector('[data-sg-review-grid]');
      const moreButton = root.querySelector('[data-sg-review-more]');
      const moreLabel = root.querySelector('[data-sg-review-more-label]');
      const visibleCount = root.querySelector('[data-sg-visible-count]');
      const revealStatus = root.querySelector('[data-sg-review-status]');
      const lightbox = root.querySelector('[data-sg-review-lightbox]');
      const lightboxImage = lightbox?.querySelector('[data-sg-lightbox-image]');
      const lightboxCaption = lightbox?.querySelector('[data-sg-lightbox-caption]');
      const lightboxCounter = lightbox?.querySelector('[data-sg-lightbox-counter]');
      const lightboxClose = lightbox?.querySelector('[data-sg-lightbox-close]');
      const lightboxPrevious = lightbox?.querySelector('[data-sg-lightbox-previous]');
      const lightboxNext = lightbox?.querySelector('[data-sg-lightbox-next]');
      const deferredBatches = Array.from(root.querySelectorAll('template[data-sg-review-batch]'))
        .sort((left, right) => Number(left.dataset.sgReviewBatch) - Number(right.dataset.sgReviewBatch));

      if (!grid) return;

      const totalReviews = Number(grid.dataset.sgReviewTotal) || grid.children.length;
      const photoButtons = [
        ...grid.querySelectorAll('[data-sg-review-photo]'),
        ...deferredBatches.flatMap((template) => Array.from(template.content.querySelectorAll('[data-sg-review-photo]'))),
      ];
      const photoItems = photoButtons.map((button) => ({
        src: button.dataset.fullSrc,
        alt: button.dataset.fullAlt || '',
        caption: button.dataset.caption || '',
      }));
      let nextBatchIndex = 0;
      let activePhotoIndex = 0;
      let lastPhotoTrigger = null;
      let imageTransitionTimer = null;

      const twoDigit = (number) => String(number).padStart(2, '0');

      const updateVisibleCount = () => {
        const currentCount = grid.children.length;
        if (visibleCount) visibleCount.textContent = `${currentCount} of ${totalReviews} shown`;
        return currentCount;
      };

      const updateRevealButton = () => {
        if (!moreButton || !moreLabel) return;

        const nextBatch = deferredBatches[nextBatchIndex];
        if (!nextBatch) {
          moreButton.hidden = true;
          return;
        }

        const nextCount = nextBatch.content.querySelectorAll('.sg-review-card').length;
        moreLabel.textContent = `Show ${nextCount} more collector setups`;
      };

      const cleanUpLightbox = () => {
        document.documentElement.classList.remove('sg-review-lightbox-open');
        window.clearTimeout(imageTransitionTimer);
        lightbox?.classList.remove('is-changing');

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
        if (!lightboxImage || !lightboxCaption || photoItems.length === 0) return;

        activePhotoIndex = (index + photoItems.length) % photoItems.length;
        const photo = photoItems[activePhotoIndex];
        lightbox?.classList.add('is-changing');
        window.clearTimeout(imageTransitionTimer);

        lightboxImage.onload = () => lightbox?.classList.remove('is-changing');
        lightboxImage.src = photo.src;
        lightboxImage.alt = photo.alt;
        lightboxCaption.textContent = photo.caption;
        if (lightboxCounter) {
          lightboxCounter.textContent = `${twoDigit(activePhotoIndex + 1)} / ${twoDigit(photoItems.length)}`;
        }

        imageTransitionTimer = window.setTimeout(() => lightbox?.classList.remove('is-changing'), 260);

        const hideArrows = photoItems.length < 2;
        if (lightboxPrevious) lightboxPrevious.hidden = hideArrows;
        if (lightboxNext) lightboxNext.hidden = hideArrows;
      };

      const openLightbox = (photoButton) => {
        if (!lightbox || !lightboxImage || !lightboxCaption) return;

        const photoIndex = photoItems.findIndex((photo) => photo.src === photoButton.dataset.fullSrc);
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

      const revealNextBatch = () => {
        const template = deferredBatches[nextBatchIndex];
        if (!template) return;

        const fragment = template.content.cloneNode(true);
        const newCards = Array.from(fragment.querySelectorAll('.sg-review-card'));
        newCards.forEach((card, index) => {
          card.classList.add('sg-review-card--revealed');
          card.style.setProperty('--sg-reveal-order', index);
        });

        grid.append(fragment);
        nextBatchIndex += 1;
        moreButton?.setAttribute('aria-expanded', 'true');

        const currentCount = updateVisibleCount();
        if (revealStatus) {
          revealStatus.textContent = currentCount === totalReviews
            ? `All ${totalReviews} collector reviews are now shown.`
            : `${currentCount} collector reviews are now shown.`;
        }

        updateRevealButton();
      };

      moreButton?.addEventListener('click', revealNextBatch);

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
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          showPhoto(activePhotoIndex - 1);
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          showPhoto(activePhotoIndex + 1);
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !lightbox?.open) return;

        event.preventDefault();
        closeLightbox();
      });

      lightbox?.addEventListener('close', cleanUpLightbox);
      updateVisibleCount();
      updateRevealButton();
      root.dataset.sgReady = 'true';
    });
  };

  initialize();

  if (!window.__summoningGlowReviewsSectionListener) {
    window.__summoningGlowReviewsSectionListener = true;
    document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  }
})();
