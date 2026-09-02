const state = {
  config: null,
  data: null,
  placingOrders: new Set(),
  markingHandledOrders: new Set(),
  preparingBrowserCheckouts: new Set(),
  browserCheckoutPolls: new Map(),
  extensionConnected: document.documentElement.dataset.zenkaiAliExpressExtension === "connected",
};

const elements = {
  orders: document.querySelector("#orders"),
  notice: document.querySelector("#notice"),
  refresh: document.querySelector("#refresh-button"),
  generatedAt: document.querySelector("#generated-at"),
  summaryOrders: document.querySelector("#summary-orders"),
  summaryReady: document.querySelector("#summary-ready"),
  summaryPackages: document.querySelector("#summary-packages"),
  summaryCost: document.querySelector("#summary-cost"),
  threshold: document.querySelector("#split-threshold"),
};

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function textElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function showNotice(message, type = "") {
  elements.notice.textContent = message;
  elements.notice.className = `notice ${type}`.trim();
  elements.notice.hidden = !message;
}

function basketRows(components) {
  const labels = {
    kanto: "Kanto badge set",
    johto: "Johto badge set",
    hoenn: "Hoenn badge set",
    sinnoh: "Sinnoh badge set",
    evolution8: "Evolution 8-pin set",
  };
  const list = document.createElement("ul");
  list.className = "basket-list";
  for (const [component, quantity] of Object.entries(components || {})) {
    if (!quantity) continue;
    const item = document.createElement("li");
    item.className = "basket-item";
    item.append(textElement("span", "", labels[component] || component));
    item.append(textElement("span", "quantity-pill", quantity));
    list.append(item);
  }
  return list;
}

function externalLineRows(lines) {
  if (!lines?.length) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "external-lines";
  wrapper.append(textElement("p", "external-lines-label", "HANDLED OUTSIDE ALIEXPRESS"));
  const list = document.createElement("ul");
  list.className = "external-lines-list";
  for (const line of lines) {
    list.append(textElement(
      "li",
      "",
      `${line.quantity}× ${line.title}${line.variant ? ` · ${line.variant}` : ""} · ${line.vendor}`,
    ));
  }
  wrapper.append(list);
  return wrapper;
}

function addressNode(address) {
  const wrapper = document.createElement("div");
  wrapper.append(textElement("p", "address-name", address?.fullName || "Missing recipient name"));
  const lines = [
    address?.address1,
    address?.address2,
    [address?.city, address?.provinceCode, address?.postalCode].filter(Boolean).join(", "),
    address?.country,
  ].filter(Boolean);
  const block = document.createElement("address");
  block.className = "address-lines";
  lines.forEach((line, index) => {
    if (index) block.append(document.createElement("br"));
    block.append(document.createTextNode(line));
  });
  wrapper.append(block);
  wrapper.append(textElement(
    "p",
    address?.phone ? "" : "phone-missing",
    address?.phone || "No phone in Shopify · using the +1 602-751-5492 fallback",
  ));
  return wrapper;
}

function packageNode(pkg, currency) {
  const card = document.createElement("div");
  card.className = "package-card";
  const head = document.createElement("div");
  head.className = "package-head";
  head.append(textElement("span", "package-store", pkg.storeName));
  head.append(textElement("span", "package-total", money(pkg.itemSubtotal + pkg.shipping.amount, currency)));
  card.append(head);

  const items = document.createElement("ul");
  items.className = "package-items";
  for (const item of pkg.items) {
    const line = document.createElement("li");
    line.append(textElement("span", "", `${item.quantity}× ${item.label}`));
    const proof = item.component === "evolution8"
      ? `Metal color: ${item.verifiedProperty.definition} ✓`
      : `SKU ${item.skuId} ✓`;
    line.append(textElement("span", "sku-proof", proof));
    items.append(line);
  }
  card.append(items);

  const shipping = document.createElement("div");
  shipping.className = "shipping-line";
  shipping.append(textElement("span", "", `${pkg.shipping.serviceName} · tracked`));
  shipping.append(textElement("span", "", `${money(pkg.shipping.amount, currency)} shipping`));
  card.append(shipping);
  return card;
}

