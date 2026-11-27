import { WaterCanvasFX } from './WaterCanvasFX.js';

// 1 hora en milisegundos (60 min * 60 seg * 1000 ms)
const CYCLE_DURATION_MS = 3_600_000;
const SOUND_SRC = './alerta.mp3';

function setProgress(percent, ui) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const rounded = Math.round(clamped);

  ui.progressBar.style.width = `${clamped}%`;
  ui.progressLabel.textContent = `${rounded} / 100`;
  ui.widgetPercent.textContent = `${rounded}%`;
  ui.progressTrack.setAttribute('aria-valuenow', String(rounded));
}

function diagnosticarEntorno() {
  if (!('Notification' in window)) {
    return { ok: false, reason: 'no-support', msg: 'Sin soporte de avisos' };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: 'insecure', msg: 'Usa localhost o HTTPS' };
  }
  return { ok: true, reason: 'ok', msg: 'Listo' };
}

async function pedirPermisoNotificaciones(btnNotify, ui) {
  const env = diagnosticarEntorno();

  if (env.reason === 'no-support') {
    btnNotify.textContent = 'No soportado';
    btnNotify.disabled = true;
    return 'unsupported';
  }

  if (env.reason === 'insecure') {
    btnNotify.textContent = 'Usa localhost/HTTPS';
    console.warn('Notification requiere localhost o HTTPS (no file://).');
    return 'insecure';
  }

  if (Notification.permission === 'granted') {
    btnNotify.textContent = 'Avisos activos';
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    btnNotify.textContent = 'Bloqueado en sitio';
    console.warn('Notificaciones bloqueadas en la configuración del sitio.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      btnNotify.textContent = 'Avisos activos';
    } else if (permission === 'denied') {
      btnNotify.textContent = 'Bloqueado en sitio';
    } else {
      btnNotify.textContent = 'Activar avisos';
    }
    return permission;
  } catch (err) {
    console.error('Error al solicitar permiso de notificación:', err);
    btnNotify.textContent = 'Error de permiso';
    return 'error';
  }
}

async function dispararNotificacionSO(titulo, cuerpo) {
  const env = diagnosticarEntorno();
  if (!env.ok || Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.active) {
        await reg.showNotification(titulo, {
          body: cuerpo,
          tag: 'hidratacion-ciclo',
          renotify: true
        });
        return true;
      }
    }

    const notif = new Notification(titulo, {
      body: cuerpo,
      tag: 'hidratacion-ciclo',
      renotify: true
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    return true;
  } catch (err) {
    console.warn('El sistema/navegador impidió mostrar la notificación externa:', err);
    return false;
  }
}

function reproducirSonido(audioEl) {
  return new Promise((resolve) => {
    audioEl.pause();
    audioEl.currentTime = 0;

    const onDone = () => {
      audioEl.removeEventListener('ended', onDone);
      audioEl.removeEventListener('error', onDone);
      resolve();
    };

    audioEl.addEventListener('ended', onDone, { once: true });
    audioEl.addEventListener('error', onDone, { once: true });

    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        console.warn('No se pudo reproducir alerta.mp3:', err);
        onDone();
      });
    }
  });
}

function main() {
  const progressBar = document.getElementById('progressBar');
  const ui = {
    progressBar,
    progressLabel: document.getElementById('progressLabel'),
    widgetPercent: document.getElementById('widgetPercent'),
    statusText: document.getElementById('statusText'),
    progressTrack: progressBar.parentElement
  };

  const btnStartReset = document.getElementById('btnStartReset');
  const btnNotify = document.getElementById('btnNotify');
  const canvasEl = document.getElementById('waterCanvas');

  const alertAudio = new Audio(SOUND_SRC);
  alertAudio.preload = 'auto';

  const waterFX = new WaterCanvasFX(canvasEl, {
    mode: 'fill-drip',
    initialLevel: 0,
    waterColor: 'rgba(14, 165, 233, 0.78)',
    backWaveColor: 'rgba(56, 189, 248, 0.45)',
    dropColor: 'rgba(125, 211, 252, 0.92)'
  });

  // Estados: 'idle' | 'running' | 'completed'
  let state = 'idle';
  let hasStartedOnce = false;
  let startTime = 0;
  let timerId = null;

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      btnNotify.textContent = 'Avisos activos';
    } else if (Notification.permission === 'denied') {
      btnNotify.textContent = 'Bloqueado en sitio';
    }
  }

  function detenerTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  async function manejarFinDeCiclo() {
    detenerTimer();
    state = 'completed';

    setProgress(100, ui);
    waterFX.setLevel(1);
    waterFX.setAnimation('drip');
    btnStartReset.textContent = 'Reiniciar';

    const enviada = await dispararNotificacionSO(
      '¡Hora de tomar agua!',
      'Pasó 1 hora. Toma un vaso de agua y pulsa Reiniciar.'
    );
    ui.statusText.textContent = enviada ? '¡Toma agua!' : '¡Toma agua! (aviso local)';

    await reproducirSonido(alertAudio);
  }

  function arrancarCiclo() {
    detenerTimer();
    state = 'running';
    startTime = Date.now();
    btnStartReset.textContent = 'Reiniciar';
    ui.statusText.textContent = 'En curso';

    setProgress(0, ui);
    waterFX.setLevel(0);
    waterFX.setAnimation('fill-drip');
    waterFX.start();

    timerId = setInterval(() => {
      if (state !== 'running') return;

      const elapsed = Date.now() - startTime;
      if (elapsed >= CYCLE_DURATION_MS) {
        manejarFinDeCiclo();
        return;
      }

      const ratio = elapsed / CYCLE_DURATION_MS;
      setProgress(ratio * 100, ui);
      waterFX.setLevel(ratio);
    }, 250);
  }

  setProgress(0, ui);
  waterFX.setLevel(0);
  waterFX.start();

  btnStartReset.addEventListener('click', async () => {
    const primeraVez = !hasStartedOnce;
    hasStartedOnce = true;

    if (primeraVez) {
      await reproducirSonido(alertAudio);
      if ('Notification' in window && Notification.permission === 'default') {
        await pedirPermisoNotificaciones(btnNotify, ui);
      }
    }

    arrancarCiclo();
  });

  btnNotify.addEventListener('click', async () => {
    const res = await pedirPermisoNotificaciones(btnNotify, ui);
    if (res === 'granted') {
      await dispararNotificacionSO(
        '¡Hora de tomar agua!',
        'Avisos activados. Te avisaré cada hora cuando termine el ciclo.'
      );
      await reproducirSonido(alertAudio);
    }
  });
}

main();
