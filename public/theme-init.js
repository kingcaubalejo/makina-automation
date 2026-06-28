(function () {
  try {
    var stored = localStorage.getItem('makina:theme');
    var theme;
    if (stored === 'dark' || stored === 'light') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    } else {
      theme = 'light';
    }
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