function decisionMessage(order) {
  const decision = order.decision;
  if (!decision?.selected) return (order.blockers || []).join(" · ") || "No eligible fulfillment plan.";
  if (decision.reason === "consolidation-preferred") {
    const comparison = decision.comparison;
    return `${comparison.cheaperStrategy} would save ${money(comparison.actualSavings)}, but adds ${comparison.avoidedExtraPackages} package and misses the ${money(comparison.requiredSavings)} threshold.`;
  }
  if (decision.reason === "material-split-savings") {
    return `The extra package saves ${money(decision.comparison.actualSavings)}, clearing the ${money(decision.comparison.requiredSavings)} threshold.`;
  }
  const alternative = (decision.alternatives || []).find((candidate) => candidate.eligible);
  if (alternative && alternative.packageCount > decision.selected.packageCount) {
    return "The selected plan is both cheaper and more consolidated than the split alternative.";
  }
  return "Lowest live landed estimate among plans with the best package count.";
}

function placementLabel(order) {
  if (order.browserCheckout?.status === "review-ready") return "Coupon checkout · review ready";
  if (order.browserCheckout?.status === "login-required") return "Coupon checkout · sign in";
  if (order.browserCheckout?.status === "needs-attention") return "Coupon checkout · check browser";
  if (order.browserCheckout?.status === "completed") return "Browser order · reconcile";
  if (order.browserCheckout) return "Preparing coupon checkout";
  if (order.ledger?.status === "paid") return "Paid · awaiting shipment";
  if (order.ledger?.status === "placed-unpaid") return "Created · awaiting payment";
  if (order.ledger?.status === "placement-rejected") return "AliExpress rejected · fix required";
  if (order.ledger?.status === "placement-uncertain") return "Check AliExpress · retry blocked";
  if (order.approvalState === "pending-user-approval") return "Ready for approval";
  return "Blocked";
}

