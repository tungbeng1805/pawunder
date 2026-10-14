const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/gift-offer-popup.js'), 'utf8');
const cartSource = fs.readFileSync(path.join(__dirname, '../assets/gift-offer-cart.js'), 'utf8');
const config = {
  bogo: [{ id: 20, quantity: 1, properties: { 'FREE GIFT': 'true' } }],
  combo: [{ id: 20, quantity: 1 }, { id: 30, quantity: 1 }]
};
const main = (key, group, type = 'bogo') => ({ key, quantity: 1, properties: { '_Gift offer type': type, ...(group && { '_Gift offer group': group }) } });
const gift = (key, group, variant_id = 20, quantity = 1) => ({ key, variant_id, quantity, properties: { 'FREE GIFT': 'true', ...(group && { '_Gift offer group': group }) } });

function setup(items, options = {}) {
  const listeners = [];
  const requests = [];
  const rendered = [];
  const errors = [];
  const classes = new Set();
  const popup = { querySelector: () => ({ textContent: JSON.stringify(config) }) };
  const window = {
    location: { pathname: options.cartPage ? '/cart' : '/products/test', reload() {} },
    T4Sroutes: { cart_url: '/en/cart' },
    cartT4SectionID: options.cartPage ? 'template--main-cart' : undefined,
    T4SThemeSP: { Cart: { renderContents: data => rendered.push(data) }, Notices: error => errors.push(error) }
  };
  const document = {
    addEventListener: (name, fn, capture) => listeners.push({ name, fn, capture }),
    querySelector: () => options.noPopup ? null : popup
  };
  vm.runInNewContext(cartSource, {
    window, document,
    fetch: async (url, init = {}) => {
      requests.push({ url, body: init.body && JSON.parse(init.body) });
      if (options.fail) return { ok: false };
      return { ok: true, json: async () => init.method ? { sections: { cart_data: 'count', [window.cartT4SectionID || 'mini_cart']: 'cart' } } : { items } };
    }
  });
  const remove = {
    dataset: { id: options.key || items[0].key },
    setAttribute() {}, removeAttribute() {},
    closest: () => ({ classList: { add: name => classes.add(name), remove: name => classes.delete(name) } })
  };
  const event = {
    target: { closest: selector => selector.includes('data-gift-offer-main') && !options.normal ? remove : null },
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }
  };
  const click = () => listeners.find(listener => listener.name === 'click' && listener.capture).fn(event);
  return { click, requests, rendered, errors, event, classes };
}

test('removes only the selected offer and its gifts in a single update', async () => {
  const ctx = setup([main('main-a', 'a', 'combo'), gift('gift-a', 'a'), gift('gift-a2', 'a', 30), main('main-b', 'b'), gift('gift-b', 'b'), { key: 'paid-gift', variant_id: 20, properties: {} }]);
  await ctx.click();
  assert.equal(ctx.requests[0].url, '/en/cart.js');
  assert.equal(ctx.requests[1].url, '/en/cart/update.js');
  assert.deepEqual(ctx.requests[1].body.updates, { 'main-a': 0, 'gift-a': 0, 'gift-a2': 0 });
  assert.equal(ctx.rendered.length, 1);
  assert.equal(ctx.event.stopped, true);
  assert.equal(ctx.classes.size, 0);
});

test('refreshes the full cart section and removes groups even with popup disabled', async () => {
  const ctx = setup([main('main', 'a'), gift('gift', 'a')], { cartPage: true, noPopup: true });
  await ctx.click();
  assert.equal(ctx.requests[1].body.sections, 'cart_data,template--main-cart');
  assert.deepEqual(ctx.requests[1].body.updates, { main: 0, gift: 0 });
});

test('legacy merged gifts retain the other offer quantity', async () => {
  const ctx = setup([main('main-a'), main('main-b', null, 'combo'), gift('shared-gift', null, 20, 2), gift('combo-only', null, 30)]);
  await ctx.click();
  assert.deepEqual(ctx.requests[1].body.updates, { 'main-a': 0, 'shared-gift': 1 });
});

test('last legacy offer clears unlinked gifts and preserves new groups', async () => {
  const ctx = setup([main('legacy'), gift('legacy-gift'), main('new-main', 'new'), gift('new-gift', 'new')]);
  await ctx.click();
  assert.deepEqual(ctx.requests[1].body.updates, { legacy: 0, 'legacy-gift': 0 });
});

