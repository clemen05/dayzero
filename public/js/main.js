// Arranque del navegador: pide los datos a la API y luego carga el motor, los textos y la interfaz.
(function () {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="card"><p class="eyebrow">DayZero</p><h2>Cargando datos…</h2></div>';

  function cargar(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src));
      document.body.appendChild(s);
    });
  }

  fetch('/api/datos')
    .then((r) => { if (!r.ok) throw new Error('La API respondió ' + r.status); return r.json(); })
    .then((datos) => { window.DZ_DATA = datos; })
    .then(() => cargar('/js/engine.js'))
    .then(() => cargar('/js/juego.js'))
    .then(() => cargar('/js/i18n.js'))
    .then(() => cargar('/js/app.js'))
    .catch((e) => {
      app.innerHTML = '<div class="card"><h2>No se han podido cargar los datos</h2><p class="lead"></p></div>';
      app.querySelector('.lead').textContent = e.message + '. Comprueba que el servidor está en marcha (npm start).';
    });
})();
