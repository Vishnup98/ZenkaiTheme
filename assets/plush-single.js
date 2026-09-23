(() => {
  function initialize(root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const variants = JSON.parse(root.querySelector('[data-variants]').textContent);
    function selectVariant(id, updateUrl = true) {
      const variant = variants.find(item => String(item.id) === String(id));
      if (!variant) return;
      const radio = root.querySelector(`input[name="id"][value="${variant.id}"]`);
      if (radio) radio.checked = true;
      const image = root.querySelector('#PlushSingleHero');
      image.removeAttribute('srcset');
      image.src = variant.image;
      image.alt = `${variant.title} type single plush`;
      image.width = variant.width;
      image.height = variant.height;
      root.querySelector('[data-price]').textContent = variant.price;
      root.querySelector('[data-photo-type]').textContent = variant.title;
      root.querySelector('[data-selected-type]').textContent = variant.title;
      const button = root.querySelector('[data-add]');
      button.disabled = !variant.available;
      button.textContent = variant.available ? 'Add to bag' : 'Sold out';
      root.querySelector('[data-selection-message]').textContent = `${variant.title} selected. One plush, ${variant.price}.`;
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);
      }
    }
    root.addEventListener('change', event => {
      if (event.target.matches('input[name="id"]')) selectVariant(event.target.value);
    });
    window.addEventListener('pageshow', () => {
      const checked = root.querySelector('input[name="id"]:checked');
      if (checked) selectVariant(checked.value, false);
    });
  }
  document.querySelectorAll('[data-plush-single]').forEach(initialize);
  document.addEventListener('shopify:section:load', event => event.target.querySelectorAll('[data-plush-single]').forEach(initialize));
})();
