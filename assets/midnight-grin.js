(() => {
  'use strict';
  function initialize(root) {
    if (root.dataset.mgReady) return;
    const payload = root.querySelector('[data-mg-data]');
    const select = root.querySelector('[data-mg-variant]');
    const form = root.querySelector('.mg-form');
    if (!payload || !select || !form) return;
    let data;
    try { data = JSON.parse(payload.textContent); } catch (_) { return; }
    if (!Array.isArray(data.variants)) return;
    root.dataset.mgReady = 'true';
    const image = root.querySelector('.mg-hero-image');
    const mainAdd = root.querySelector('[data-mg-add]');
    const stickyAdd = root.querySelector('[data-mg-sticky-add]');
    const swatches = root.querySelector('.mg-swatches');
    let submitting = false;
    function buttonLabel(button, text) {
      if (!button) return;
      button.replaceChildren(document.createTextNode(text));
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      button.append(arrow);
    }
    function setImage(url, alt) {
      if (!image || !url) return;
      if (image.getAttribute('src') !== url && image.src !== url) {
        image.srcset = [360, 540, 720, 960, 1200].map(width => {
          const sized = new URL(url, window.location.href);
          sized.searchParams.set('width', width);
          return `${sized.href} ${width}w`;
        }).join(', ');
        image.src = url;
      }
      image.alt = alt;
    }
    function update(id, updateUrl = true) {
      const variant = data.variants.find(item => String(item.id) === String(id));
      if (!variant) return;
      select.value = String(variant.id);
      root.querySelector('[data-mg-price]').textContent = variant.price;
      root.querySelector('[data-mg-color]').textContent = variant.title;
      root.querySelector('[data-mg-sticky-label]').textContent = `${variant.title} · ${variant.price} · Ships free`;
      root.querySelectorAll('[data-mg-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mgSelect === String(variant.id))));
      root.querySelectorAll('[data-mg-color-link]').forEach(card => {
        const cardVariant = data.variants.find(item => String(item.id) === card.dataset.mgColorLink);
        const isCurrent = card.dataset.mgColorLink === String(variant.id);
        if (isCurrent) card.setAttribute('aria-current', 'true');
        else card.removeAttribute('aria-current');
        const state = card.querySelector('[data-mg-card-state]');
        if (state && cardVariant) state.textContent = !cardVariant.available ? 'Sold out' : isCurrent ? 'Selected' : 'Choose color';
      });
      mainAdd.disabled = !variant.available || submitting;
      stickyAdd.disabled = !variant.available || submitting;
      buttonLabel(mainAdd, `${variant.available ? 'Add to cart' : 'Sold out'} · ${variant.title}`);
      buttonLabel(stickyAdd, variant.available ? 'Add to cart' : 'Sold out');
      setImage(variant.image, `Midnight Grin washed baseball cap — ${variant.title}`);
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);
      }
    }
    select.addEventListener('change', () => update(select.value));
    root.querySelectorAll('[data-mg-select]').forEach(button => button.addEventListener('click', () => update(button.dataset.mgSelect)));
    root.querySelectorAll('[data-mg-color-link]').forEach(link => link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      update(link.dataset.mgColorLink);
      root.querySelector('.mg-buy').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      root.querySelector('[data-mg-select][aria-pressed="true"]').focus({ preventScroll: true });
    }));
    form.addEventListener('submit', event => {
      if (root.dataset.preview === 'true') { event.preventDefault(); return; }
      const variant = data.variants.find(item => String(item.id) === select.value);
      if (submitting || !variant || !variant.available) { event.preventDefault(); return; }
      // Keep Shopify's native product form submission; no gift, upsell, or app override.
      submitting = true;
      mainAdd.disabled = true;
      stickyAdd.disabled = true;
      buttonLabel(mainAdd, 'Adding to cart…');
      buttonLabel(stickyAdd, 'Adding…');
    });
    window.addEventListener('pageshow', () => { submitting = false; update(select.value, false); });
    window.addEventListener('popstate', () => update(new URL(window.location.href).searchParams.get('variant') || select.value, false));
    select.hidden = true;
    root.querySelector('.mg-native-label').hidden = true;
    swatches.hidden = false;
    const sticky = root.querySelector('[data-mg-sticky]');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        const entry = entries[0];
        sticky.hidden = entry.isIntersecting || entry.boundingClientRect.bottom > 0;
      }, { threshold: 0 }).observe(mainAdd);
    }
    const requestedVariant = new URL(window.location.href).searchParams.get('variant');
    const initialVariant = data.variants.some(item => String(item.id) === requestedVariant) ? requestedVariant : select.value;
    update(initialVariant, false);
  }
  document.querySelectorAll('[data-mg-product]').forEach(initialize);
  document.addEventListener('shopify:section:load', event => event.target.querySelectorAll('[data-mg-product]').forEach(initialize));
})();