function orderCard(order) {
  const selected = order.decision?.selected;
  const paid = order.ledger?.status === "paid";
  const placed = paid || order.ledger?.status === "placed-unpaid";
  const card = document.createElement("article");
  card.className = `order-card${placed ? " placed" : ""}`;
  card.dataset.orderName = order.shopifyOrder.name;

  const head = document.createElement("div");
  head.className = "order-head";
  const identity = document.createElement("div");
  identity.className = "order-identity";
  identity.append(textElement("span", "order-number", order.shopifyOrder.name));
  const statusClass = placed ? "status-placed" : order.canPlace ? "status-ready" : "status-blocked";
  identity.append(textElement("span", `status-chip ${statusClass}`, placementLabel(order)));
  head.append(identity);
  head.append(textElement("span", "order-date", `Shopify order · ${dateTime(order.shopifyOrder.createdAt)}`));
  card.append(head);

  const grid = document.createElement("div");
  grid.className = "order-grid";
  const addressColumn = document.createElement("section");
  addressColumn.className = "order-column";
  addressColumn.append(textElement("p", "column-label", "SHIP TO"));
  addressColumn.append(addressNode(order.address || {}));
  grid.append(addressColumn);

  const basketColumn = document.createElement("section");
  basketColumn.className = "order-column";
  basketColumn.append(textElement("p", "column-label", "SHOPIFY PURCHASE"));
  basketColumn.append(basketRows(order.basket?.components));
  const externalLines = externalLineRows(order.basket?.externalLines);
  if (externalLines) basketColumn.append(externalLines);
  grid.append(basketColumn);

  const planColumn = document.createElement("section");
  planColumn.className = "order-column";
  planColumn.append(textElement("p", "column-label", selected ? `${selected.packageCount} PLANNED SUPPLIER PACKAGE${selected.packageCount === 1 ? "" : "S"}` : "PLANNED FULFILLMENT"));
  if (selected) {
    for (const pkg of selected.packages) planColumn.append(packageNode(pkg, selected.currency));
    planColumn.append(textElement("p", "decision-note", decisionMessage(order)));
    const total = document.createElement("div");
    total.className = "plan-total";
    total.append(textElement("span", "", "Live estimate before tax / coupons"));
    total.append(textElement("strong", "", money(selected.quotedSubtotalBeforeTax, selected.currency)));
    planColumn.append(total);
    if (order.coupon) {
      const coupon = document.createElement("div");
      coupon.className = "coupon-plan";
      const couponCopy = document.createElement("div");
      couponCopy.append(textElement("strong", "coupon-code", order.coupon.code));
      couponCopy.append(textElement(
        "span",
        "coupon-detail",
        `${money(order.coupon.discountAmount, order.coupon.currency)} off · ${money(order.coupon.minimumEligibleSubtotal, order.coupon.currency)} item minimum`,
      ));
      coupon.append(couponCopy);
      coupon.append(textElement(
        "strong",
        "coupon-total",
        `≈ ${money(selected.quotedSubtotalBeforeTax - order.coupon.discountAmount, selected.currency)} before tax`,
      ));
      planColumn.append(coupon);
    }
  } else {
    planColumn.append(textElement("p", "decision-note", decisionMessage(order)));
  }
  grid.append(planColumn);
  card.append(grid);

  const actions = document.createElement("div");
  actions.className = "order-actions";
  let explanation = order.coupon
    ? `${order.coupon.code} is expected to qualify on the ${money(selected.itemSubtotal, selected.currency)} item subtotal. The Chrome extension reuses your signed-in AliExpress profile, clears the cart, adds every exact SKU in parallel, validates every line, fills the address, applies the code, and stops before Place order.`
    : "This creates a real unpaid AliExpress order. AliExpress's API cannot select coupons; review eligible coupons on AliExpress before paying manually.";
  if (placed) explanation = `AliExpress order ID${order.ledger.aliExpressOrderIds.length === 1 ? "" : "s"}: ${order.ledger.aliExpressOrderIds.join(", ")}. Review eligible coupons on AliExpress before paying.`;
  if (paid) {
    const actualAmount = Number(order.ledger.actualOrderAmount);
    const charged = Number.isFinite(actualAmount)
      ? ` · paid ${money(actualAmount, order.ledger.actualOrderCurrency || "USD")}`
      : " · paid";
    explanation = `AliExpress order ID${order.ledger.aliExpressOrderIds.length === 1 ? "" : "s"}: ${order.ledger.aliExpressOrderIds.join(", ")}${charged}. AliExpress does not expose a coupon breakdown through this order API.`;
  }
  if (order.ledger?.status === "placement-rejected") {
    const rejection = [order.ledger.errorCode, order.ledger.error].filter(Boolean).join(": ");
    explanation = `${rejection || "AliExpress rejected this placement."} Correct the issue before retrying.`;
  }
  if (order.ledger?.status === "placement-uncertain") explanation = "AliExpress returned an uncertain result. Check the orders page before taking any other action.";
  if (order.browserCheckout) explanation = order.browserCheckout.message;
  actions.append(textElement("p", placed ? "action-explainer ali-ids" : "action-explainer", explanation));
  const buttons = document.createElement("div");
  buttons.className = "action-buttons";
  const clearButton = textElement("button", "button button-clear", "Clear as handled");
  clearButton.type = "button";
  clearButton.title = "Record this Shopify order as handled and remove it from the review queue";
  clearButton.disabled = state.markingHandledOrders.has(order.shopifyOrder.name);
  clearButton.addEventListener("click", () => markOrderHandled(order, clearButton));
  buttons.append(clearButton);
  const placeButtonLabel = placed
    ? "Already created"
    : order.ledger?.status === "placement-rejected"
      ? "Resolve rejection before retry"
      : "Create unpaid AliExpress order";
  const placeButton = textElement("button", "button button-primary", placeButtonLabel);
  placeButton.type = "button";
  placeButton.disabled = !order.canPlace || state.placingOrders.has(order.shopifyOrder.name);
  placeButton.addEventListener("click", () => placeOrder(order, placeButton));
  if (order.coupon && !placed) {
    const browserStatus = order.browserCheckout?.status;
    const couponButtonLabel = browserStatus
      ? browserStatus === "review-ready"
        ? "Review prepared checkout"
        : browserStatus === "login-required"
          ? "Sign in in opened browser"
          : browserStatus === "needs-attention"
            ? "Check opened browser"
            : "Preparing browser checkout…"
      : state.extensionConnected
        ? `Clear cart & prepare ${order.coupon.code}`
        : "Open in Chrome with Zenkai extension";
    const couponButton = textElement("button", "button button-danger", couponButtonLabel);
    couponButton.type = "button";
    couponButton.disabled = !order.canPrepareCouponCheckout
      || state.preparingBrowserCheckouts.has(order.shopifyOrder.name)
      || !state.extensionConnected;
    couponButton.addEventListener("click", () => prepareBrowserCheckout(order, couponButton));
    buttons.append(couponButton);
    placeButton.className = "button button-quiet";
    placeButton.textContent = "Create without coupon via API";
  }
  buttons.append(placeButton);
  const ordersLink = textElement("a", "button button-quiet", "Review & pay on AliExpress ↗");
  ordersLink.href = state.config.ordersPageUrl;
  ordersLink.target = "_blank";
  ordersLink.rel = "noreferrer";
  buttons.append(ordersLink);
  actions.append(buttons);
  card.append(actions);
  return card;
}

