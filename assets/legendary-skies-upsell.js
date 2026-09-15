(function () {
  'use strict';
  var root = document.querySelector('[data-ls-page]');
  var dialog = document.querySelector('[data-ls-upsell]');
  var configNode = document.querySelector('[data-ls-upsell-config]');
  if (!root || !dialog || !configNode || !dialog.showModal) return;
  var config;
  try { config = JSON.parse(configNode.textContent); } catch (_) { return; }
  var request = window.LegendarySkiesCartFetch || window.fetch.bind(window);
  var base = (config.root || '/').replace(/\/?$/, '/');
  var preview = root.dataset.preview === 'true';
  var cards = dialog.querySelector('[data-ls-upsell-cards]');
  var status = dialog.querySelector('[data-ls-upsell-status]');
  var checkout = dialog.querySelector('[data-ls-upsell-checkout]');
  var pageError = root.querySelector('[data-ls-cart-error]');
  var offers = [], busy = false, mainAdded = false, mainUncertain = false, additionsUncertain = false, trigger;
  var money = new Intl.NumberFormat(document.documentElement.lang || 'en', {style:'currency', currency:config.currency || 'USD'});
  function price(value) { return money.format(Number(value) / 100); }
  function element(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function imageUrl(value) { return typeof value === 'string' ? value : value && (value.src || value.url); }
  function sized(src) { return src + (src.indexOf('?') >= 0 ? '&' : '?') + 'width=1200'; }
  function photo(src, alt, caption) {
    var figure = element('figure'), img = element('img');
    img.src = sized(src); img.alt = alt; img.width = 400; img.height = 400;
    var windowEl = element('div', 'ls-upsell__image-window');
    windowEl.append(img);
    figure.append(windowEl, element('figcaption', '', caption));
    return {figure:figure, image:img};
  }
  function updateButton() {
    if (busy || additionsUncertain) return;
    checkout.textContent = 'Continue to checkout';
    offers.forEach(function(o) {
      o.button.textContent = o.added ? '✓ Added to cart' : 'Add to cart' + (o.variant && o.variant.available ? ' · ' + price(o.variant.price) : '');
      o.button.disabled = o.added;
    });
  }
  function build(entry, index) {
    var product = entry.product;
    if (!product || !product.variants || !product.variants.some(function(v) { return v.available; })) return;
    var card = element('article', 'ls-upsell__card');
    var media = element('div', 'ls-upsell__media' + (index === 1 ? ' ls-upsell__media--pair' : ''));
    var images = product.images.map(imageUrl).filter(Boolean);
    var title = index === 0 ? 'Trifecta Tee' : 'The Birds Tee';
    // Explicitly named print references stay visible independently of color.
    var front = images.find(function(src) { return /birdsFront_macro/i.test(src); }) || images[0];
    var back = images.find(function(src) { return /birdsBack_macro/i.test(src); });
    var mainPhoto = photo(front, title + (index === 1 ? ' front print detail' : ''), index === 1 ? 'Front print · Navy shown' : 'Trifecta artwork');
    media.append(mainPhoto.figure);
    if (index === 0) {
      media.classList.add('ls-upsell__media--design');
      var zoom = element('button', 'ls-upsell__zoom', 'View full tee');
      zoom.type = 'button';
      zoom.setAttribute('aria-label', 'Toggle Trifecta print close-up and full shirt');
      zoom.addEventListener('click', function() {
        var full = media.classList.toggle('is-full');
        zoom.textContent = full ? 'Zoom in on print' : 'View full tee';
      });
      media.append(zoom);
    }
    if (index === 1 && back) media.append(photo(back, title + ' back print detail', 'Back print · Navy shown').figure);
    card.append(media, element('h3', '', title));
    var amount = element('p', 'ls-upsell__price'); card.append(amount);
    var options = element('div', 'ls-upsell__options'), selects = [];
    product.options.forEach(function(option, i) {
      var name = typeof option === 'string' ? option : option.name;
      var label = element('label', '', name), select = element('select');
      select.setAttribute('aria-label', title + ' ' + name);
      var values = Array.from(new Set(product.variants.map(function(v) { return v.options[i]; })));
      if (/size/i.test(name)) select.append(new Option('Choose size', ''));
      values.forEach(function(value) { select.append(new Option(value.replace(/^Solid /, ''), value)); });
      if (!/size/i.test(name)) select.value = product.variants.find(function(v) { return v.available; }).options[i];
      label.append(select); options.append(label); selects.push(select);
    });
    card.append(options);
    var addButton = element('button', 'ls-upsell__add', 'Add to cart');
    addButton.type = 'button'; addButton.setAttribute('data-ls-tee-add', entry.handle);
    card.append(addButton); cards.append(card);
    var offer = {product:product, title:title, selects:selects, button:addButton, card:card, added:false, variant:null}; offers.push(offer);
    function update() {
      offer.variant = product.variants.find(function(v) { return v.options.every(function(value,i) { return value === selects[i].value; }); });
      var matching = product.variants.filter(function(v) { return v.available && v.options.every(function(value,i) { return !selects[i].value || value === selects[i].value; }); });
      amount.textContent = offer.variant ? price(offer.variant.price) + (offer.variant.available ? '' : ' · Sold out') : matching.length ? 'From ' + price(Math.min.apply(null, matching.map(function(v) { return v.price; }))) : 'Unavailable combination';
      selects.forEach(function(select,i) {
        if (!/size/i.test(product.options[i].name || product.options[i])) return;
        Array.from(select.options).forEach(function(option) {
          option.disabled = Boolean(option.value) && !product.variants.some(function(v) { return v.available && v.options[i] === option.value && v.options.every(function(value,j) { return j === i || !selects[j].value || value === selects[j].value; }); });
        });
      });
      if (index === 0) mainPhoto.image.src = sized(imageUrl((offer.variant || matching[0] || {}).featured_image) || images[0]);
      updateButton();
    }
    selects.forEach(function(select) { select.addEventListener('change', update); });
    addButton.addEventListener('click', function() { addOffer(offer); }); update();
  }
  config.products.forEach(build);
  if (!offers.length) cards.append(element('p', '', 'The matching tees are currently unavailable. Your plush set is ready for checkout.'));
  function setBusy(value) {
    busy = value;
    dialog.querySelectorAll('button,select,input').forEach(function(el) { el.disabled = value; });
    offers.forEach(function(o) { if (o.added) { o.button.disabled = true; o.selects.forEach(function(s) { s.disabled = true; }); } });
    dialog.setAttribute('aria-busy', String(value));
  }
  function showError(message) {
    pageError.hidden = false; pageError.replaceChildren(document.createTextNode(message + ' '));
    var link = element('a', '', 'Review your cart'); link.href = base + 'cart'; pageError.append(link);
  }
  async function post(body) {
    var response = await request(base + 'cart/add.js?upcart=1&opens_cart=never', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(body)});
    var data = await response.json();
    if (!response.ok) { var error = new Error(data.description || data.message || 'This item could not be added.'); error.confirmed = true; throw error; }
    return data;
  }
  function open() {
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('ls-upsell-open');
    var sticky = root.querySelector('[data-ls-sticky]'); if (sticky) sticky.hidden = true;
    if (preview) status.textContent = 'Design preview only. No cart changes or checkout will occur.';
  }
  window.LegendarySkiesUpsell = async function(form, button) {
    if (busy) return;
    trigger = button;
    if (mainUncertain) { showError('We could not confirm the previous cart request. Please check your cart before adding again.'); return; }
    if (mainAdded || preview) { open(); return; }
    setBusy(true); pageError.hidden = true;
    var oldLabel = button && button.innerHTML;
    if (button) { button.textContent = 'Adding the trio…'; button.setAttribute('aria-busy','true'); }
    try {
      var data = new FormData(form), properties = {};
      data.forEach(function(value,key) { var match = key.match(/^properties\[(.+)\]$/); if (match) properties[match[1]] = value; });
      await post({items:[{id:Number(data.get('id')),quantity:Number(data.get('quantity') || 1),properties:properties}]});
      mainAdded = true; open();
    } catch (error) {
      mainUncertain = !error.confirmed;
      showError(error.confirmed ? error.message : 'The connection was interrupted. Your set may already be in the cart; please check before retrying.');
    } finally {
      setBusy(false); updateButton();
      if (button) { button.innerHTML = oldLabel; button.removeAttribute('aria-busy'); }
    }
  };
  async function addOffer(offer) {
    if (busy || offer.added || additionsUncertain) return;
    if (!offer.variant || !offer.variant.available) {
      status.textContent = 'Choose an available color and size for ' + offer.title + '.';
      (offer.selects.find(function(s) { return !s.value; }) || offer.selects[0]).focus();
      return;
    }
    setBusy(true); status.textContent = ''; offer.button.textContent = 'Adding…';
    try {
      if (!preview) await post({items:[{id:offer.variant.id,quantity:1}]});
      offer.added = true; offer.card.classList.add('is-added');
      status.textContent = (preview ? 'Preview only: ' : '') + offer.title + ' added' + (preview ? ' (simulated).' : ' to your cart.') + ' Add the other tee or continue to checkout.';
    } catch (error) {
      additionsUncertain = !error.confirmed;
      status.textContent = error.confirmed ? error.message : 'The connection was interrupted. This tee may already be added. Review your cart before continuing.';
    } finally {
      setBusy(false); updateButton();
      if (additionsUncertain) { offer.button.textContent = 'Check cart before retrying'; offer.button.disabled = true; checkout.textContent = 'Review cart safely'; }
    }
  }
  function finish() {
    if (busy) return;
    if (additionsUncertain) { window.location.assign(base + 'cart'); return; }
    if (preview) { status.textContent = 'Preview: continue directly to checkout with the items already added. No real cart changes made.'; return; }
    setBusy(true); status.textContent = ''; checkout.textContent = 'Preparing checkout…';
    window.location.assign(base + 'checkout');
  }
  checkout.addEventListener('click', finish);
  dialog.querySelector('[data-ls-upsell-close]').addEventListener('click', function() { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', function(event) { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', function() {
    document.documentElement.classList.remove('ls-upsell-open');
    if (trigger) trigger.focus();
    window.dispatchEvent(new Event('scroll'));
  });
  window.addEventListener('pageshow', function(event) { if (event.persisted) { setBusy(false); updateButton(); } });
})();
