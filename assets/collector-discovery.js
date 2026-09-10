/* First-party navigation signals; preserve the original campaign/referrer. */
(() => {
  if (window.zenkaiCollectorDiscoveryBound) return;
  window.zenkaiCollectorDiscoveryBound = true;
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