function render() {
  const orders = state.data?.orders || [];
  elements.orders.replaceChildren(...orders.map(orderCard));
  const selected = orders.map((order) => order.decision?.selected).filter(Boolean);
  elements.summaryOrders.textContent = orders.length;
  elements.summaryReady.textContent = orders.filter((order) => order.canPlace).length;
  elements.summaryPackages.textContent = selected.reduce((sum, plan) => sum + plan.packageCount, 0);
  elements.summaryCost.textContent = money(selected.reduce((sum, plan) => sum + plan.quotedSubtotalBeforeTax, 0));
  elements.generatedAt.textContent = `Live data refreshed ${dateTime(state.data.generatedAt)}`;
  elements.threshold.textContent = money(state.data.policy.minSavingsPerExtraPackageUsd);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || "Request failed.");
    error.details = body.details || {};
    throw error;
  }
  return body;
}

async function loadOrders({ announce = false } = {}) {
  elements.refresh.disabled = true;
  if (announce) showNotice("Refreshing Shopify orders, products, stock, and freight quotes…");
  try {
    state.data = await fetchJson("/api/orders");
    render();
    if (announce) showNotice(
      state.config.orderSelectionMode === "auto-discovery"
        ? `Found ${state.data.orders.length} unhandled AliExpress order${state.data.orders.length === 1 ? "" : "s"} for review.`
        : "Fresh plans are ready for review.",
      "success",
    );
  } catch (error) {
    showNotice(error.message, "error");
    elements.orders.replaceChildren(textElement("article", "loading-card", "The batch could not be loaded. Check the local server output and try again."));
  } finally {
    elements.refresh.disabled = false;
  }
}

async function placeOrder(order, button) {
  const orderName = order.shopifyOrder.name;
  if (!order.canPlace || state.placingOrders.has(orderName)) return;
  state.placingOrders.add(orderName);
  button.disabled = true;
  button.textContent = "Re-quoting & creating…";
  showNotice(`${orderName}: validating the latest plan and creating an unpaid AliExpress order…`);
  try {
    const result = await fetchJson("/api/place", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zenkai-Action-Token": state.config.actionToken,
      },
      body: JSON.stringify({
        shopifyOrderName: orderName,
        expectedDraftFingerprint: order.draftFingerprint,
        confirmation: order.confirmationPhrase,
      }),
    });
    showNotice(`${result.shopifyOrderName}: unpaid AliExpress order created. Review order ${result.aliExpressOrderIds.join(", ")} and pay manually.`, "success");
  } catch (error) {
    showNotice(`${orderName}: ${error.message}`, "error");
  } finally {
    state.placingOrders.delete(orderName);
    button.textContent = "Create unpaid AliExpress order";
    button.disabled = !order.canPlace;
    await loadOrders();
  }
}

