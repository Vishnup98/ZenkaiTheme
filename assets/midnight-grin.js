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
    const native = root.querySelector('[data-mg-native]');
    const bundle = root.querySelector('[data-mg-bundle]');
    const bundleAdd = root.querySelector('[data-mg-bundle-add]');
    const error = root.querySelector('[data-mg-error]');
    const cards = [...root.querySelectorAll('[data-mg-tier-card]')];
    const tiers = [...root.querySelectorAll('[data-mg-tier]')];
    const quantity = form.querySelector('[data-mg-quantity]');
    const decrease = form.querySelector('[data-mg-quantity-minus]');
    let submitting = false;
    let picks = [select.value];
    function buttonLabel(button, text) {
      if (!button) return;
      button.replaceChildren(document.createTextNode(text));
    }
    function setImage(url, alt) {
      if (!image || !url) return;
      // Always replace every responsive candidate: a stale srcset can override src.
      image.srcset = [360, 540, 720, 960, 1200].map(width => {
          const sized = new URL(url, window.location.href);
          sized.searchParams.set('width', width);
          return `${sized.href} ${width}w`;
        }).join(', ');
      image.src = url;
      image.alt = alt;
    }
    const variantFor = id => data.variants.find(item => String(item.id) === String(id));
    const activeCard = () => cards.find(card => card.querySelector('[data-mg-tier]').checked);
    const activeSlots = () => [...activeCard().querySelectorAll('[data-mg-slot]')];
    const currentCount = () => Number(activeCard().dataset.mgTierCard);
    function setError(message) { error.textContent = message; error.hidden = !message; }
    function formatMoney(cents) {
      try { return new Intl.NumberFormat(data.locale || 'en-US', { style: 'currency', currency: data.currency || 'USD' }).format(cents / 100); }
      catch (_) { return '$' + (cents / 100).toFixed(2); }
    }
    function syncPrices() {
      cards.forEach(card => {
        const count = Number(card.dataset.mgTierCard);
        const regular = [...card.querySelectorAll('[data-mg-slot]')].reduce((sum, slot) => {
          const variant = variantFor(slot.value);
          const thumbnail = slot.closest('.mg-bundle__slot').querySelector('[data-mg-slot-image]');
          if (variant?.image && thumbnail) {
            const imageUrl = new URL(variant.image, window.location.href);
            imageUrl.searchParams.set('width', '120');
            thumbnail.src = imageUrl.href;
          }
          return sum + Number(variant?.priceCents || 0);
        }, 0);
        const first = variantFor(card.querySelector('[data-mg-slot]').value);
        const choiceImage = card.querySelector('.mg-bundle__choice-image img');
        if (first?.image && choiceImage) {
          const imageUrl = new URL(first.image, window.location.href);
          imageUrl.searchParams.set('width', '120');
          choiceImage.src = imageUrl.href;
        }
        card.querySelector('[data-mg-estimate]').textContent = formatMoney(Math.max(0, regular - Number(data.savings[count] || 0)));
        const crossedOut = card.querySelector('[data-mg-regular]');
        if (crossedOut) crossedOut.textContent = formatMoney(regular);
      });
    }
    function syncButtons() {
      const valid = activeSlots().every(slot => variantFor(slot.value)?.available);
      const count = currentCount();
      bundleAdd.disabled = !valid || submitting;
      stickyAdd.disabled = !valid || submitting;
      buttonLabel(bundleAdd, submitting ? 'Adding caps…' : valid ? `Add ${count} ${count === 1 ? 'cap' : 'caps'} to cart` : 'Choose available colors');
      buttonLabel(stickyAdd, submitting ? 'Adding…' : valid ? `Add ${count} ${count === 1 ? 'cap' : 'caps'}` : 'Sold out');
      const first = variantFor(activeSlots()[0].value);
      root.querySelector('[data-mg-sticky-label]').textContent = `${count} ${count === 1 ? 'cap' : 'caps'} · ${first?.title || 'Choose color'}`;
    }
    function syncTier() {
      cards.forEach(card => {
        const selected = card === activeCard();
        card.classList.toggle('mg-bundle__tier--selected', selected);
        card.querySelector('[data-mg-tier-details]').hidden = !selected;
        card.querySelectorAll('[data-mg-slot]').forEach(slot => { slot.disabled = !selected; });
      });
      setError('');
      syncPrices();
      syncButtons();
    }
    function syncQuantity() {
      if (!quantity) return;
      const value = quantity.valueAsNumber;
      const valid = Number.isSafeInteger(value) && value >= 1 && value <= 99;
      quantity.setCustomValidity(valid ? '' : 'Choose a whole number from 1 to 99.');
      if (decrease) decrease.disabled = !valid || value <= 1;
      const increase = form.querySelector('[data-mg-quantity-plus]');
      if (increase) increase.disabled = valid && value >= 99;
    }
    if (quantity) {
      quantity.addEventListener('input', syncQuantity);
      quantity.addEventListener('change', syncQuantity);
      form.querySelectorAll('[data-mg-quantity-step]').forEach(button => button.addEventListener('click', () => {
        const current = Number.isSafeInteger(quantity.valueAsNumber) ? quantity.valueAsNumber : 1;
        quantity.value = String(Math.min(99, Math.max(1, current + Number(button.dataset.mgQuantityStep))));
        syncQuantity();
        quantity.dispatchEvent(new Event('change', { bubbles: true }));
      }));
      form.querySelectorAll('[data-mg-quantity-step]').forEach(button => { button.hidden = false; });
      syncQuantity();
    }
    function update(id, updateUrl = true) {
      const variant = variantFor(id);
      if (!variant) return;
      select.value = String(variant.id);
      root.querySelector('[data-mg-price]').textContent = variant.price;
      root.querySelector('[data-mg-color]').textContent = variant.title;
      root.querySelector('[data-mg-sticky-label]').textContent = `${variant.title} · ${variant.price} · Ships free`;
      root.querySelectorAll('[data-mg-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mgSelect === String(variant.id))));
      root.querySelectorAll('[data-mg-color-link]').forEach(card => {
        const cardVariant = variantFor(card.dataset.mgColorLink);
        const isCurrent = card.dataset.mgColorLink === String(variant.id);
        if (isCurrent) card.setAttribute('aria-current', 'true');
        else card.removeAttribute('aria-current');
        const state = card.querySelector('[data-mg-card-state]');
        if (state && cardVariant) state.textContent = !cardVariant.available ? 'Sold out' : isCurrent ? 'Selected' : 'Choose color';
      });
      mainAdd.disabled = !variant.available || submitting;
      buttonLabel(mainAdd, `${variant.available ? 'Add to cart' : 'Sold out'} · ${variant.title}`);
      setImage(variant.image, `Midnight Grin washed baseball cap — ${variant.title}`);
      picks[0] = String(variant.id);
      cards.forEach(card => { card.querySelector('[data-mg-slot]').value = String(variant.id); });
      syncPrices();
      syncButtons();
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);
      }
    }
    tiers.forEach(tier => tier.addEventListener('change', () => {
      if (!tier.checked) return;
      const count = Number(tier.value);
      const used = new Set([picks[0]]);
      const choices = Array.from({ length: count }, (_, index) => {
        let choice = picks[index];
        if (!choice && count >= 3 && index > 0) choice = data.variants.find(variant => variant.available && !used.has(String(variant.id)))?.id;
        choice = choice || picks[0];
        used.add(String(choice));
        return choice;
      });
      cards.forEach(card => card.querySelectorAll('[data-mg-slot]').forEach((slot, index) => {
        const choice = choices[index] || picks[index] || picks[0];
        if (variantFor(choice)?.available) slot.value = choice;
      }));
      syncTier();
    }));
    cards.forEach(card => card.querySelectorAll('[data-mg-slot]').forEach(slot => slot.addEventListener('change', () => {
      picks[Number(slot.dataset.mgSlotIndex) - 1] = slot.value;
      setError('');
      if (slot.dataset.mgSlotIndex === '1') update(slot.value);
      else { syncPrices(); syncButtons(); }
    })));
    select.addEventListener('change', () => update(select.value));
    root.querySelectorAll('[data-mg-select]').forEach(button => button.addEventListener('click', () => update(button.dataset.mgSelect)));
    root.querySelectorAll('[data-mg-color-link]').forEach(link => link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      update(link.dataset.mgColorLink);
      root.querySelector('.mg-buy').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      activeSlots()[0].focus({ preventScroll: true });
    }));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting || root.dataset.preview === 'true') return;
      const slots = activeSlots();
      if (!slots.every(slot => variantFor(slot.value)?.available)) { setError('Choose an available color for every cap.'); return; }
      const quantities = new Map();
      slots.forEach(slot => quantities.set(slot.value, (quantities.get(slot.value) || 0) + 1));
      submitting = true;
      setError('');
      syncButtons();
      try {
        const response = await fetch(data.cartAddUrl || '/cart/add.js', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ items: [...quantities].map(([id, count]) => ({ id: Number(id), quantity: count })) })
        });
        if (!response.ok) throw new Error('Cart add failed');
        window.location.assign(data.cartUrl || '/cart');
      } catch (_) {
        submitting = false;
        syncButtons();
        setError('We could not add those caps. Please check the colors and try again.');
      }
    });
    window.addEventListener('pageshow', () => { submitting = false; syncButtons(); });
    window.addEventListener('popstate', () => update(new URL(window.location.href).searchParams.get('variant') || select.value, false));
    native.hidden = true;
    quantity.required = false;
    bundle.hidden = false;
    syncTier();
    const sticky = root.querySelector('[data-mg-sticky]');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        const entry = entries[0];
        sticky.hidden = entry.isIntersecting || entry.boundingClientRect.bottom > 0;
      }, { threshold: 0 }).observe(bundleAdd);
    }
    const requestedVariant = new URL(window.location.href).searchParams.get('variant');
    const initialVariant = data.variants.some(item => String(item.id) === requestedVariant) ? requestedVariant : select.value;
    update(initialVariant, false);
  }
  document.querySelectorAll('[data-mg-product]').forEach(initialize);
  document.addEventListener('shopify:section:load', event => event.target.querySelectorAll('[data-mg-product]').forEach(initialize));
})();
