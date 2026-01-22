(function () {
  function slickReady() {
    return window.jQuery && $.fn.slick;
  }
  function onStart(e) {
    if (e.touches.length < 2) return;
    const s = e.target.closest(".slick-slider, .product-slider");
    if (!s) return;
    $(s).slick("slickSetOption", "swipe", false, false);
    s.style.touchAction = "pinch-zoom";
  }
  function onEnd(e) {
    const s = e.target.closest(".slick-slider, .product-slider");
    if (!s) return;
    $(s).slick("slickSetOption", "swipe", true, false);
  }
  function init() {
    if (!slickReady()) return setTimeout(init, 50);
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd);
    window.pinchZoomFixLoaded = true;
  }
  init();
})();
