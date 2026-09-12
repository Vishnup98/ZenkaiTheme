(() => {
  'use strict';

  const FIXED_LABEL = 'Get $5 Off';
  const COLLAPSED_LABELS = new Set([
    FIXED_LABEL,
    'Mystery Discount',
    'Exclusive Discount',
    'Special Discount',
  ]);
  const ROOT_SELECTOR = '[id^="alia-root-"]';
  let scheduled = false;

  function directTextNode(button) {
    return Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  }

  function syncCollapsedLabels() {
    scheduled = false;

    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      const buttons = Array.from(root.querySelectorAll('button'));
      const trigger =
        root.querySelector('#alia-8e60bhq87zylv9ja') ||
        buttons.find((button) => {
          const textNode = directTextNode(button);
          return textNode && COLLAPSED_LABELS.has(textNode.nodeValue.trim());
        });

      if (!trigger) return;

      const textNode = directTextNode(trigger);
      if (textNode && textNode.nodeValue.trim() !== FIXED_LABEL) {
        textNode.nodeValue = FIXED_LABEL;
      }
      if (trigger.getAttribute('aria-label') !== FIXED_LABEL) {
        trigger.setAttribute('aria-label', FIXED_LABEL);
      }
    });
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(syncCollapsedLabels);
  }

  function init() {
    scheduleSync();
    new MutationObserver(scheduleSync).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
