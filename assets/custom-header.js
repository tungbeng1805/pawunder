(function () {
  function qs(root, sel) {
    return root.querySelector(sel);
  }

  function qsa(root, sel) {
    return Array.from(root.querySelectorAll(sel));
  }

  function setExpanded(btn, expanded) {
    if (!btn) return;
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function openSearchModal() {
    const modal = document.querySelector('#search-modal');
    if (modal && typeof modal.showDialog === 'function') {
      modal.showDialog();
      return true;
    }

    // Fallback for themes that expose the dialog element differently
    const dialog = document.querySelector('#search-modal dialog, #search-modal [ref="dialog"]');
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
      return true;
    }

    return false;
  }

  function initHeader(root) {
    if (!root || root.dataset.pawHeaderReady === 'true') return;
    root.dataset.pawHeaderReady = 'true';

    const drawer = qs(root, '[data-paw-drawer]');
    const drawerOpenBtns = qsa(root, '[data-paw-drawer-open]');
    const drawerCloseBtns = qsa(root, '[data-paw-drawer-close]');
    const locale = qs(root, '[data-paw-locale]');
    const localeBtn = qs(root, '[data-paw-locale-toggle]');
    const localePanel = qs(root, '[data-paw-locale-panel]');
    const searchTriggers = qsa(root, '[data-paw-open-search]');

    function openDrawer() {
      if (!drawer) return;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('paw-header-drawer-open');
      drawerOpenBtns.forEach(function (btn) {
        setExpanded(btn, true);
      });
      const closeBtn = qs(drawer, '[data-paw-drawer-close]');
      if (closeBtn) closeBtn.focus();
    }

    function closeDrawer() {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('paw-header-drawer-open');
      drawerOpenBtns.forEach(function (btn) {
        setExpanded(btn, false);
      });
    }

    function closeLocale() {
      if (!localePanel || !localeBtn || !locale) return;
      localePanel.setAttribute('hidden', '');
      locale.classList.remove('is-open');
      setExpanded(localeBtn, false);
    }

    function openLocale() {
      if (!localePanel || !localeBtn || !locale) return;
      localePanel.removeAttribute('hidden');
      locale.classList.add('is-open');
      setExpanded(localeBtn, true);
    }

    drawerOpenBtns.forEach(function (btn) {
      btn.addEventListener('click', openDrawer);
    });

    drawerCloseBtns.forEach(function (btn) {
      btn.addEventListener('click', closeDrawer);
    });

    searchTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        // Theme morph `on:click` may also handle this; JS is a reliable fallback.
        const opened = openSearchModal();
        if (opened) {
          event.preventDefault();
        }
      });
    });

    if (locale && localeBtn && localePanel) {
      localeBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        const isHidden = localePanel.hasAttribute('hidden');
        if (isHidden) {
          openLocale();
        } else {
          closeLocale();
        }
      });

      // Prevent clicks inside panel from closing immediately
      localePanel.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      document.addEventListener('click', function (event) {
        if (!locale.contains(event.target)) {
          closeLocale();
        }
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeDrawer();
        closeLocale();
      }
    });

    function updateOffset() {
      document.documentElement.style.setProperty(
        '--paw-header-offset',
        root.offsetHeight + 'px'
      );
      document.body.style.setProperty('--header-height', root.offsetHeight + 'px');
      document.body.style.setProperty(
        '--header-group-height',
        (document.getElementById('header-group')?.offsetHeight || root.offsetHeight) + 'px'
      );
    }

    updateOffset();
    window.addEventListener('resize', updateOffset);
  }

  function boot() {
    qsa(document, '[data-paw-site-header]').forEach(initHeader);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', boot);
})();
