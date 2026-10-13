(() => {
  if (window.GiftOfferPopupLoaded) return;
  window.GiftOfferPopupLoaded = true;

  let pendingForm = null;
  let activePopup = null;
  let lastTrigger = null;
  let addingOffer = false;

  const getPopup = () => document.querySelector('[data-gift-offer-popup]');
  const getConfig = popup => {
    try { return JSON.parse(popup.querySelector('[data-gift-offer-config]').textContent); }
    catch (_) { return {}; }
  };

  const cartIsOpen = () => {
    const drawer = document.querySelector('#t4s-mini_cart');
    return drawer && drawer.getAttribute('aria-hidden') === 'false';
  };

  const closePopup = (restoreFocus = true) => {
    if (!activePopup) return;
    const trigger = lastTrigger;
    activePopup.hidden = true;
    activePopup.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('gift-offer-popup-open');
    activePopup = null;
    pendingForm = null;
    lastTrigger = null;
    if (restoreFocus && trigger) trigger.focus();
  };

  const openPopup = (form, trigger) => {
    if (addingOffer || cartIsOpen()) return;
    const popup = getPopup();
    if (!popup) return;
    pendingForm = form;
    lastTrigger = trigger;
    activePopup = popup;
    popup.hidden = false;
    popup.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('gift-offer-popup-open');
    popup.querySelector('[data-gift-offer-error]').hidden = true;
    popup.querySelector('[data-gift-offer-pick]').focus();
  };

  const formItem = form => {
    const formData = new FormData(form);
    const id = formData.get('id');
    if (!id) throw new Error('Please select a product variant first.');
    const properties = {};
    formData.forEach((value, key) => {
      const match = key.match(/^properties\[(.*)\]$/);
      if (match && value !== '') properties[match[1]] = value;
    });
    return { id: Number(id), quantity: Math.max(1, Number(formData.get('quantity') || 1)), properties };
  };

  const refreshDrawer = async () => {
    const drawer = document.querySelector('#t4s-mini_cart');
    if (!drawer) return;
    const response = await fetch(`${window.location.pathname}?section_id=mini_cart`, { credentials: 'same-origin', headers: { 'Cache-Control': 'no-cache' } });
    if (response.ok) drawer.innerHTML = await response.text();
  };

  const openDrawer = () => {
    const drawer = document.querySelector('#t4s-mini_cart');
    if (!drawer) return;
    if (window.T4SThemeSP && window.T4SThemeSP.Drawer) window.T4SThemeSP.Drawer.opend(window.jQuery_T4NT ? window.jQuery_T4NT(drawer) : drawer);
    else drawer.setAttribute('aria-hidden', 'false');
  };

  // Kalles handles [data-atc-form] on click (instead of submitting the form),
  // so this capture listener must run before the theme's delegated jQuery handler.
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-atc-form], button[name="add"]');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const form = button.closest('form[data-type="add-to-cart-form"], form[action*="/cart/add"]');
    if (!form || !getPopup()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Theme/app callbacks may replay ATC after the gift request finishes.
    // Only a fresh customer click can start another offer selection.
    if (event.isTrusted === false || addingOffer || cartIsOpen()) return;
    openPopup(form, button);
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-type="add-to-cart-form"], form[action*="/cart/add"]');
    if (!form || form.dataset.giftOfferBypass === 'true') return;
    const submitter = event.submitter;
    if (submitter && !submitter.matches('[data-atc-form], [name="add"]')) return;
    if (!getPopup()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const activation = window.navigator && window.navigator.userActivation;
    if (event.isTrusted === false || addingOffer || cartIsOpen() || (activation && !activation.isActive)) return;
    openPopup(form, submitter || form.querySelector('[data-atc-form], [name="add"]'));
  }, true);

  document.addEventListener('click', async event => {
    const popup = event.target.closest('[data-gift-offer-popup]');
    if (!popup) return;
    if (event.target.closest('[data-gift-offer-close]')) { closePopup(); return; }
    const choice = event.target.closest('.gift-offer-popup__choice');
    if (choice) {
      popup.querySelectorAll('.gift-offer-popup__choice').forEach(item => item.classList.toggle('is-selected', item === choice));
      choice.querySelector('input').checked = true;
      return;
    }
    const pickButton = event.target.closest('[data-gift-offer-pick]');
    if (!pickButton || !pendingForm) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (addingOffer || pickButton.disabled) return;
    addingOffer = true;

    const error = popup.querySelector('[data-gift-offer-error]');
    const selected = popup.querySelector('input[type="radio"]:checked');
    const config = getConfig(popup);
    try {
      const mainItem = formItem(pendingForm);
      // This private property is only for the cart label. It is not the
      // FREE GIFT marker, which remains exclusive to gift line items.
      mainItem.properties['_Gift offer type'] = selected.value;
      // A distinct group also prevents gifts from separate offers merging.
      const group = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      mainItem.properties['_Gift offer group'] = group;
      const gifts = (config[selected.value] || []).map(item => ({
        ...item, properties: { ...item.properties, '_Gift offer group': group }
      }));
      const items = [mainItem].concat(gifts);
      pickButton.disabled = true;
      const response = await fetch(window.T4Sroutes ? window.T4Sroutes.cart_add_url + '.js' : '/cart/add.js', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        // Kalles' Cart.renderContents requires both fragments; cart_data contains
        // the item count/total values used while refreshing the mini cart.
        body: JSON.stringify({ items, sections: 'cart_data,mini_cart', sections_url: window.location.pathname })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.description || 'Could not add the selected offer to cart.');
      }
      const data = await response.json();
      // The drawer takes focus after success; do not focus the ATC trigger.
      closePopup(false);
      if (data.sections && window.T4SThemeSP && window.T4SThemeSP.Cart && window.T4SThemeSP.Cart.renderContents) {
        window.T4SThemeSP.Cart.renderContents(data.sections);
        if (window.jQuery_T4NT) window.jQuery_T4NT(document).trigger('cart:updated').trigger('add:cart:success');
      } else {
        await refreshDrawer();
      }
      openDrawer();
      document.dispatchEvent(new CustomEvent('gift-offer:added'));
    } catch (message) {
      error.textContent = message.message || 'Could not add the selected offer to cart.';
      error.hidden = false;
    } finally {
      addingOffer = false;
      pickButton.disabled = false;
    }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePopup(); });
})();
