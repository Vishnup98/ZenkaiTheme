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
    const videoDetails = root.querySelector('[data-crest-video-details]');
    const productVideo = root.querySelector('[data-crest-product-video]');
    if (videoDetails && productVideo) {
      let resumeVideoOnReturn = false;
      listen(videoDetails, 'toggle', () => {
        if (videoDetails.open) productVideo.play()?.catch(() => {});
        else productVideo.pause();
      });
      listen(window, 'pagehide', () => {
        resumeVideoOnReturn = videoDetails.open && !productVideo.paused;
        productVideo.pause();
      });
      listen(window, 'pageshow', () => {
        if (resumeVideoOnReturn && videoDetails.open) productVideo.play()?.catch(() => {});
        resumeVideoOnReturn = false;
      });
      cleanups.push(() => productVideo.pause());
    }
    const canWarmImages = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return !connection?.saveData && !/(^|-)2g$/.test(connection?.effectiveType || '');
    };
    const warmWhenNear = (element, warm) => {
      if (!element || !canWarmImages() || !('IntersectionObserver' in window)) return;
      const observer = new IntersectionObserver((entries) => {
        if (disposed || !entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (canWarmImages()) warm();
      }, { rootMargin: '300px' });
      observer.observe(element);
      cleanups.push(() => observer.disconnect());
    };
    // Keep display-size candidates: tiny thumbnails must never determine the full photo's size.
    const imageSwapper = (display, container, status) => {
      const cache = new Map();
      let sequence = 0;
      let loadingTimer;
      let activeEntry;
      let warmSources = [];
      let intentSource;
      const clearLoading = () => {
        clearTimeout(loadingTimer);
        loadingTimer = undefined;
        container?.removeAttribute('aria-busy');
        container?.removeAttribute('data-loading-visible');
      };
      const keyFor = (source) => JSON.stringify([
        source.src, source.srcset, display.sizes || '100vw', window.innerWidth, window.devicePixelRatio || 1
      ]);
      const isDisplayed = (source) => display && source.src === display.src && display.complete && display.naturalWidth > 0;
      const candidateFor = (source, priority) => {
        const key = keyFor(source);
        const cached = cache.get(key);
        if (cached) {
          if (priority === 'high') cached.image.fetchPriority = 'high';
          return cached;
        }
        const image = new Image();
        const entry = { key, image, ready: false, settled: false };
        image.decoding = 'async';
        image.fetchPriority = priority;
        cache.set(key, entry);
        entry.promise = new Promise((resolve) => {
          let loadTimer;
          let decodeTimer;
          const valid = () => image.complete && image.naturalWidth > 0;
          const finish = (loaded) => {
            if (entry.settled) return;
            entry.settled = true;
            entry.ready = loaded;
            clearTimeout(loadTimer);
            clearTimeout(decodeTimer);
            image.onload = null;
            image.onerror = null;
            if (!loaded) {
              if (cache.get(key) === entry) cache.delete(key);
              image.removeAttribute('srcset');
              image.removeAttribute('src');
            }
            resolve(loaded);
          };
          entry.cancel = () => finish(false);
          image.onload = () => {
            if (entry.settled) return;
            clearTimeout(loadTimer);
            if (!valid() || disposed) { finish(false); return; }
            if (!image.decode) { finish(true); return; }
            // A usable loaded image must not wait indefinitely for an optional decode promise.
            decodeTimer = setTimeout(() => finish(!disposed && valid()), 250);
            try {
              Promise.resolve(image.decode()).then(
                () => finish(!disposed && valid()),
                () => finish(!disposed && valid())
              );
            } catch {
              finish(!disposed && valid());
            }
          };
          image.onerror = () => finish(false);
          loadTimer = setTimeout(() => finish(false), 15000);
          image.sizes = display.sizes || '100vw';
          image.srcset = source.srcset;
          image.src = source.src;
        });
        return entry;
      };
      const prepareSpeculation = () => {
        if (!display || disposed || !canWarmImages()) return;
        const prepared = [];
        const keys = new Set();
        let pending = 0;
        // Explicit pointer/keyboard intent takes one of the two speculative slots before neighbors.
        [intentSource, ...warmSources].filter(Boolean).forEach((source) => {
          if (isDisplayed(source)) return;
          const key = keyFor(source);
          if (keys.has(key) || activeEntry?.key === key) return;
          const entry = cache.get(key);
          if (!entry?.ready && pending >= 2) return;
          keys.add(key);
          if (!entry?.ready) pending += 1;
          prepared.push({ source, priority: source === intentSource ? 'high' : 'low' });
        });
        cache.forEach((entry) => {
          if (!entry.ready && entry !== activeEntry && !keys.has(entry.key)) entry.cancel();
        });
        prepared.forEach(({ source, priority }) => candidateFor(source, priority));
      };
      const swap = async (source, label, commit) => {
        if (!display || !source || disposed) return false;
        const request = ++sequence;
        const nextKey = keyFor(source);
        if (activeEntry && activeEntry.key !== nextKey) activeEntry.cancel();
        clearLoading();
        if (status) status.textContent = '';
        intentSource = undefined;
        // Re-selecting the already-rendered photo needs neither a request nor another decode.
        if (isDisplayed(source)) {
          activeEntry = undefined;
          display.alt = source.alt;
          commit();
          prepareSpeculation();
          return true;
        }
        container?.setAttribute('aria-busy', 'true');
        const candidate = candidateFor(source, 'high');
        activeEntry = candidate;
        prepareSpeculation();
        if (!candidate.ready) {
          loadingTimer = setTimeout(() => {
            if (!disposed && request === sequence && !candidate.ready) container?.setAttribute('data-loading-visible', 'true');
          }, 220);
        }
        try {
          const loaded = candidate.ready || await candidate.promise;
          if (disposed || request !== sequence) return false;
          if (!loaded) throw new Error('Image unavailable');
          display.srcset = candidate.image.srcset;
          display.src = candidate.image.src;
          display.alt = source.alt;
          commit();
          return true;
        } catch {
          if (!disposed && request === sequence && status) {
            status.textContent = 'Couldn’t load ' + label + '. Please try again.';
          }
          return false;
        } finally {
          if (request === sequence) {
            activeEntry = undefined;
            clearLoading();
          }
        }
      };
      swap.warm = (sources) => {
        if (!display || disposed || !canWarmImages()) return;
        warmSources = sources.filter(Boolean).slice(0, 2);
        prepareSpeculation();
      };
      swap.prime = (source) => {
        if (!display || !source || disposed || !canWarmImages()) return;
        intentSource = source;
        prepareSpeculation();
      };
      cleanups.push(() => {
        sequence += 1;
        clearLoading();
        cache.forEach((entry) => entry.cancel());
        cache.clear();
        if (status) status.textContent = '';
      });
      return swap;
    };
    const main = root.querySelector('[data-crest-main] img');
    const gallery = root.querySelector('[data-crest-main]');
    const galleryOptions = [...root.querySelectorAll('[data-crest-thumb]')];
    const imageNote = root.querySelector('.dc-image-note');
    const swapGallery = imageSwapper(main, gallery, root.querySelector('[data-crest-gallery-status]'));
    let galleryIndex = Math.max(0, galleryOptions.findIndex((button) => button.getAttribute('aria-pressed') === 'true'));
    let galleryNear = false;
    const warmGallery = () => {
      if (!galleryNear || galleryOptions.length < 2) return;
      swapGallery.warm([
        galleryOptions[(galleryIndex + 1) % galleryOptions.length].querySelector('img'),
        galleryOptions[(galleryIndex === 0 ? 2 : galleryIndex + galleryOptions.length - 1) % galleryOptions.length].querySelector('img')
      ]);
    };
    warmWhenNear(gallery, () => { galleryNear = true; warmGallery(); });
    galleryOptions.forEach((button, index) => {
      const prime = () => swapGallery.prime(button.querySelector('img'));
      ['pointerenter', 'focus', 'pointerdown'].forEach((event) => listen(button, event, prime));
      listen(button, 'click', (event) => {
        const image = button.querySelector('img');
        swapGallery(image, image.alt, () => {
          galleryIndex = index;
          const galleryLabel = root.querySelector('[data-crest-gallery-label]');
          if (galleryLabel) galleryLabel.textContent = 'Showing: ' + image.alt;
          if (imageNote) imageNote.textContent = image.alt;
          galleryOptions.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
          warmGallery();
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
      let explorerNear = false;
      const warmExplorer = () => {
        if (!explorerNear || options.length < 2) return;
        swapExplorer.warm([
          options[(selectedIndex + 1) % options.length].querySelector('img'),
          options[(selectedIndex === 0 ? 2 : selectedIndex + options.length - 1) % options.length].querySelector('img')
        ]);
      };
      warmWhenNear(media, () => { explorerNear = true; warmExplorer(); });
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
          warmExplorer();
        });
        if (!committed && choice === selectionSequence) requestedIndex = selectedIndex;
      };
      options.forEach((button, index) => {
        const prime = () => swapExplorer.prime(button.querySelector('img'));
        ['pointerenter', 'focus', 'pointerdown'].forEach((event) => listen(button, event, prime));
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
