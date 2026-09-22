(() => {
  const mount = (root) => {
    if (root.dataset.crestMounted) return;
    root.dataset.crestMounted = 'true';
    const cleanups = [];
    let disposed = false;
    root._crestCleanup = () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      delete root.dataset.crestMounted;
    };
    const listen = (element, type, handler) => {
      if (!element) return;
      element.addEventListener(type, handler);
      cleanups.push(() => element.removeEventListener(type, handler));
    };
    const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    // Decode the correctly sized source before changing the visible image or its labels.
    const imageSwapper = (display, container, status) => {
      let sequence = 0;
      let cancelPending;
      cleanups.push(() => {
        sequence += 1;
        cancelPending?.();
        container?.removeAttribute('aria-busy');
        if (status) status.textContent = '';
      });
      return async (source, label, commit) => {
        if (!display || !source || disposed) return false;
        const request = ++sequence;
        cancelPending?.();
        container?.setAttribute('aria-busy', 'true');
        if (status) status.textContent = '';
        const candidate = new Image();
        candidate.decoding = 'async';
        try {
          const loaded = await new Promise((resolve) => {
            cancelPending = () => {
              candidate.onload = null;
              candidate.onerror = null;
              candidate.removeAttribute('srcset');
              candidate.removeAttribute('src');
              resolve(false);
            };
            candidate.onload = () => resolve(true);
            candidate.onerror = () => resolve(false);
            candidate.sizes = display.sizes || '100vw';
            candidate.srcset = source.srcset;
            candidate.src = source.src;
          });
          if (!loaded) throw new Error('Image unavailable');
          if (candidate.decode) await candidate.decode();
          if (disposed || request !== sequence) return false;
          display.srcset = candidate.srcset;
          display.src = candidate.src;
          display.alt = source.alt;
          commit();
          if (status) status.textContent = '';
          return true;
        } catch {
          if (!disposed && request === sequence && status) {
            status.textContent = 'Couldn’t load ' + label + '. Please try again.';
          }
          return false;
        } finally {
          candidate.onload = null;
          candidate.onerror = null;
          if (request === sequence) {
            cancelPending = undefined;
            container?.removeAttribute('aria-busy');
          }
        }
      };
    };
    const main = root.querySelector('[data-crest-main] img');
    const imageNote = root.querySelector('.dc-image-note');
    const swapGallery = imageSwapper(main, root.querySelector('[data-crest-main]'), root.querySelector('[data-crest-gallery-status]'));
    root.querySelectorAll('[data-crest-thumb]').forEach((button) => {
      listen(button, 'click', (event) => {
        const image = button.querySelector('img');
        swapGallery(image, image.alt, () => {
          const galleryLabel = root.querySelector('[data-crest-gallery-label]');
          if (galleryLabel) galleryLabel.textContent = 'Showing: ' + image.alt;
          if (imageNote) imageNote.textContent = image.alt;
          root.querySelectorAll('[data-crest-thumb]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        });
        if (event.detail > 0 && window.matchMedia('(max-width: 899px)').matches && main.getBoundingClientRect().top < 0) {
          main.scrollIntoView({ block: 'start', behavior: motion() });
        }
      });
    });
    const explorer = root.querySelector('[data-crest-explorer]');
    const explorerStage = root.querySelector('[data-crest-stage]');
    if (explorer) {
      const media = explorer.querySelector('[data-crest-explorer-image]');
      const display = explorer.querySelector('[data-crest-explorer-image] img');
      const options = [...explorer.querySelectorAll('[data-crest-explore]')];
      const rail = explorer.querySelector('.dc-explorer-options');
      const position = explorer.querySelector('[data-crest-position]');
      const swapExplorer = imageSwapper(display, media, root.querySelector('[data-crest-explorer-status]'));
      let selectedIndex = Math.max(0, options.findIndex((button) => button.getAttribute('aria-pressed') === 'true'));
      let requestedIndex = selectedIndex;
      let selectionSequence = 0;
      const revealOption = (button) => {
        if (!rail || rail.scrollWidth <= rail.clientWidth + 1) return;
        const frame = rail.getBoundingClientRect();
        const option = button.getBoundingClientRect();
        if (option.left >= frame.left && option.right <= frame.right) return;
        const offset = option.left + option.width / 2 - (frame.left + frame.width / 2);
        rail.scrollBy({ left: offset, behavior: motion() });
      };
      const chooseCrest = async (index, focus = false) => {
        if (!options.length) return;
        const choice = ++selectionSequence;
        requestedIndex = (index + options.length) % options.length;
        const nextIndex = requestedIndex;
        const button = options[nextIndex];
        if (focus) button.focus({ preventScroll: true });
        revealOption(button);
        const committed = await swapExplorer(button.querySelector('img'), button.dataset.crestName, () => {
          selectedIndex = nextIndex;
          explorer.dataset.selected = button.dataset.crestExplore;
          if (explorerStage) explorerStage.dataset.selected = button.dataset.crestExplore;
          explorer.querySelector('[data-crest-explorer-name]').textContent = button.dataset.crestName;
          explorer.querySelector('[data-crest-explorer-line]').textContent = button.dataset.crestLine;
          options.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
          if (position) {
            position.textContent = `${nextIndex + 1} / ${options.length}`;
            position.setAttribute('aria-label', `Crest ${nextIndex + 1} of ${options.length}`);
          }
        });
        if (!committed && choice === selectionSequence) requestedIndex = selectedIndex;
      };
      options.forEach((button, index) => {
        listen(button, 'click', () => chooseCrest(index));
        listen(button, 'keydown', (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: options.length - 1 }[event.key];
          if (target === undefined) return;
          event.preventDefault();
          chooseCrest(target, true);
        });
      });
      listen(explorer.querySelector('[data-crest-prev]'), 'click', () => chooseCrest(requestedIndex - 1));
      listen(explorer.querySelector('[data-crest-next]'), 'click', () => chooseCrest(requestedIndex + 1));
      if (position) {
        position.textContent = `${selectedIndex + 1} / ${options.length}`;
        position.setAttribute('aria-label', `Crest ${selectedIndex + 1} of ${options.length}`);
      }
      root.querySelectorAll('[data-preview-crest]').forEach((button) => {
        listen(button, 'click', () => {
          const index = options.findIndex((option) => option.dataset.crestExplore === button.dataset.previewCrest);
          if (index < 0) return;
          chooseCrest(index);
          media.focus({ preventScroll: true });
          media.scrollIntoView({ block: 'start', behavior: motion() });
        });
      });
    }
    const reviews = root.querySelector('.dc-testimonial-grid');
    if (reviews) {
      const moveReview = (direction) => {
        const card = reviews.querySelector('.dc-testimonial');
        if (!card) return;
        reviews.scrollBy({ left: direction * (card.getBoundingClientRect().width + parseFloat(getComputedStyle(reviews).columnGap || 0)), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      };
      const prev = root.querySelector('[data-review-prev]');
      const next = root.querySelector('[data-review-next]');
      const position = root.querySelector('[data-review-position]');
      const updateReviews = () => {
        const cards = [...reviews.querySelectorAll('.dc-testimonial')];
        const stride = cards[0]?.getBoundingClientRect().width + parseFloat(getComputedStyle(reviews).columnGap || 0);
        const atEnd = reviews.scrollLeft >= reviews.scrollWidth - reviews.clientWidth - 2;
        if (prev) prev.disabled = reviews.scrollLeft <= 2;
        if (next) next.disabled = atEnd;
        if (position && stride) {
          const first = Math.min(cards.length, Math.round(reviews.scrollLeft / stride) + 1);
          const visible = Math.max(1, Math.floor((reviews.clientWidth + 16) / stride));
          const last = Math.min(cards.length, first + visible - 1);
          const label = first === last ? `${first} / ${cards.length}` : `${first}–${last} / ${cards.length}`;
          if (position.textContent !== label) position.textContent = label;
        }
      };
      reviews.addEventListener('scroll', updateReviews, { passive: true });
      window.addEventListener('resize', updateReviews, { passive: true });
      cleanups.push(() => { reviews.removeEventListener('scroll', updateReviews); window.removeEventListener('resize', updateReviews); });
      updateReviews();
      root.querySelector('[data-review-prev]')?.addEventListener('click', () => moveReview(-1));
      root.querySelector('[data-review-next]')?.addEventListener('click', () => moveReview(1));
    }
    const select = root.querySelector('[data-crest-variant]');
    select?.addEventListener('change', () => {
      const option = select.selectedOptions[0];
      const available = option.dataset.available === 'true';
      root.querySelectorAll('[data-crest-price]').forEach((price) => { price.textContent = option.dataset.price; });
      root.querySelectorAll('[data-crest-add]').forEach((button) => {
        button.disabled = !available;
        const label = button.querySelector('span') || button;
        label.textContent = available ? 'Add to cart' : 'Currently unavailable';
      });
      const url = new URL(window.location.href);
      url.searchParams.set('variant', option.value);
      history.replaceState({}, '', url);
    });
    const sticky = root.querySelector('[data-crest-sticky]');
    const form = root.querySelector('.dc-form');
    const finalButton = root.querySelector('.dc-finale [data-crest-add]');
    if (sticky && form) {
      let scheduled = false;
      const update = () => {
        sticky.hidden = form.getBoundingClientRect().bottom > 0 || Boolean(finalButton && finalButton.getBoundingClientRect().top < window.innerHeight);
        scheduled = false;
      };
      const onScroll = () => {
        if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      cleanups.push(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
      update();
    }
  };
  document.querySelectorAll('[data-crest-page]').forEach(mount);
  document.addEventListener('shopify:section:load', (event) => event.target.querySelectorAll('[data-crest-page]').forEach(mount));
  document.addEventListener('shopify:section:unload', (event) => event.target.querySelectorAll('[data-crest-page]').forEach((root) => root._crestCleanup?.()));
})();
