(() => {
  if (window.GiftOfferCartLoaded) return;
  window.GiftOfferCartLoaded = true;

  let removingOffer = false;

  const getPopup = () => document.querySelector('[data-gift-offer-popup]');
  const getConfig = popup => {
    try { return JSON.parse(popup.querySelector('[data-gift-offer-config]').textContent); }
    catch (_) { return {}; }
  };

  const groupProperty = '_Gift offer group';
  const cartUrl = () => window.T4Sroutes ? window.T4Sroutes.cart_url : `${window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/'}cart`;
  const cartSections = () => `cart_data,${window.cartT4SectionID || 'mini_cart'}`;

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
      if (data.sections && Object.values(data.sections).every(Boolean) && window.T4SThemeSP && window.T4SThemeSP.Cart) {
        window.T4SThemeSP.Cart.renderContents(data.sections);
      } else {
        window.location.reload();
      }
    } catch (error) {
      if (window.T4SThemeSP && window.T4SThemeSP.Notices) window.T4SThemeSP.Notices(error.message);
      else window.alert(error.message);
    } finally {
      removingOffer = false;
      remove.removeAttribute('aria-disabled');
      if (wrapper) wrapper.classList.remove('is--contentUpdate');
    }
  }, true);

})();
