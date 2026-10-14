(() => {
  if (window.GiftOfferCartLoaded) return;
  window.GiftOfferCartLoaded = true;

  let removingOffer = false;
  let updatingOfferQuantity = false;

  const getPopup = () => document.querySelector('[data-gift-offer-popup]');
  const getConfig = popup => {
    try { return JSON.parse(popup.querySelector('[data-gift-offer-config]').textContent); }
    catch (_) { return {}; }
  };

  const groupProperty = '_Gift offer group';
  const cartUrl = () => window.T4Sroutes ? window.T4Sroutes.cart_url : `${window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/'}cart`;
  const cartSections = () => `cart_data,${window.cartT4SectionID || 'mini_cart'}`;

  const quantityUpdates = (cart, key, quantity, config) => {
    const main = cart.items.find(item => item.key === key);
    if (!main) throw new Error('This item is no longer in the cart. Please refresh and try again.');

    const group = (main.properties || {})[groupProperty];
    // Offers added before groups existed can share a gift line with another
    // product, so only grouped offers can safely synchronize their gifts.
    if (!group) return null;

    const updates = { [key]: quantity };
    const gifts = cart.items.filter(item => item.properties && item.properties['FREE GIFT'] && item.properties[groupProperty] === group);
    const configuredGifts = config[(main.properties || {})['_Gift offer type']] || [];
    const configuredQtyByVariant = configuredGifts.reduce((quantities, item) => {
      quantities[item.id] = (quantities[item.id] || 0) + Number(item.quantity || 1);
      return quantities;
    }, {});

    gifts.forEach(gift => {
      // Use the offer configuration when available (1–1 / 1–2), with a
      // proportional fallback for carts created with an older configuration.
      const perMainItem = configuredQtyByVariant[gift.variant_id]
        || Math.max(1, gift.quantity / Math.max(1, main.quantity));
      updates[gift.key] = quantity === 0 ? 0 : Math.round(perMainItem * quantity);
    });
    return updates;
  };

  const renderUpdatedCart = data => {
    if (data.sections && Object.values(data.sections).every(Boolean) && window.T4SThemeSP && window.T4SThemeSP.Cart) {
      window.T4SThemeSP.Cart.renderContents(data.sections);
    } else {
      window.location.reload();
    }
  };

  const removalUpdates = (cart, key, config) => {
    const main = cart.items.find(item => item.key === key);
    if (!main) throw new Error('This item is no longer in the cart. Please refresh and try again.');
    const properties = main.properties || {};
    const updates = { [key]: 0 };
    const group = properties[groupProperty];
    if (group) {
      cart.items.forEach(item => {
        if (item.properties && item.properties['FREE GIFT'] && item.properties[groupProperty] === group) updates[item.key] = 0;
      });
      return updates;
    }

    // Older popup additions have no group ID and may have merged gift lines.
    const legacyMains = cart.items.filter(item => item.key !== key && item.properties && item.properties['_Gift offer type'] && !item.properties[groupProperty] && !item.properties['FREE GIFT']);
    const giftCounts = {};
    (config[properties['_Gift offer type']] || []).forEach(item => {
      giftCounts[item.id] = (giftCounts[item.id] || 0) + item.quantity;
    });
    cart.items.forEach(item => {
      if (!item.properties || !item.properties['FREE GIFT'] || item.properties[groupProperty]) return;
      if (!legacyMains.length) updates[item.key] = 0;
      else if (giftCounts[item.variant_id]) updates[item.key] = Math.max(0, item.quantity - giftCounts[item.variant_id]);
    });
    return updates;
  };

  // Capture before Kalles' delegated remove handler, which removes only one line.
  document.addEventListener('click', async event => {
    const remove = event.target.closest('[data-cart-remove][data-gift-offer-main]');
    if (!remove) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (removingOffer) return;
    removingOffer = true;
    remove.setAttribute('aria-disabled', 'true');
    const wrapper = remove.closest('[data-cart-wrapper]');
    if (wrapper) wrapper.classList.add('is--contentUpdate');
    try {
      const cartResponse = await fetch(`${cartUrl()}.js`, { credentials: 'same-origin', cache: 'no-store' });
      if (!cartResponse.ok) throw new Error('Could not read the cart. Please try again.');
      const popup = getPopup();
      const updates = removalUpdates(await cartResponse.json(), remove.dataset.id, popup ? getConfig(popup) : {});
      const response = await fetch(`${cartUrl()}/update.js`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ updates, sections: cartSections(), sections_url: window.location.pathname })
      });
      const data = await response.json();
      if (!response.ok || data.status) throw new Error(data.description || 'Could not remove the selected offer. Please try again.');
      renderUpdatedCart(data);
    } catch (error) {
      if (window.T4SThemeSP && window.T4SThemeSP.Notices) window.T4SThemeSP.Notices(error.message);
      else window.alert(error.message);
    } finally {
      removingOffer = false;
      remove.removeAttribute('aria-disabled');
      if (wrapper) wrapper.classList.remove('is--contentUpdate');
    }
  }, true);

  const updateOfferQuantity = async (event, input, quantity) => {
    // Stop the theme before awaiting the cart request; otherwise its own
    // handler would update the main product by itself in parallel.
    event.preventDefault();
    event.stopImmediatePropagation();
    updatingOfferQuantity = true;
    const wrapper = input.closest('[data-cart-wrapper]');
    if (wrapper) wrapper.classList.add('is--contentUpdate');

    try {
      const cartResponse = await fetch(`${cartUrl()}.js`, { credentials: 'same-origin', cache: 'no-store' });
      if (!cartResponse.ok) throw new Error('Could not read the cart. Please try again.');
      const cart = await cartResponse.json();
      const popup = getPopup();
      const updates = quantityUpdates(cart, input.dataset.id, quantity, popup ? getConfig(popup) : {});
      if (!updates) return;
      const response = await fetch(`${cartUrl()}/update.js`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ updates, sections: cartSections(), sections_url: window.location.pathname })
      });
      const data = await response.json();
      if (!response.ok || data.status) throw new Error(data.description || 'Could not update the selected offer. Please try again.');
      renderUpdatedCart(data);
    } catch (error) {
      if (window.T4SThemeSP && window.T4SThemeSP.Notices) window.T4SThemeSP.Notices(error.message);
      else window.alert(error.message);
    } finally {
      updatingOfferQuantity = false;
      if (wrapper) wrapper.classList.remove('is--contentUpdate');
    }
  };

  const syncedInput = element => element && element.closest('[data-action-change][data-id][data-gift-offer-quantity]');

  // Kalles calls jQuery.trigger('change') after its quantity button click.
  // That is not a native change event, so capture the actual button click
  // before Kalles' delegated click handler instead.
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-quantity-selector]');
    if (!button || updatingOfferQuantity) return;
    const quantityWrapper = button.closest('[data-quantity-wrapper]');
    const input = syncedInput(quantityWrapper && quantityWrapper.querySelector('[data-quantity-value]'));
    if (!input) return;

    const current = Number(input.value) || 0;
    const step = Number(input.getAttribute('step')) || 1;
    const min = Number(input.getAttribute('min')) || 0;
    const max = Number(input.getAttribute('max')) || Infinity;
    const decimals = (String(step).split('.')[1] || '').length;
    const next = button.matches('[data-increase-qty]')
      ? Math.min(max, current + step)
      : current <= min ? min : Math.max(0, current - step);
    const quantity = Number(next.toFixed(decimals));

    // Preserve the theme's normal boundary behaviour (including its notice).
    if (quantity === current) return;
    input.value = String(quantity);
    await updateOfferQuantity(event, input, quantity);
  }, true);

  // Also support typing a quantity directly into the input, which emits a
  // real native change event.
  document.addEventListener('change', async event => {
    const input = syncedInput(event.target);
    if (!input || updatingOfferQuantity) return;
    const quantity = Math.max(0, Number(input.value));
    if (!Number.isFinite(quantity)) return;
    await updateOfferQuantity(event, input, quantity);
  }, true);

})();
