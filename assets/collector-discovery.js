/* First-party navigation signals; preserve the original campaign/referrer. */
(() => {
  if (window.zenkaiCollectorDiscoveryBound) return;
  window.zenkaiCollectorDiscoveryBound = true;
  const bindRails = () => document.querySelectorAll('[data-zch-rail]').forEach((rail) => {
    if (rail.dataset.bound) return;
    rail.dataset.bound = 'true';
    const controls = rail.closest('.zch-apparel').querySelector('[data-zch-rail-controls]');
    const buttons = [...controls.querySelectorAll('button')];
    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      controls.hidden = max < 2;
      buttons[0].disabled = rail.scrollLeft < 2;
      buttons[1].disabled = rail.scrollLeft >= max - 2;
    };
    const step = (direction) => rail.scrollBy({left: direction * rail.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    buttons.forEach(button => button.addEventListener('click', () => step(Number(button.dataset.zchRailStep))));
    rail.addEventListener('keydown', event => {
      if (event.target !== rail || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1);
    });
    rail.addEventListener('scroll', update, {passive: true});
    new ResizeObserver(update).observe(rail);
    update();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindRails, {once: true});
  else bindRails();
  document.addEventListener('shopify:section:load', bindRails);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('.zch a[data-zch-product]');
    if (!link) return;
    const destination = new URL(link.href, window.location.origin);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'collector_product_click',
      product_handle: link.dataset.zchProduct,
      placement: link.dataset.zchPlacement || 'homepage',
      destination_path: destination.pathname,
      destination_view: destination.searchParams.get('view') || 'default'
    });
  });
})();
