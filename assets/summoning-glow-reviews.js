(() => {
  class SummoningGlowReviews {
    constructor(root) {
      this.root = root;
      this.cards = Array.from(root.querySelectorAll('[data-sg-review-card]'));
      this.filters = Array.from(root.querySelectorAll('[data-sg-filter]'));
      this.loadMoreButton = root.querySelector('[data-sg-load-more]');
      this.status = root.querySelector('[data-sg-review-status]');
      this.dialog = root.querySelector('[data-sg-lightbox]');
      this.dialogImage = root.querySelector('[data-sg-lightbox-image]');
      this.dialogCaption = root.querySelector('[data-sg-lightbox-caption]');
      this.photoButtons = Array.from(root.querySelectorAll('[data-sg-review-photo]'));
      this.pageSize = Math.max(1, Number.parseInt(root.dataset.pageSize, 10) || 6);
      this.visibleCount = this.pageSize;
      this.activeFilter = 'all';
      this.activePhotoIndex = 0;
      this.lastPhotoTrigger = null;

      root.dataset.sgReady = 'true';
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      this.filters.forEach((button) => {
        button.addEventListener('click', () => {
          this.activeFilter = button.dataset.sgFilter;
          this.visibleCount = this.pageSize;
          this.filters.forEach((filterButton) => {
            const active = filterButton === button;
            filterButton.classList.toggle('is-active', active);
            filterButton.setAttribute('aria-pressed', String(active));
          });
          this.render();
        });
      });

      this.loadMoreButton?.addEventListener('click', () => {
        this.visibleCount += this.pageSize;
        this.render();
      });

      this.photoButtons.forEach((button, index) => {
        button.addEventListener('click', () => this.openPhoto(index, button));
      });

      this.root.querySelector('[data-sg-lightbox-close]')?.addEventListener('click', () => this.closePhoto());
      this.root.querySelector('[data-sg-lightbox-previous]')?.addEventListener('click', () => this.stepPhoto(-1));
      this.root.querySelector('[data-sg-lightbox-next]')?.addEventListener('click', () => this.stepPhoto(1));

      this.dialog?.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.closePhoto();
      });

      this.dialog?.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.closePhoto();
      });

      this.dialog?.addEventListener('close', () => {
        this.dialogImage.removeAttribute('src');
        this.lastPhotoTrigger?.focus({ preventScroll: true });
      });

      this.dialog?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.closePhoto();
          return;
        }
        if (event.key === 'ArrowLeft') this.stepPhoto(-1);
        if (event.key === 'ArrowRight') this.stepPhoto(1);
      });
    }

    get filteredCards() {
      if (this.activeFilter === 'photos') {
        return this.cards.filter((card) => card.dataset.hasPhoto === 'true');
      }
      return this.cards;
    }

    render() {
      const filteredCards = this.filteredCards;
      const visibleCards = new Set(filteredCards.slice(0, this.visibleCount));

      this.cards.forEach((card) => {
        card.hidden = !visibleCards.has(card);
      });

      const shownCount = Math.min(this.visibleCount, filteredCards.length);
      if (this.status) this.status.textContent = `Showing ${shownCount} of ${filteredCards.length}`;
      if (this.loadMoreButton) this.loadMoreButton.hidden = shownCount >= filteredCards.length;
    }

    openPhoto(index, trigger) {
      if (!this.dialog || !this.dialogImage || !this.dialogCaption) return;
      this.activePhotoIndex = index;
      this.lastPhotoTrigger = trigger;
      this.updatePhoto();

      if (typeof this.dialog.showModal === 'function') {
        if (!this.dialog.open) this.dialog.showModal();
      } else {
        this.dialog.setAttribute('open', '');
      }
    }

    closePhoto() {
      if (!this.dialog) return;
      if (typeof this.dialog.close === 'function' && this.dialog.open) {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
    }

    stepPhoto(direction) {
      if (!this.photoButtons.length) return;
      this.activePhotoIndex = (this.activePhotoIndex + direction + this.photoButtons.length) % this.photoButtons.length;
      this.updatePhoto();
    }

    updatePhoto() {
      const button = this.photoButtons[this.activePhotoIndex];
      if (!button) return;
      this.dialogImage.src = button.dataset.photoSrc;
      this.dialogImage.alt = button.dataset.photoAlt;
      this.dialogCaption.textContent = button.dataset.photoCaption;
    }
  }

  const initialize = (scope = document) => {
    scope.querySelectorAll('[data-sg-reviews]:not([data-sg-ready])').forEach((root) => {
      new SummoningGlowReviews(root);
    });
  };

  initialize();

  if (!window.__summoningGlowReviewsSectionListener) {
    window.__summoningGlowReviewsSectionListener = true;
    document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  }
})();
