import { examples, presets, installCommands, consoleViews, type ExampleKey } from '../data/examples';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = document.querySelector<HTMLElement>('[data-demo-status]');
let currentExample: ExampleKey = 'comments';
let replayTimer: ReturnType<typeof setTimeout> | undefined;

function paintCode(selector: string, code: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  target.replaceChildren(...code.split('\n').map(line => {
    const span = document.createElement('span');
    span.className = `code-line${line.startsWith('//') ? ' comment' : ''}`;
    span.textContent = line || ' ';
    return span;
  }));
}

function stopReplay() {
  clearTimeout(replayTimer);
  document.querySelector('.demo-stage')?.classList.remove('demo-replaying');
  const button = document.querySelector<HTMLButtonElement>('[data-run-example]');
  if (button) { button.disabled = false; button.querySelector('span')!.textContent = 'Replay example'; }
}

function selectExample(key: ExampleKey) {
  stopReplay();
  currentExample = key;
  const example = examples[key];
  document.querySelectorAll<HTMLElement>('[data-example]').forEach(tab => {
    const selected = tab.dataset.example === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelector('#demo-panel')?.setAttribute('aria-labelledby', `tab-${key}`);
  paintCode('[data-demo-before]', example.before);
  paintCode('[data-demo-after]', example.after);
  document.querySelectorAll('[data-demo-file]').forEach(node => { node.textContent = example.file; });
  const values = {
    '[data-demo-finding]': example.finding,
    '[data-demo-result]': example.result,
    '[data-demo-language]': example.language,
    '[data-before-count]': example.beforeCount,
    '[data-after-count]': example.afterCount,
  };
  Object.entries(values).forEach(([selector, value]) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  });
  if (live) live.textContent = `${example.label}: ${example.finding} ${example.result}`;
  if (!reduceMotion) {
    document.querySelectorAll<HTMLElement>('.demo-code').forEach(code => {
      code.classList.remove('is-swapping');
      void code.offsetWidth;
      code.classList.add('is-swapping');
    });
  }
}

const demoColumns = document.querySelector<HTMLElement>('.demo-columns');
function reserveDemoHeight() {
  if (!demoColumns) return;
  demoColumns.style.minHeight = '';
  let tallest = 0;
  (Object.keys(examples) as ExampleKey[]).forEach(key => {
    paintCode('[data-demo-before]', examples[key].before);
    paintCode('[data-demo-after]', examples[key].after);
    tallest = Math.max(tallest, demoColumns.offsetHeight);
  });
  paintCode('[data-demo-before]', examples[currentExample].before);
  paintCode('[data-demo-after]', examples[currentExample].after);
  demoColumns.style.minHeight = `${tallest}px`;
}
reserveDemoHeight();
let resizeFrame = 0;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(reserveDemoHeight);
});
document.fonts?.ready.then(reserveDemoHeight);

document.querySelectorAll<HTMLElement>('[data-example]').forEach(tab => {
  tab.addEventListener('click', () => selectExample(tab.dataset.example as ExampleKey));
});

function keyboardTabs(selector: string) {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  }));
}
keyboardTabs('[data-example]');
keyboardTabs('[data-host]');
keyboardTabs('[data-console-view]');

const consoleImage = document.querySelector<HTMLImageElement>('[data-console-image]');
const consoleCaption = document.querySelector<HTMLElement>('[data-console-caption]');
let consoleView: string = consoleViews[0].id;
let consoleTheme = 'light';
let consoleSwap = 0;
function showConsole() {
  const view = consoleViews.find(item => item.id === consoleView) || consoleViews[0];
  const src = `/console/${view.id}-${consoleTheme}.webp`;
  if (consoleCaption) consoleCaption.textContent = view.caption;
  document.querySelector('#console-panel')?.setAttribute('aria-labelledby', `console-tab-${view.id}`);
  if (!consoleImage || consoleImage.getAttribute('src') === src) return;
  const swap = () => { consoleImage.src = src; consoleImage.alt = consoleTheme === 'dark' ? `${view.alt} Dark theme.` : view.alt; };
  const frame = consoleImage.parentElement;
  if (reduceMotion || !frame) { swap(); return; }
  // Decode the next screenshot, then fade it in over the current one: a true crossfade with no blank frame.
  const token = ++consoleSwap;
  const next = new Image(1440, 900);
  next.alt = '';
  next.className = 'console-next';
  next.src = src;
  next.decode().catch(() => undefined).then(() => {
    if (token !== consoleSwap) return;
    frame.querySelectorAll('.console-next').forEach(node => node.remove());
    frame.append(next);
    requestAnimationFrame(() => requestAnimationFrame(() => next.classList.add('is-in')));
    let done = false;
    const finish = () => { if (done) return; done = true; if (token === consoleSwap) swap(); next.remove(); };
    next.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 700);
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-console-view]').forEach(tab => {
  tab.addEventListener('click', () => {
    consoleView = tab.dataset.consoleView || consoleView;
    document.querySelectorAll<HTMLElement>('[data-console-view]').forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    showConsole();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-console-theme]').forEach(button => {
  button.addEventListener('click', () => {
    consoleTheme = button.dataset.consoleTheme || 'light';
    document.querySelectorAll<HTMLElement>('[data-console-theme]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('.console-frame')?.classList.toggle('is-dark', consoleTheme === 'dark');
    showConsole();
  });
});

document.querySelector<HTMLButtonElement>('[data-run-example]')?.addEventListener('click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const example = examples[currentExample];
  if (reduceMotion) {
    if (live) live.textContent = `${example.diagnostic} ${example.result}`;
    return;
  }
  button.disabled = true;
  button.querySelector('span')!.textContent = 'Checking…';
  document.querySelector('.demo-stage')?.classList.add('demo-replaying');
  if (live) live.textContent = example.diagnostic;
  replayTimer = setTimeout(() => {
    stopReplay();
    if (live) live.textContent = example.result;
  }, 1450);
});