test('ordinary products continue through the theme remove handler', async () => {
  const ctx = setup([{ key: 'ordinary', properties: {} }], { normal: true });
  await ctx.click();
  assert.equal(ctx.requests.length, 0);
  assert.equal(ctx.event.prevented, undefined);
});

test('read failures release the removal lock and display an error', async () => {
  const ctx = setup([main('main', 'a')], { fail: true });
  await ctx.click();
  await ctx.click();
  assert.equal(ctx.requests.length, 2);
  assert.equal(ctx.errors.length, 2);
  assert.equal(ctx.classes.size, 0);
});

test('duplicate clicks do not send overlapping cart mutations', async () => {
  const ctx = setup([main('main', 'a'), gift('gift', 'a')]);
  await Promise.all([ctx.click(), ctx.click()]);
  assert.equal(ctx.requests.length, 2);
});

test('quantity button keeps every grouped gift in sync with a 1–2 offer', async () => {
  const listeners = [];
  const requests = [];
  const rendered = [];
  const cart = {
    items: [
      main('main', 'group-a', 'combo'),
      gift('gift-a', 'group-a', 20),
      gift('gift-b', 'group-a', 30),
      main('other', 'group-b'),
      gift('other-gift', 'group-b')
    ]
  };
  const wrapperClasses = new Set();
  const wrapper = { classList: { add: item => wrapperClasses.add(item), remove: item => wrapperClasses.delete(item) } };
  const input = {
    value: '1', dataset: { id: 'main' },
    getAttribute: attribute => ({ step: '1', min: '1', max: '9999' })[attribute],
    closest: selector => selector === '[data-cart-wrapper]' ? wrapper : selector.includes('data-gift-offer-quantity') ? input : null
  };
  const quantityWrapper = { querySelector: selector => selector === '[data-quantity-value]' ? input : null };
  const increase = { closest: selector => selector === '[data-quantity-wrapper]' ? quantityWrapper : null, matches: selector => selector === '[data-increase-qty]' };
  const popup = { querySelector: () => ({ textContent: JSON.stringify(config) }) };
  const window = {
    location: { pathname: '/products/test', reload() {} },
    T4Sroutes: { cart_url: '/en/cart' },
    T4SThemeSP: { Cart: { renderContents: sections => rendered.push(sections) } }
  };
  const document = {
    addEventListener: (name, fn, capture) => listeners.push({ name, fn, capture }),
    querySelector: () => popup
  };
  vm.runInNewContext(cartSource, {
    window, document,
    fetch: async (url, init = {}) => {
      requests.push({ url, body: init.body && JSON.parse(init.body) });
      return { ok: true, json: async () => init.method ? { sections: { cart_data: 'count', mini_cart: 'cart' } } : cart };
    }
  });
  const event = {
    target: { closest: selector => selector === '[data-quantity-selector]' ? increase : null },
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }
  };
  await listeners.filter(listener => listener.name === 'click' && listener.capture).at(-1).fn(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(requests[0].url, '/en/cart.js');
  assert.deepEqual(requests[1].body.updates, { main: 2, 'gift-a': 2, 'gift-b': 2 });
  assert.equal(rendered.length, 1);
  assert.equal(wrapperClasses.size, 0);
});

