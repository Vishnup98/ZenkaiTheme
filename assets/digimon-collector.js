(() => {
  const mount = (root) => {
    if (root.dataset.crestMounted) return;
    root.dataset.crestMounted = 'true';
    const main = root.querySelector('[data-crest-main] img');
    const imageNote = root.querySelector('.dc-image-note');
    root.querySelectorAll('[data-crest-thumb]').forEach((button) => {
      button.addEventListener('click', () => {
        const image = button.querySelector('img');
        main.src = image.src;
        main.srcset = image.srcset;
        main.alt = image.alt;
        if (imageNote) imageNote.textContent = image.alt;
        root.querySelectorAll('[data-crest-thumb]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      });
    });
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
    if (sticky && form) {
      let scheduled = false;
      const update = () => {
        sticky.hidden = form.getBoundingClientRect().bottom > 0;
        scheduled = false;
      };
      const onScroll = () => {
        if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      root._crestCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      };
      update();
    }
  };
  document.querySelectorAll('[data-crest-page]').forEach(mount);
  document.addEventListener('shopify:section:load', (event) => event.target.querySelectorAll('[data-crest-page]').forEach(mount));
  document.addEventListener('shopify:section:unload', (event) => event.target.querySelectorAll('[data-crest-page]').forEach((root) => root._crestCleanup?.()));
})();
