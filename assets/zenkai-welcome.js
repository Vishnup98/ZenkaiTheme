(() => {
  function init(root) {
    if (root.dataset.ready) return;
    const embed = root.querySelector('[data-zenkai-welcome-embed]');
    const loading = root.querySelector('.zenkai-welcome__loading');
    const fallback = root.querySelector('.zenkai-welcome__fallback');
    if (!embed || !loading || !fallback) return;
    root.dataset.ready = 'true';
    let timer;
    let started = false;
    let viewportObserver;
    function rendered() {
      if (!embed.querySelector('input[type="email"], form, [role="form"]')) return false;
      loading.hidden = true;
      fallback.hidden = true;
      clearTimeout(timer);
      root.dataset.formLoaded = 'true';
      return true;
    }
    // Judge a lazy-loaded form only once the footer approaches the viewport.
    function start() {
      if (started) return;
      started = true;
      if (rendered()) return;
      loading.hidden = false;
      timer = setTimeout(() => {
        if (!rendered()) { loading.hidden = true; fallback.hidden = false; }
      }, 15000);
    }
    const observer = new MutationObserver(rendered);
    observer.observe(embed, {childList: true, subtree: true});
    if ('IntersectionObserver' in window) {
      viewportObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          viewportObserver.disconnect();
        }
      }, {rootMargin: '200px'});
      viewportObserver.observe(root);
    } else start();
    rendered();
    const cleanup = (event) => {
      if (!event.target.contains(root)) return;
      observer.disconnect();
      if (viewportObserver) viewportObserver.disconnect();
      clearTimeout(timer);
      document.removeEventListener('shopify:section:unload', cleanup);
    };
    document.addEventListener('shopify:section:unload', cleanup);
  }
  document.querySelectorAll('[data-zenkai-welcome]').forEach(init);
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-zenkai-welcome]').forEach(init);
  });
})();
