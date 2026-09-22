(() => {
  if (window.__crestDetailInstalled) return;
  window.__crestDetailInstalled = true;

  const mount = (root) => {
    if (root._crestDetailCleanup) return;
    const dialog = root.querySelector('[data-crest-detail]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const stage = dialog.querySelector('[data-detail-stage]');
    const image = dialog.querySelector('[data-detail-image]');
    const title = dialog.querySelector('[data-detail-title]');
    const count = dialog.querySelector('[data-detail-count]');
    const status = dialog.querySelector('[data-detail-status]');
    const zoom = dialog.querySelector('[data-detail-zoom]');
    const zoomLabel = dialog.querySelector('[data-detail-zoom-label]');
    const cleanups = [];
    let photos = [];
    let requestedIndex = 0;
    let displayedIndex = 0;
    let sequence = 0;
    let cancelPending;
    let returnFocus;
    let unlock;
    let disposed = false;

    const listen = (element, event, action) => {
      element.addEventListener(event, action);
      cleanups.push(() => element.removeEventListener(event, action));
    };
    const setZoom = (expanded) => {
      stage.classList.toggle('is-zoomed', expanded);
      zoom.setAttribute('aria-pressed', String(expanded));
      zoomLabel.textContent = expanded ? 'Fit image' : 'Zoom in';
      zoom.firstElementChild.textContent = expanded ? '−' : '＋';
      stage.scrollTop = expanded ? Math.max(0, stage.scrollHeight - stage.clientHeight) / 2 : 0;
      stage.scrollLeft = expanded ? Math.max(0, stage.scrollWidth - stage.clientWidth) / 2 : 0;
      if (!stage.hasAttribute('aria-busy')) status.textContent = expanded ? 'Scroll to inspect the details.' : '';
    };
    const lockPage = () => {
      const body = document.body;
      const x = window.scrollX;
      const y = window.scrollY;
      const old = ['position', 'top', 'left', 'width', 'padding-right'].map((name) => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
      const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;
      body.style.left = `-${x}px`;
      body.style.width = '100%';
      if (gutter) body.style.paddingRight = `${padding + gutter}px`;
      return () => {
        old.forEach(([name, value, priority]) => value ? body.style.setProperty(name, value, priority) : body.style.removeProperty(name));
        window.scrollTo({ left: x, top: y, behavior: 'instant' });
      };
    };
    const choose = async (index) => {
      if (!photos.length || disposed || !dialog.open) return;
      const request = ++sequence;
      cancelPending?.();
      requestedIndex = (index + photos.length) % photos.length;
      const nextIndex = requestedIndex;
      const source = photos[nextIndex];
      const candidate = new Image();
      candidate.decoding = 'async';
      stage.setAttribute('aria-busy', 'true');
      zoom.disabled = true;
      status.textContent = 'Loading full-size image…';
      try {
        const loaded = await new Promise((resolve) => {
          cancelPending = () => {
            candidate.onload = null;
            candidate.onerror = null;
            candidate.removeAttribute('src');
            resolve(false);
          };
          candidate.onload = () => resolve(true);
          candidate.onerror = () => resolve(false);
          // The thumbnail src is the full 1254px master; its currentSrc is only the small responsive version.
          candidate.src = source.src;
        });
        if (!loaded) throw new Error('Image unavailable');
        if (candidate.decode) await candidate.decode();
        if (disposed || request !== sequence || !dialog.open) return;
        image.src = candidate.src;
        image.alt = source.alt;
        image.hidden = false;
        stage.style.setProperty('--detail-native-width', `${candidate.naturalWidth}px`);
        title.textContent = source.label;
        count.textContent = `${nextIndex + 1} / ${photos.length}`;
        count.setAttribute('aria-label', `Image ${nextIndex + 1} of ${photos.length}`);
        displayedIndex = nextIndex;
        setZoom(false);
        status.textContent = '';
      } catch {
        if (disposed || request !== sequence || !dialog.open) return;
        requestedIndex = displayedIndex;
        status.textContent = 'This image couldn’t load. Please try another image, or close and reopen the viewer.';
      } finally {
        candidate.onload = null;
        candidate.onerror = null;
        if (request === sequence) {
          cancelPending = undefined;
          stage.removeAttribute('aria-busy');
          zoom.disabled = image.hidden;
        }
      }
    };
    const finish = () => {
      sequence += 1;
      cancelPending?.();
      cancelPending = undefined;
      stage.removeAttribute('aria-busy');
      unlock?.();
      unlock = undefined;
      if (returnFocus?.isConnected && !disposed) returnFocus.focus({ preventScroll: true });
    };
    root.querySelectorAll('[data-crest-zoom]').forEach((trigger) => {
      listen(trigger, 'click', () => {
        if (dialog.open) return;
        const isExplorer = trigger.dataset.crestZoom === 'explorer';
        const options = [...root.querySelectorAll(isExplorer ? '[data-crest-explore]' : '[data-crest-thumb]')];
        photos = options.map((option) => {
          const source = option.querySelector('img');
          return { src: source.src, alt: source.alt, label: isExplorer ? `${option.dataset.crestName} crest` : source.alt };
        });
        if (!photos.length) return;
        requestedIndex = Math.max(0, options.findIndex((option) => option.getAttribute('aria-pressed') === 'true'));
        displayedIndex = requestedIndex;
        returnFocus = trigger;
        image.hidden = true;
        image.removeAttribute('src');
        title.textContent = photos[requestedIndex].label;
        count.textContent = `${requestedIndex + 1} / ${photos.length}`;
        count.setAttribute('aria-label', `Image ${requestedIndex + 1} of ${photos.length}`);
        setZoom(false);
        unlock = lockPage();
        dialog.showModal();
        choose(requestedIndex);
      });
    });
    listen(dialog.querySelector('[data-detail-close]'), 'click', () => dialog.close());
    listen(dialog, 'close', finish);
    listen(dialog.querySelector('[data-detail-prev]'), 'click', () => choose(requestedIndex - 1));
    listen(dialog.querySelector('[data-detail-next]'), 'click', () => choose(requestedIndex + 1));
    listen(zoom, 'click', () => setZoom(zoom.getAttribute('aria-pressed') !== 'true'));
    listen(dialog, 'keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Let the focused photograph scroll naturally while inspecting its full-size detail.
      if (stage.classList.contains('is-zoomed') && event.target === stage) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      choose(requestedIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    listen(dialog, 'click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    root._crestDetailCleanup = () => {
      disposed = true;
      if (dialog.open) dialog.close();
      finish();
      cleanups.forEach((cleanup) => cleanup());
      delete root._crestDetailCleanup;
    };
  };
  const roots = (scope) => [...(scope.matches?.('[data-crest-page]') ? [scope] : []), ...scope.querySelectorAll('[data-crest-page]')];
  roots(document).forEach(mount);
  document.addEventListener('shopify:section:load', (event) => roots(event.target).forEach(mount));
  document.addEventListener('shopify:section:unload', (event) => roots(event.target).forEach((root) => root._crestDetailCleanup?.()));
})();