for (const [order, combinedSource] of [
  ['popup first', source + '\n' + cartSource],
  ['cart first', cartSource + '\n' + source]
]) {
test(`popup remains closed on load and closes after adding linked gifts (${order})`, async () => {
  const listeners = [];
  const bodies = [];
  const error = { hidden: true };
  const pick = { focus() {}, disabled: false };
  const popupAttributes = { 'aria-hidden': 'true' };
  const popup = {
    hidden: true, setAttribute(name, value) { popupAttributes[name] = value; },
    querySelector(selector) {
      if (selector === '[data-gift-offer-config]') return { textContent: JSON.stringify(config) };
      if (selector === '[data-gift-offer-error]') return error;
      if (selector === '[data-gift-offer-pick]') return pick;
      if (selector === 'input[type="radio"]:checked') return { value: 'bogo' };
    }
  };
  const form = { dataset: {}, querySelector: () => trigger };
  let triggerFocusCount = 0;
  const trigger = { closest: () => form, getAttribute() {}, focus() { triggerFocusCount++; } };
  const atcClick = (isTrusted = true) => ({
    isTrusted,
    target: { closest: selector => selector.includes('data-atc-form') ? trigger : null },
    preventDefault() {}, stopImmediatePropagation() {}
  });
  const clickAdd = (isTrusted = true) => {
    const event = atcClick(isTrusted);
    for (const listener of listeners.filter(listener => listener.name === 'click' && listener.capture)) listener.fn(event);
  };
  const submitAdd = (isTrusted = true) => listeners.find(listener => listener.name === 'submit').fn({
    isTrusted, target: { closest: () => form },
    preventDefault() {}, stopImmediatePropagation() {}
  });
  let drawerHidden = 'true';
  const drawer = { getAttribute: () => drawerHidden, setAttribute(name, value) { drawerHidden = value; } };
  const popupStatesAfterRefresh = [];
  let nextGroup = 0;
  const window = {
    crypto: { randomUUID: () => `group-${++nextGroup}` },
    location: { pathname: '/products/test' },
    T4SThemeSP: { Cart: { renderContents() {
      // Exercise re-entry while adding and again after the request has finished.
      clickAdd();
      submitAdd();
      popupStatesAfterRefresh.push(popup.hidden);
    } }, Drawer: { opend() { drawerHidden = 'false'; } } }
  };
  const document = {
    addEventListener: (name, fn, capture) => listeners.push({ name, fn, capture }),
    querySelector: selector => selector === '[data-gift-offer-popup]' ? popup : selector === '#t4s-mini_cart' ? drawer : null,
    documentElement: { classList: { add() {}, remove() {} } },
    dispatchEvent() {}
  };
  vm.runInNewContext(combinedSource, {
    window, document,
    FormData: class {
      get(key) { return key === 'id' ? '10' : '1'; }
      forEach(callback) { callback('engraving', 'properties[custom]'); }
    },
    CustomEvent: class {},
    fetch: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ sections: { cart_data: 'count', mini_cart: 'cart' } }) };
    }
  });
  assert.equal(popup.hidden, true);
  assert.equal(popupAttributes['aria-hidden'], 'true');
  assert.equal(bodies.length, 0);
  clickAdd(false);
  submitAdd(false);
  assert.equal(popup.hidden, true, 'programmatic ATC on load must not open the popup');
  submitAdd();
  assert.equal(popup.hidden, false, 'a customer keyboard submit must still open the popup');
  listeners.find(listener => listener.name === 'keydown').fn({ key: 'Escape' });
  assert.equal(popup.hidden, true);
  for (let n = 0; n < 2; n++) {
    drawerHidden = 'true';
    clickAdd();
    assert.equal(popup.hidden, false);
    assert.equal(popupAttributes['aria-hidden'], 'false');
    await listeners.find(listener => listener.name === 'click' && !listener.capture).fn({
      target: { closest: selector => selector === '[data-gift-offer-popup]' ? popup : selector === '[data-gift-offer-pick]' ? pick : null },
      preventDefault() {}, stopImmediatePropagation() {}
    });
    assert.equal(popup.hidden, true);
    assert.equal(popupAttributes['aria-hidden'], 'true');
    clickAdd(false);
    submitAdd(false);
    clickAdd();
    submitAdd();
    assert.equal(popup.hidden, true, 'ATC replay after success must not reopen the popup above the cart');
    drawerHidden = 'true';
    clickAdd(false);
    submitAdd(false);
    assert.equal(popup.hidden, true, 'late programmatic ATC must stay blocked even after the drawer closes');
  }
  assert.deepEqual(popupStatesAfterRefresh, [true, true]);
  assert.equal(triggerFocusCount, 1, 'restore focus on cancellation, but not after a successful add');
  assert.equal(error.hidden, true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].items[0].properties.custom, 'engraving');
  assert.equal(bodies[0].items[0].properties['FREE GIFT'], undefined);
  assert.equal(bodies[0].items[1].properties['FREE GIFT'], 'true');
  assert.equal(bodies[0].items[0].properties['_Gift offer group'], bodies[0].items[1].properties['_Gift offer group']);
  assert.notEqual(bodies[0].items[0].properties['_Gift offer group'], bodies[1].items[0].properties['_Gift offer group']);
  assert.equal(config.bogo[0].properties['_Gift offer group'], undefined);
});
}

test('cart removal initializes independently without initializing or accessing the popup', () => {
  const window = {};
  const listeners = [];
  const context = vm.createContext({
    window,
    document: {
      addEventListener: (name, fn) => listeners.push({ name, fn }),
      querySelector() { assert.fail('Cart initialization must not access the popup'); }
    }
  });
  vm.runInContext(cartSource, context);
  vm.runInContext(cartSource, context);
  assert.equal(window.GiftOfferCartLoaded, true);
  assert.equal(window.GiftOfferPopupLoaded, undefined);
  assert.equal(listeners.length, 3);
  assert.equal(listeners[0].name, 'click');
});