async function markOrderHandled(order, button) {
  const orderName = order.shopifyOrder.name;
  if (state.markingHandledOrders.has(orderName)) return;
  state.markingHandledOrders.add(orderName);
  button.disabled = true;
  button.textContent = "Clearing…";
  showNotice(`${orderName}: recording this order as handled…`);
  try {
    const result = await fetchJson("/api/mark-handled", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zenkai-Action-Token": state.config.actionToken,
      },
      body: JSON.stringify({ shopifyOrderName: orderName }),
    });
    showNotice(result.message, "success");
  } catch (error) {
    showNotice(`${orderName}: ${error.message}`, "error");
  } finally {
    state.markingHandledOrders.delete(orderName);
    button.textContent = "Clear as handled";
    button.disabled = false;
    await loadOrders();
  }
}

function checkoutStatusMessage(orderName, status) {
  const prefix = `${orderName}: `;
  if (status.status === "login-required") return `${prefix}sign in to AliExpress in this Chrome profile; the extension will resume automatically.`;
  if (status.status === "review-ready") return `${prefix}${status.couponCode} is prepared. Review the opened checkout and place/pay manually.`;
  if (status.status === "needs-attention") return `${prefix}${status.message}`;
  if (status.status === "completed") return `${prefix}${status.message}`;
  return `${prefix}${status.message || "Preparing AliExpress coupon checkout…"}`;
}

function beginBrowserCheckoutPolling(orderName, jobId) {
  if (state.browserCheckoutPolls.has(jobId)) return;
  const timer = window.setInterval(async () => {
    try {
      const result = await fetchJson(`/api/browser-checkout/${encodeURIComponent(jobId)}/status`);
      const status = result.status;
      showNotice(
        checkoutStatusMessage(orderName, status),
        ["needs-attention", "failed"].includes(status.status) ? "error" : status.status === "review-ready" ? "success" : "",
      );
      if (["review-ready", "needs-attention", "completed", "failed", "cancelled"].includes(status.status)) {
        window.clearInterval(timer);
        state.browserCheckoutPolls.delete(jobId);
        await loadOrders();
      }
    } catch (error) {
      window.clearInterval(timer);
      state.browserCheckoutPolls.delete(jobId);
      showNotice(`${orderName}: ${error.message}`, "error");
    }
  }, 900);
  state.browserCheckoutPolls.set(jobId, timer);
}

async function prepareBrowserCheckout(order, button) {
  const orderName = order.shopifyOrder.name;
  if (!order.canPrepareCouponCheckout || state.preparingBrowserCheckouts.has(orderName)) return;
  state.preparingBrowserCheckouts.add(orderName);
  button.disabled = true;
  button.textContent = "Re-quoting & launching…";
  showNotice(`${orderName}: clearing the AliExpress cart and preparing ${order.coupon.code} checkout…`);
  try {
    const result = await fetchJson("/api/browser-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zenkai-Action-Token": state.config.actionToken,
      },
      body: JSON.stringify({
        shopifyOrderName: orderName,
        expectedDraftFingerprint: order.draftFingerprint,
      }),
    });
    showNotice(`${orderName}: ${result.message}`, "success");
    window.postMessage({ type: "ZENKAI_CHECKOUT_JOB_QUEUED", jobId: result.browserCheckoutJobId }, window.location.origin);
    beginBrowserCheckoutPolling(orderName, result.browserCheckoutJobId);
  } catch (error) {
    showNotice(`${orderName}: ${error.message}`, "error");
  } finally {
    state.preparingBrowserCheckouts.delete(orderName);
    button.disabled = !order.canPrepareCouponCheckout;
    await loadOrders();
  }
}

elements.refresh.addEventListener("click", () => loadOrders({ announce: true }));
window.addEventListener("zenkai-extension-connected", () => {
  state.extensionConnected = true;
  if (state.data) render();
});

async function start() {
  try {
    state.config = await fetchJson("/api/config");
    document.querySelector("#header-orders-link").href = state.config.ordersPageUrl;
    document.querySelector("#footer-orders-link").href = state.config.ordersPageUrl;
    await loadOrders();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

start();