document.querySelectorAll<HTMLButtonElement>('[data-host]').forEach(tab => {
  tab.addEventListener('click', () => {
    const host = tab.dataset.host;
    document.querySelectorAll<HTMLElement>('[data-host]').forEach(item => {
      const selected = item.dataset.host === host;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll<HTMLElement>('.install-panel').forEach(panel => { panel.hidden = panel.id !== `install-${host}`; });
  });
});

const presetSelect = document.querySelector<HTMLSelectElement>('#preset');
const configCode = document.querySelector<HTMLElement>('[data-config-code]');
presetSelect?.addEventListener('change', () => {
  const preset = presets.find(item => item.id === presetSelect.value) || presets[0];
  const count = document.querySelector('[data-preset-count]');
  const description = document.querySelector('[data-preset-description]');
  if (count) count.textContent = `${preset.count} categories`;
  if (description) description.textContent = preset.description;
  if (configCode) configCode.textContent = JSON.stringify({ features: { emDash: { enabled: true }, aiWriting: { enabled: true, preset: preset.id } } }, null, 2);
});

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const type = button.dataset.copy;
    const text = type === 'config' ? configCode?.textContent || '' : installCommands[type as keyof typeof installCommands];
    const label = button.querySelector('span');
    try {
      await navigator.clipboard.writeText(text);
      if (label) label.textContent = 'Copied';
      button.setAttribute('aria-label', 'Copied to clipboard');
    } catch {
      const code = button.closest('.config-code, .install-panel, .closing-command, .console-command')?.querySelector('pre');
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      if (label) label.textContent = 'Text selected';
      button.setAttribute('aria-label', 'Text selected. Use your browser copy command.');
    }
    setTimeout(() => { if (label) label.textContent = 'Copy'; button.removeAttribute('aria-label'); }, 2500);
  });
});

if (!reduceMotion && 'IntersectionObserver' in window) {
  // Only content still below the fold is hidden, so nothing visible ever blinks out.
  const fold = window.innerHeight;
  const pending = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    .filter(element => element.getBoundingClientRect().top > fold);
  const settle = (element: HTMLElement) => {
    element.classList.remove('reveal-pending', 'is-revealed');
    element.style.removeProperty('--reveal-delay');
  };
  const observer = new IntersectionObserver(entries => {
    const arriving = entries.filter(entry => entry.isIntersecting)
      .map(entry => entry.target as HTMLElement)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    arriving.forEach((element, index) => {
      observer.unobserve(element);
      element.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 70}ms`);
      element.classList.add('is-revealed');
      element.addEventListener('transitionend', event => { if (event.target === element && event.propertyName === 'transform') settle(element); });
      setTimeout(() => settle(element), 1400);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  pending.forEach(element => { element.classList.add('reveal-pending'); observer.observe(element); });
}

// Hero film: a muted loop while on screen; Sound on restarts it from the top with sound.
function initFilm() {
  const root = document.querySelector<HTMLElement>('[data-film]');
  const video = root?.querySelector<HTMLVideoElement>('[data-film-video]');
  if (!root || !video) return;
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const start = q<HTMLButtonElement>('[data-film-start]');
  const controls = q<HTMLElement>('[data-film-controls]');
  const sound = q<HTMLButtonElement>('[data-film-sound]');
  const pause = q<HTMLButtonElement>('[data-film-pause]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userPaused = false;
  let playAttempt = 0;

  video.controls = false;
  const syncPause = () => {
    q('[data-film-pause-icon]').hidden = video.paused;
    q('[data-film-play-icon]').hidden = !video.paused;
    pause.setAttribute('aria-label', video.paused ? 'Play film' : 'Pause film');
  };
  const syncSound = () => {
    const on = !video.muted;
    sound.setAttribute('aria-pressed', String(on));
    q('[data-film-sound-off]').hidden = on;
    q('[data-film-sound-on]').hidden = !on;
  };
  const showStart = () => {
    start.hidden = false;
    controls.hidden = true;
  };
  const showControls = () => {
    const moveFocus = document.activeElement === start;
    start.hidden = true;
    controls.hidden = false;
    syncPause();
    if (moveFocus) pause.focus({ preventScroll: true });
  };
  const play = () => {
    const attempt = ++playAttempt;
    video.play().then(() => {
      if (attempt === playAttempt && !video.paused) showControls();
    }).catch((error: unknown) => {
      if (attempt !== playAttempt || (error instanceof DOMException && error.name === 'AbortError')) return;
      showStart();
    });
  };
  const stop = () => {
    playAttempt++;
    video.pause();
  };
  const playWithSound = () => {
    userPaused = false;
    video.muted = false;
    video.currentTime = 0;
    play();
  };
  video.addEventListener('play', syncPause);
  video.addEventListener('playing', showControls);
  video.addEventListener('pause', syncPause);
  video.addEventListener('volumechange', syncSound);
  start.addEventListener('click', playWithSound);
  sound.addEventListener('click', () => {
    if (video.muted) playWithSound();
    else video.muted = true;
  });
  pause.addEventListener('click', () => {
    if (video.paused) {
      userPaused = false;
      play();
    } else {
      userPaused = true;
      stop();
    }
  });

  if (reduceMotion) showStart();
  else showControls();
  new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) stop();
      else if (!reduceMotion && !userPaused) play();
    },
    { threshold: 0.35 },
  ).observe(video);
}
initFilm();
