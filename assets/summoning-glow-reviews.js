(() => {
  const initialize = (scope = document) => {
    scope.querySelectorAll('[data-sg-reviews]:not([data-sg-ready])').forEach((root) => {
      const grid = root.querySelector('[data-sg-review-grid]');
      const previousButton = root.querySelector('[data-sg-review-previous]');
      const nextButton = root.querySelector('[data-sg-review-next]');
      const status = root.querySelector('[data-sg-review-page-status]');
      const deferredPages = Array.from(root.querySelectorAll('template[data-sg-review-page]'))
        .sort((left, right) => Number(left.dataset.sgReviewPage) - Number(right.dataset.sgReviewPage));

      if (!grid || !previousButton || !nextButton || !status || deferredPages.length === 0) return;

      const firstPage = document.createElement('template');
      Array.from(grid.children).forEach((card) => firstPage.content.append(card.cloneNode(true)));
      const pages = [firstPage, ...deferredPages];
      let currentPage = 0;

      const renderPage = (pageIndex) => {
        if (pageIndex < 0 || pageIndex >= pages.length || pageIndex === currentPage) return;

        grid.replaceChildren(pages[pageIndex].content.cloneNode(true));
        currentPage = pageIndex;
        previousButton.disabled = currentPage === 0;
        nextButton.disabled = currentPage === pages.length - 1;
        status.textContent = `Page ${currentPage + 1} of ${pages.length}`;
      };

      previousButton.addEventListener('click', () => renderPage(currentPage - 1));
      nextButton.addEventListener('click', () => renderPage(currentPage + 1));
      root.dataset.sgReady = 'true';
    });
  };

  initialize();

  if (!window.__summoningGlowReviewsSectionListener) {
    window.__summoningGlowReviewsSectionListener = true;
    document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  }
})();
