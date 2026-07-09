// FOUC Prevention — runs synchronously before any CSS renders.
// Sets typography CSS variables from localStorage so there is no
// flash of un-themed content when the panel reopens.
(function () {
  try {
    // Apply toolbar layout (defaults to 'compact')
    var layout = localStorage.getItem('toolbarLayout');
    if (layout !== 'comfortable' && layout !== 'compact') {
      layout = 'compact';
    }
    document.documentElement.setAttribute('data-toolbar-layout', layout);

    if (localStorage.getItem('typography-enabled') !== 'true') return;
    var r = document.documentElement.style;
    var fonts = {
      'system':        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'google-sans':   '"Google Sans", "Product Sans", ui-rounded, sans-serif',
      'inter':         '"Inter", sans-serif',
      'noto-sans':     '"Noto Sans", sans-serif',
      'ibm-plex-sans': '"IBM Plex Sans", sans-serif'
    };
    var sizes = { tiny: '11px', small: '12px', default: '13px', medium: '14px', large: '16px', xlarge: '18px' };
    var zooms = { small: '0.85', default: '1', large: '1.15', xlarge: '1.3' };
    var ff = localStorage.getItem('typography-font-family') || 'system';
    var fs = localStorage.getItem('typography-font-size')   || 'default';
    var nz = localStorage.getItem('typography-navbar-zoom') || 'default';
    if (fonts[ff]) r.setProperty('--panel-font-family', fonts[ff]);
    if (sizes[fs]) r.setProperty('--panel-font-size',   sizes[fs]);
    if (zooms[nz]) r.setProperty('--toolbar-zoom',      zooms[nz]);
  } catch (_) {}
})();
