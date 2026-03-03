// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "./index.css";

const h = React.createElement;
const Hls = window.Hls;

// ─── Utility helpers ─────────────────────────────────────────────────
function loadLS(key, fallback) {
  try { const v = localStorage.getItem('retrovision-' + key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveLS(key, val) {
  try { localStorage.setItem('retrovision-' + key, JSON.stringify(val)); } catch {}
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ─── Spatial Navigation Hook ─────────────────────────────────────────
// Manages arrow-key focus movement within a container of focusable elements
function useSpatialNavigation(containerRef, active) {
  useEffect(() => {
    if (!active) return;

    function getFocusables() {
      if (!containerRef.current) return [];
      return Array.from(containerRef.current.querySelectorAll(
        'button, [tabindex="0"], input, select, .channel-card, .category-pill, .theme-card, .fav-star, .toggle-switch, .cinema-ctrl-btn'
      )).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
      });
    }

    function getRect(el) {
      return el.getBoundingClientRect();
    }

    function findBestCandidate(current, direction, focusables) {
      const currentRect = getRect(current);
      const cx = currentRect.left + currentRect.width / 2;
      const cy = currentRect.top + currentRect.height / 2;

      let best = null;
      let bestScore = Infinity;

      focusables.forEach(el => {
        if (el === current) return;
        const r = getRect(el);
        const ex = r.left + r.width / 2;
        const ey = r.top + r.height / 2;
        const dx = ex - cx;
        const dy = ey - cy;

        let valid = false;
        let primaryDist = 0;
        let secondaryDist = 0;

        switch (direction) {
          case 'ArrowUp':
            valid = dy < -5;
            primaryDist = Math.abs(dy);
            secondaryDist = Math.abs(dx);
            break;
          case 'ArrowDown':
            valid = dy > 5;
            primaryDist = Math.abs(dy);
            secondaryDist = Math.abs(dx);
            break;
          case 'ArrowLeft':
            valid = dx < -5;
            primaryDist = Math.abs(dx);
            secondaryDist = Math.abs(dy);
            break;
          case 'ArrowRight':
            valid = dx > 5;
            primaryDist = Math.abs(dx);
            secondaryDist = Math.abs(dy);
            break;
        }

        if (valid) {
          // Score: prioritize primary axis distance, penalize off-axis distance
          const score = primaryDist + secondaryDist * 3;
          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        }
      });

      return best;
    }

    function handleKey(e) {
      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');

      // Skip spatial nav if typing in an input (unless it's arrow keys in select)
      if (isInput && active.tagName !== 'SELECT' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // If nothing focused in our container, focus first element
        if (!containerRef.current.contains(active)) {
          focusables[0]?.focus();
          e.preventDefault();
          return;
        }

        const candidate = findBestCandidate(active, e.key, focusables);
        if (candidate) {
          candidate.focus();
          // Scroll into view if needed
          candidate.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
          e.preventDefault();
        }
      }

      // Enter key activates focused element
      if (e.key === 'Enter' && active && containerRef.current.contains(active)) {
        if (active.tagName !== 'INPUT' && active.tagName !== 'SELECT') {
          active.click();
          e.preventDefault();
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [containerRef, active]);
}

// ─── Static / Snow Canvas ─────────────────────────────────────────────
function StaticNoise({ show }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!show) { if (frameRef.current) cancelAnimationFrame(frameRef.current); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let running = true;

    function draw() {
      if (!running) return;
      const w = canvas.width = canvas.offsetWidth;
      const ht = canvas.height = canvas.offsetHeight;

      // In some layout transitions the canvas may be temporarily 0x0.
      if (!w || !ht) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const imageData = ctx.createImageData(w, ht);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 200;
      }
      ctx.putImageData(imageData, 0, 0);
      frameRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => { running = false; if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [show]);

  if (!show) return null;
  return h('canvas', { ref: canvasRef, className: 'static-canvas', style: { width: '100%', height: '100%' } });
}

// ─── Test Pattern (Channel 0) ─────────────────────────────────────────
function TestPattern() {
  const colors = ['#fff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000'];
  return h('div', { className: 'test-pattern' },
    ...colors.map((c, i) => h('div', { key: i, className: 'test-bar', style: { background: c } }))
  );
}

// ─── Main App ──────────────────────────────────────────────────────────
export function App() {
  // State
  const [poweredOn, setPoweredOn] = useState(loadLS('settings', {}).poweredOn !== false);
  const [powerAnim, setPowerAnim] = useState(null); // 'on' or 'off'
  const [channels, setChannels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentChannelIdx, setCurrentChannelIdx] = useState(loadLS('settings', {}).lastChannel || 0);
  const [volume, setVolume] = useState(loadLS('settings', {}).volume || 0.7);
  const [muted, setMuted] = useState(loadLS('settings', {}).muted || false);
  const [showOsd, setShowOsd] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuTab, setMenuTab] = useState('guide'); // guide, favorites, settings
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [favorites, setFavorites] = useState(loadLS('favorites', []));
  const [history, setHistory] = useState(loadLS('history', []));
  const [settings, setSettings] = useState(loadLS('settings-prefs', { scanlines: true, crtIntensity: 0.5, theme: 'wood' }));
  const [streamError, setStreamError] = useState(false);
  const [isStatic, setIsStatic] = useState(true);
  const [showRemote, setShowRemote] = useState(false);
  const [numberBuffer, setNumberBuffer] = useState('');
  const [degaussing, setDegaussing] = useState(false);
  const [isFramelessFullscreen, setIsFramelessFullscreen] = useState(false);
  const [antennaWobble, setAntennaWobble] = useState(false);
  const [showTestPattern, setShowTestPattern] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(loadLS('settings-prefs', {}).theme === 'cinema');
  const [cinemaControlsVisible, setCinemaControlsVisible] = useState(false);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const osdTimeout = useRef(null);
  const volumeTimeout = useRef(null);
  const numberTimeout = useRef(null);
  const cinemaHideTimeout = useRef(null);
  const mainContainerRef = useRef(null);

  // Cinema mode: auto-hide controls on inactivity
  const showCinemaControls = useCallback(() => {
    setCinemaControlsVisible(true);
    if (cinemaHideTimeout.current) clearTimeout(cinemaHideTimeout.current);
    cinemaHideTimeout.current = setTimeout(() => setCinemaControlsVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (!cinemaMode) return;
    function handleActivity() { showCinemaControls(); }
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [cinemaMode, showCinemaControls]);

  // Apply cinema body class
  useEffect(() => {
    if (cinemaMode) {
      document.body.classList.add('cinema-mode');
    } else {
      document.body.classList.remove('cinema-mode');
    }
  }, [cinemaMode]);

  // Sync cinemaMode with settings.theme
  useEffect(() => {
    setCinemaMode(settings.theme === 'cinema');
  }, [settings.theme]);

  // Merge channel+stream data
  const mergedChannels = useMemo(() => {
    if (!channels.length || !streams.length) return [];
    const streamMap = {};
    streams.forEach(s => {
      if (!streamMap[s.channel]) streamMap[s.channel] = [];
      streamMap[s.channel].push(s);
    });
    return channels
      .filter(ch => streamMap[ch.id] && streamMap[ch.id].length > 0)
      .map((ch, idx) => ({
        ...ch,
        streams: streamMap[ch.id],
        channelNumber: idx + 1
      }));
  }, [channels, streams]);

  // Filtered channels for menu
  const filteredChannels = useMemo(() => {
    let filtered = mergedChannels;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(ch => ch.categories && ch.categories.includes(selectedCategory));
    }
    if (selectedCountry !== 'all') {
      filtered = filtered.filter(ch => ch.country === selectedCountry);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(ch =>
        ch.name.toLowerCase().includes(q) ||
        (ch.country && ch.country.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [mergedChannels, selectedCategory, selectedCountry, searchQuery]);

  const currentChannel = mergedChannels[currentChannelIdx] || null;

  // ─── Fetch IPTV data ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const cache = loadLS('channel-cache', null);
        const cacheAge = cache ? Date.now() - cache.cachedAt : Infinity;

        if (cache && cacheAge < 3600000) {
          setChannels(cache.channels);
          setStreams(cache.streams);
          setCategories(cache.categories || []);
          setCountries(cache.countries || []);
          setLoading(false);
          return;
        }

        const [channelsRes, streamsRes, categoriesRes, countriesRes] = await Promise.all([
          fetch('https://iptv-org.github.io/api/channels.json').then(r => r.json()),
          fetch('https://iptv-org.github.io/api/streams.json').then(r => r.json()),
          fetch('https://iptv-org.github.io/api/categories.json').then(r => r.json()).catch(() => []),
          fetch('https://iptv-org.github.io/api/countries.json').then(r => r.json()).catch(() => [])
        ]);

        setChannels(channelsRes);
        setStreams(streamsRes);
        setCategories(categoriesRes);
        setCountries(countriesRes);

        saveLS('channel-cache', {
          channels: channelsRes,
          streams: streamsRes,
          categories: categoriesRes,
          countries: countriesRes,
          cachedAt: Date.now()
        });
      } catch (err) {
        console.error('Failed to fetch IPTV data:', err);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // ─── Play stream ──────────────────────────────────────────────────
  const playStream = useCallback((channel) => {
    if (!channel || !channel.streams || !channel.streams.length) {
      setStreamError(true);
      setIsStatic(true);
      return;
    }

    setStreamError(false);
    setIsStatic(true);
    setShowTestPattern(false);

    const video = videoRef.current;
    if (!video) return;

    // Brief static effect
    setTimeout(() => {
      const streamUrl = channel.streams[0].url;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (Hls.isSupported() && streamUrl.includes('.m3u8')) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          setIsStatic(false);
          setStreamError(false);
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setStreamError(true);
            setIsStatic(true);
            setAntennaWobble(true);
            setTimeout(() => setAntennaWobble(false), 1000);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
          setIsStatic(false);
        }, { once: true });
        video.addEventListener('error', () => {
          setStreamError(true);
          setIsStatic(true);
        }, { once: true });
      } else {
        video.src = streamUrl;
        video.addEventListener('canplay', () => {
          video.play().catch(() => {});
          setIsStatic(false);
        }, { once: true });
        video.addEventListener('error', () => {
          setStreamError(true);
          setIsStatic(true);
        }, { once: true });
      }
    }, 300);
  }, []);

  // ─── Channel change ───────────────────────────────────────────────
  const tuneToChannel = useCallback((idx) => {
    if (idx < 0) idx = mergedChannels.length - 1;
    if (idx >= mergedChannels.length) idx = 0;

    if (idx === -1 || mergedChannels.length === 0) return;

    setCurrentChannelIdx(idx);
    saveLS('settings', { ...loadLS('settings', {}), lastChannel: idx });

    // Show OSD
    setShowOsd(true);
    if (osdTimeout.current) clearTimeout(osdTimeout.current);
    osdTimeout.current = setTimeout(() => setShowOsd(false), 3000);

    // Add to history
    const ch = mergedChannels[idx];
    if (ch) {
      const newHistory = [{ id: ch.id, name: ch.name, timestamp: Date.now() },
        ...history.filter(h => h.id !== ch.id)].slice(0, 50);
      setHistory(newHistory);
      saveLS('history', newHistory);
    }

    // Check test pattern (channel 0)
    if (idx === 0) {
      setShowTestPattern(false); // We'll use channel 0 as first real channel
    }

    playStream(mergedChannels[idx]);
  }, [mergedChannels, playStream, history]);

  // ─── Start playing when channels load ──────────────────────────
  useEffect(() => {
    if (mergedChannels.length > 0 && poweredOn) {
      const idx = Math.min(currentChannelIdx, mergedChannels.length - 1);
      setCurrentChannelIdx(idx);
      playStream(mergedChannels[idx]);
    }
  }, [mergedChannels.length, poweredOn]);

  // ─── Volume ─────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume;
    }
    saveLS('settings', { ...loadLS('settings', {}), volume, muted });
  }, [volume, muted]);

  const adjustVolume = useCallback((delta) => {
    setVolume(v => Math.max(0, Math.min(1, v + delta)));
    setShowVolume(true);
    if (volumeTimeout.current) clearTimeout(volumeTimeout.current);
    volumeTimeout.current = setTimeout(() => setShowVolume(false), 1500);
  }, []);

  // ─── Power toggle ──────────────────────────────────────────────
  const togglePower = useCallback(() => {
    if (poweredOn) {
      setPowerAnim('off');
      setTimeout(() => {
        setPoweredOn(false);
        setPowerAnim(null);
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        if (videoRef.current) videoRef.current.src = '';
      }, 500);
    } else {
      setPoweredOn(true);
      setPowerAnim('on');
      setDegaussing(true);
      setTimeout(() => {
        setPowerAnim(null);
        setDegaussing(false);
        if (mergedChannels.length > 0) playStream(mergedChannels[currentChannelIdx]);
      }, 800);
    }
    saveLS('settings', { ...loadLS('settings', {}), poweredOn: !poweredOn });
  }, [poweredOn, mergedChannels, currentChannelIdx, playStream]);

  // ─── Favorites ─────────────────────────────────────────────────
  const toggleFavorite = useCallback((channelId) => {
    setFavorites(prev => {
      const next = prev.includes(channelId) ? prev.filter(id => id !== channelId) : [...prev, channelId];
      saveLS('favorites', next);
      return next;
    });
  }, []);

  // ─── Keyboard shortcuts (when menu is NOT open) ────────────────
  useEffect(() => {
    function handleKey(e) {
      if (!poweredOn) {
        if (e.key === 'Enter' || e.key === ' ') togglePower();
        return;
      }
      if (showMenu && e.key === 'Escape') { setShowMenu(false); return; }

      // If menu is open, let spatial navigation handle arrows
      if (showMenu) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          setShowMenu(false);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); tuneToChannel(currentChannelIdx + 1); break;
        case 'ArrowDown': e.preventDefault(); tuneToChannel(currentChannelIdx - 1); break;
        case 'ArrowRight': e.preventDefault(); adjustVolume(0.05); break;
        case 'ArrowLeft': e.preventDefault(); adjustVolume(-0.05); break;
        case 'm': case 'M': setMuted(m => !m); break;
        case 'g': case 'G': case 'Enter': setShowMenu(v => !v); break;
        case 'Escape': case 'Backspace': setShowMenu(false); break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            handleNumberInput(e.key);
          }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [poweredOn, currentChannelIdx, showMenu, togglePower, tuneToChannel, adjustVolume]);

  // ─── Number input (direct channel entry) ────────────────────────
  const handleNumberInput = useCallback((digit) => {
    setNumberBuffer(prev => {
      const next = (prev + digit).slice(-4);
      if (numberTimeout.current) clearTimeout(numberTimeout.current);
      numberTimeout.current = setTimeout(() => {
        const num = parseInt(next, 10);
        if (num === 1337) {
          // Easter egg!
          alert('🕹️ You found the secret! RetroVision says: IDDQD — God mode activated!');
        } else if (num >= 1 && num <= mergedChannels.length) {
          tuneToChannel(num - 1);
        }
        setNumberBuffer('');
      }, 1500);
      return next;
    });
  }, [mergedChannels.length, tuneToChannel]);

  // ─── Frameless fullscreen ──────────────────────────────────────
  const screenContainerRef = useRef(null);
  const fullscreenWrapperRef = useRef(null);
  const toggleFramelessFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const el = screenContainerRef.current || fullscreenWrapperRef.current;
      if (el) {
        const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (requestFs) {
          requestFs.call(el).then(() => setIsFramelessFullscreen(true)).catch((err) => {
            console.warn('Fullscreen failed:', err);
            const wrapper = fullscreenWrapperRef.current;
            if (wrapper && wrapper !== el) {
              const wrapperFs = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen || wrapper.mozRequestFullScreen || wrapper.msRequestFullscreen;
              if (wrapperFs) {
                wrapperFs.call(wrapper).then(() => setIsFramelessFullscreen(true)).catch(() => {});
              }
            }
          });
        }
      }
    } else {
      const exitFs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exitFs) {
        exitFs.call(document).then(() => setIsFramelessFullscreen(false)).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    function onFsChange() {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (!fsEl) setIsFramelessFullscreen(false);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // ─── Save settings ─────────────────────────────────────────────
  useEffect(() => { saveLS('settings-prefs', settings); }, [settings]);

  // ─── Category list ─────────────────────────────────────────────
  const categoryList = useMemo(() => {
    const cats = new Set();
    mergedChannels.forEach(ch => {
      if (ch.categories) ch.categories.forEach(c => cats.add(c));
    });
    return ['all', ...Array.from(cats).sort()];
  }, [mergedChannels]);

  // Country list
  const countryList = useMemo(() => {
    const ctrs = new Set();
    mergedChannels.forEach(ch => { if (ch.country) ctrs.add(ch.country); });
    return ['all', ...Array.from(ctrs).sort()];
  }, [mergedChannels]);

  // Country name lookup map from API data
  const countryNameMap = useMemo(() => {
    const map = {};
    countries.forEach(c => {
      if (c.code && c.name) map[c.code] = c.name;
    });
    return map;
  }, [countries]);

  // ─── Theme class ───────────────────────────────────────────────
  const themeClass = settings.theme === 'plastic' ? 'theme-plastic' : settings.theme === 'silver' ? 'theme-silver' : settings.theme === 'midnight' ? 'theme-midnight' : settings.theme === 'walnut' ? 'theme-walnut' : '';

  // ─── Render ─────────────────────────────────────────────────────

  // Cinema mode render
  if (cinemaMode) {
    return h('div', { ref: mainContainerRef, className: 'cinema-wrapper' },

      // Screen container (full viewport)
      h('div', {
        ref: screenContainerRef,
        className: 'screen-container powered-on',
        style: { borderRadius: 0, aspectRatio: 'auto', width: '100%', height: '100%' }
      },
        h('div', {
          className: 'w-full h-full relative' +
            (powerAnim === 'on' ? ' screen-content power-on' : '') +
            (powerAnim === 'off' ? ' screen-content power-off' : '') +
            (degaussing ? ' degaussing' : ''),
          style: { background: '#000' }
        },

          // Video
          h('video', {
            ref: videoRef,
            className: 'tv-video',
            playsInline: true,
            muted: muted,
            style: { display: poweredOn && !isStatic && !showTestPattern ? 'block' : 'none', objectFit: 'contain' }
          }),

          h(StaticNoise, { show: poweredOn && isStatic && !showTestPattern }),
          showTestPattern && h(TestPattern),

          poweredOn && streamError && h('div', { className: 'no-signal' },
            h('div', { className: 'no-signal-text' }, 'NO SIGNAL'),
            h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' } },
              currentChannel ? currentChannel.name + ' — Stream unavailable' : 'No channel selected'
            )
          ),

          !poweredOn && h('div', { className: 'absolute inset-0', style: { background: '#0a0a0a' } }),

          // OSD bar
          h('div', { className: 'osd-bar' + (showOsd && poweredOn ? ' visible' : '') },
            currentChannel && h(React.Fragment, null,
              h('div', { className: 'osd-channel-name' },
                countryFlag(currentChannel.country), ' ', currentChannel.name
              ),
              h('div', { className: 'osd-channel-meta' },
                (currentChannel.categories || []).join(' · '), ' — ',
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              )
            )
          ),

          // Volume bar
          h('div', { className: 'volume-bar-container' + (showVolume && poweredOn ? ' visible' : '') },
            h('div', { className: 'volume-bar-track' },
              h('div', { className: 'volume-bar-fill', style: { height: (muted ? 0 : volume * 100) + '%' } })
            ),
            h('div', { className: 'volume-label' }, muted ? 'MUTE' : Math.round(volume * 100))
          ),

          // Menu overlay
          showMenu && poweredOn && h(MenuOverlay, {
            tab: menuTab,
            setTab: setMenuTab,
            channels: filteredChannels,
            allChannels: mergedChannels,
            categories: categoryList,
            countries: countryList,
            countryNameMap,
            selectedCategory,
            setSelectedCategory,
            selectedCountry,
            setSelectedCountry,
            searchQuery,
            setSearchQuery,
            favorites,
            toggleFavorite,
            currentChannelIdx,
            onSelectChannel: (ch) => {
              const idx = mergedChannels.findIndex(c => c.id === ch.id);
              if (idx >= 0) tuneToChannel(idx);
              setShowMenu(false);
            },
            onClose: () => setShowMenu(false),
            settings,
            setSettings,
            history
          })
        )
      ),

      // Cinema top bar (channel info)
      h('div', { className: 'cinema-top-bar' + (cinemaControlsVisible ? ' visible' : '') },
        h('div', { className: 'cinema-channel-info' },
          poweredOn && currentChannel && h(React.Fragment, null,
            h('div', { className: 'ch-num' }, 'CH ' + String(currentChannel.channelNumber).padStart(3, '0')),
            h('div', { className: 'ch-name' }, countryFlag(currentChannel.country) + ' ' + currentChannel.name)
          )
        ),
        h('div', { style: { display: 'flex', gap: '0.5rem' } },
          h('button', {
            className: 'cinema-ctrl-btn',
            onClick: toggleFramelessFullscreen,
            tabIndex: 0,
            title: 'Fullscreen'
          }, isFramelessFullscreen ? '⊗' : '⛶'),
          h('button', {
            className: 'cinema-ctrl-btn',
            onClick: () => setSettings(s => ({ ...s, theme: 'wood' })),
            tabIndex: 0,
            title: 'Switch to Skeuomorphic TV'
          }, '📺')
        )
      ),

      // Cinema bottom controls bar
      h('div', { className: 'cinema-controls' + (cinemaControlsVisible ? ' visible' : '') },
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: togglePower,
          tabIndex: 0,
          title: 'Power'
        }, '⏻'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => tuneToChannel(currentChannelIdx - 1),
          tabIndex: 0,
          title: 'Previous Channel'
        }, '⏮'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => adjustVolume(-0.1),
          tabIndex: 0,
          title: 'Volume Down'
        }, '🔉'),
        h('button', {
          className: 'cinema-ctrl-btn' + (muted ? ' active' : ''),
          onClick: () => setMuted(m => !m),
          tabIndex: 0,
          title: 'Mute'
        }, muted ? '🔇' : '🔊'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => adjustVolume(0.1),
          tabIndex: 0,
          title: 'Volume Up'
        }, '🔊'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => tuneToChannel(currentChannelIdx + 1),
          tabIndex: 0,
          title: 'Next Channel'
        }, '⏭'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => { setShowMenu(v => !v); setMenuTab('guide'); showCinemaControls(); },
          tabIndex: 0,
          title: 'Guide'
        }, '☰'),
        h('button', {
          className: 'cinema-ctrl-btn',
          onClick: () => { setShowMenu(true); setMenuTab('favorites'); showCinemaControls(); },
          tabIndex: 0,
          title: 'Favorites'
        }, '★')
      ),

      // Number buffer display
      numberBuffer && h('div', {
        style: {
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontFamily: 'Orbitron, monospace', fontSize: '3rem', color: '#00ff88',
          textShadow: '0 0 1.5rem rgba(0,255,136,0.6)',
          background: 'rgba(0,0,0,0.7)', padding: '0.5rem 1.5rem',
          borderRadius: '0.5rem', zIndex: 50
        }
      }, numberBuffer)
    );
  }

  // ─── Skeuomorphic (default) render ─────────────────────────────
  const screenContent = h('div', {
    ref: screenContainerRef,
    className: 'screen-container' + (poweredOn ? ' powered-on' : '') + (isFramelessFullscreen ? ' frameless-screen' : '')
  },
    h('div', {
      className: 'w-full h-full relative ' +
        (powerAnim === 'on' ? 'screen-content power-on' : '') +
        (powerAnim === 'off' ? 'screen-content power-off' : '') +
        (degaussing ? ' degaussing' : ''),
      style: { background: '#000' }
    },

      // Video element
      h('video', {
        ref: videoRef,
        className: 'tv-video',
        playsInline: true,
        muted: muted,
        style: { display: poweredOn && !isStatic && !showTestPattern ? 'block' : 'none' }
      }),

      // Static noise
      h(StaticNoise, { show: poweredOn && isStatic && !showTestPattern }),

      // Test pattern
      showTestPattern && h(TestPattern),

      // No signal message
      poweredOn && streamError && h('div', { className: 'no-signal' },
        h('div', { className: 'no-signal-text' }, 'NO SIGNAL'),
        h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' } },
          currentChannel ? currentChannel.name + ' — Stream unavailable' : 'No channel selected'
        )
      ),

      // Not powered
      !poweredOn && h('div', { className: 'absolute inset-0', style: { background: '#0a0a0a' } }),

      // Channel display
      poweredOn && h('div', { className: 'channel-display' },
        numberBuffer ? ('CH ' + numberBuffer.padStart(4, ' ')) :
        ('CH ' + String(currentChannel ? currentChannel.channelNumber : 0).padStart(3, '0'))
      ),

      // Frameless fullscreen button (top-left, subtle)
      poweredOn && !isFramelessFullscreen && h('button', {
        className: 'frameless-fs-btn',
        onClick: toggleFramelessFullscreen,
        tabIndex: 0,
        title: 'Immersive Fullscreen (no TV frame)'
      }, h('span', null, '⛶')),

      // Exit frameless overlay hint
      isFramelessFullscreen && h('div', {
        className: 'frameless-exit-hint',
        onClick: toggleFramelessFullscreen
      }, 'Press ESC or click to exit immersive mode'),

      // OSD bar
      h('div', { className: 'osd-bar' + (showOsd && poweredOn ? ' visible' : '') },
        currentChannel && h(React.Fragment, null,
          h('div', { className: 'osd-channel-name' },
            countryFlag(currentChannel.country), ' ', currentChannel.name
          ),
          h('div', { className: 'osd-channel-meta' },
            (currentChannel.categories || []).join(' · '), ' — ',
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          )
        )
      ),

      // Volume bar
      h('div', { className: 'volume-bar-container' + (showVolume && poweredOn ? ' visible' : '') },
        h('div', { className: 'volume-bar-track' },
          h('div', { className: 'volume-bar-fill', style: { height: (muted ? 0 : volume * 100) + '%' } })
        ),
        h('div', { className: 'volume-label' }, muted ? 'MUTE' : Math.round(volume * 100))
      ),

      // CRT effects
      poweredOn && settings.scanlines && h('div', { className: 'scanlines' }),
      poweredOn && h('div', { className: 'vignette' }),
      poweredOn && h('div', { className: 'screen-glare' }),

      // Menu overlay  
      showMenu && poweredOn && h(MenuOverlay, {
        tab: menuTab,
        setTab: setMenuTab,
        channels: filteredChannels,
        allChannels: mergedChannels,
        categories: categoryList,
        countries: countryList,
        countryNameMap,
        selectedCategory,
        setSelectedCategory,
        selectedCountry,
        setSelectedCountry,
        searchQuery,
        setSearchQuery,
        favorites,
        toggleFavorite,
        currentChannelIdx,
        onSelectChannel: (ch) => {
          const idx = mergedChannels.findIndex(c => c.id === ch.id);
          if (idx >= 0) tuneToChannel(idx);
          setShowMenu(false);
        },
        onClose: () => setShowMenu(false),
        settings,
        setSettings,
        history
      })
    )
  );

  return h('div', { ref: mainContainerRef, className: 'safe-area' + (isFramelessFullscreen ? ' frameless-active' : '') },

    // Fullscreen wrapper
    h('div', {
      ref: fullscreenWrapperRef,
      className: 'w-full max-w-4xl relative' + (isFramelessFullscreen ? ' frameless-tv-wrapper' : ''),
      style: isFramelessFullscreen ? { background: '#000' } : { paddingTop: '3.75rem' }
    },

      // Antenna (hidden in frameless)
      !isFramelessFullscreen && h('div', { className: 'antenna-container' + (antennaWobble ? ' antenna-wobble' : '') },
        h('div', { className: 'antenna antenna-left' }, h('div', { className: 'antenna-tip' })),
        h('div', { className: 'antenna antenna-right' }, h('div', { className: 'antenna-tip' }))
      ),

      // In frameless mode, render screen directly; otherwise wrap in TV frame
      isFramelessFullscreen
        ? screenContent
        : h('div', { className: 'tv-frame ' + themeClass },
            screenContent,

            // Controls panel
            h('div', { className: 'controls-panel' },

              // Brand
              h('div', { className: 'brand-plate' }, 'RETROVISION'),

              // Controls group
              h('div', { className: 'flex items-center gap-3 flex-wrap' },

                // Volume down
                h('button', {
                  className: 'tv-button rocker-btn',
                  onClick: () => adjustVolume(-0.1),
                  tabIndex: 0,
                  title: 'Volume Down'
                }, '🔉'),

                // Volume up
                h('button', {
                  className: 'tv-button rocker-btn',
                  onClick: () => adjustVolume(0.1),
                  tabIndex: 0,
                  title: 'Volume Up'
                }, '🔊'),

                // Channel down
                h('button', {
                  className: 'tv-button rocker-btn',
                  onClick: () => tuneToChannel(currentChannelIdx - 1),
                  tabIndex: 0,
                  title: 'Channel Down'
                }, '▼'),

                // Channel up
                h('button', {
                  className: 'tv-button rocker-btn',
                  onClick: () => tuneToChannel(currentChannelIdx + 1),
                  tabIndex: 0,
                  title: 'Channel Up'
                }, '▲'),

                // Menu
                h('button', {
                  className: 'tv-button menu-btn',
                  onClick: () => { setShowMenu(v => !v); setMenuTab('guide'); },
                  tabIndex: 0,
                  title: 'Menu / Guide'
                }, 'MENU'),

                // Frameless Fullscreen  
                h('button', {
                  className: 'tv-button menu-btn',
                  onClick: toggleFramelessFullscreen,
                  tabIndex: 0,
                  title: 'Immersive Fullscreen'
                }, '⛶'),

                // Power
                h('button', {
                  className: 'tv-button power-button' + (poweredOn ? ' on' : ''),
                  onClick: togglePower,
                  tabIndex: 0,
                  title: 'Power'
                },
                  h('span', { style: { fontSize: '1.25rem' } }, '⏻'),
                  h('div', { className: 'power-led' + (poweredOn ? ' on' : '') })
                )
              )
            )
          )
    ),

    // Loading indicator
    loading && h('div', { className: 'flex items-center gap-3 mt-6' },
      h('div', { className: 'loading-spinner' }),
      h('span', { style: { color: '#00ff88', fontFamily: 'VT323, monospace', fontSize: '1.125rem' } }, 'Loading channels...')
    ),

    // Channel count
    !loading && mergedChannels.length > 0 && h('div', {
      style: { color: '#555', fontFamily: 'VT323, monospace', fontSize: '0.875rem', marginTop: '0.75rem' }
    }, mergedChannels.length + ' channels available • Press G for guide • Arrow keys to surf'),

    // Mobile remote toggle
    !isFramelessFullscreen && h('button', {
      onClick: () => setShowRemote(v => !v),
      className: 'fixed bottom-4 right-4 z-50',
      tabIndex: 0,
      style: {
        width: '3.5rem', height: '3.5rem', borderRadius: '50%',
        background: showRemote ? 'linear-gradient(145deg, #00aa66, #006633)' : 'linear-gradient(145deg, #333, #1a1a1a)',
        border: '0.125rem solid ' + (showRemote ? '#00ff88' : '#444'), color: '#00ff88',
        fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0.25rem 1rem rgba(0,0,0,0.6)',
        transition: 'all 0.2s ease'
      }
    }, showRemote ? '✕' : '📺'),

    // Mobile remote panel
    showRemote && h(RemoteControl, {
      onChannelUp: () => tuneToChannel(currentChannelIdx + 1),
      onChannelDown: () => tuneToChannel(currentChannelIdx - 1),
      onVolumeUp: () => adjustVolume(0.1),
      onVolumeDown: () => adjustVolume(-0.1),
      onMute: () => setMuted(m => !m),
      onMenu: () => { setShowMenu(v => !v); setMenuTab('guide'); },
      onFavorites: () => { setShowMenu(true); setMenuTab('favorites'); },
      onPower: togglePower,
      onNumber: handleNumberInput,
      onClose: () => setShowRemote(false)
    }),

    // Footer
    h('div', { className: 'retro-footer' },
      h('a', { href: 'https://fractal.co.ke', target: '_blank', rel: 'noopener noreferrer' }, 'powered by fractal')
    )
  );
}

// ─── Menu Overlay Component ────────────────────────────────────────
function MenuOverlay({
  tab, setTab, channels, allChannels, categories, countries,
  countryNameMap,
  selectedCategory, setSelectedCategory, selectedCountry, setSelectedCountry,
  searchQuery, setSearchQuery, favorites, toggleFavorite,
  currentChannelIdx, onSelectChannel, onClose, settings, setSettings, history
}) {
  const menuRef = useRef(null);

  // Enable spatial navigation inside menu
  useSpatialNavigation(menuRef, true);

  const favoriteChannels = useMemo(() =>
    allChannels.filter(ch => favorites.includes(ch.id)),
    [allChannels, favorites]
  );

  const recentChannels = useMemo(() => {
    return history.slice(0, 10).map(h => allChannels.find(ch => ch.id === h.id)).filter(Boolean);
  }, [history, allChannels]);

  return h('div', { ref: menuRef, className: 'menu-overlay' },

    // Top bar
    h('div', { className: 'menu-topbar flex items-center justify-between p-3 border-b border-white/10' },
      h('div', { className: 'flex gap-1' },
        ['guide', 'favorites', 'recent', 'settings'].map(t =>
          h('button', {
            key: t,
            className: 'category-pill' + (tab === t ? ' active' : ''),
            onClick: () => setTab(t),
            tabIndex: 0
          }, t.charAt(0).toUpperCase() + t.slice(1))
        )
      ),
      h('button', {
        onClick: onClose,
        tabIndex: 0,
        style: { color: '#888', fontSize: '1.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem' }
      }, '✕')
    ),

    // Guide tab
    tab === 'guide' && h('div', { className: 'guide-panel p-3', style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      // Search
      h('input', {
        className: 'retro-search guide-search',
        placeholder: '🔍 Search channels...',
        value: searchQuery,
        onChange: (e) => setSearchQuery(e.target.value),
        tabIndex: 0
      }),

      // Category filters
      h('div', { className: 'guide-categories flex gap-1 flex-wrap', style: { maxHeight: '3.75rem', overflowY: 'auto' } },
        categories.slice(0, 20).map(cat =>
          h('button', {
            key: cat,
            className: 'category-pill' + (selectedCategory === cat ? ' active' : ''),
            onClick: () => setSelectedCategory(cat),
            tabIndex: 0
          }, cat === 'all' ? 'All' : cat)
        )
      ),

      // Country filter
      h('div', { className: 'guide-country' },
        h('select', {
          value: selectedCountry,
          onChange: (e) => setSelectedCountry(e.target.value),
          tabIndex: 0,
          style: {
            background: 'rgba(0,0,0,0.5)', border: '0.0625rem solid rgba(255,255,255,0.15)',
            borderRadius: '0.375rem', padding: '0.375rem 0.625rem', color: '#00ff88',
            fontFamily: 'VT323, monospace', fontSize: '1rem', width: '12.5rem', outline: 'none'
          }
        },
          h('option', { value: 'all' }, '🌐 All Countries'),
          ...countries.filter(c => c !== 'all').map(c =>
            h('option', { key: c, value: c }, countryFlag(c) + ' ' + (countryNameMap && countryNameMap[c] ? countryNameMap[c] : c.toUpperCase()))
          )
        )
      ),

      // Channel list
      h('div', { className: 'guide-channel-list', style: { flex: 1, overflowY: 'auto' } },
        channels.length === 0 && h('div', {
          style: { color: '#666', fontFamily: 'VT323, monospace', fontSize: '1rem', textAlign: 'center', padding: '1.25rem' }
        }, 'No channels found'),
        channels.slice(0, 100).map(ch =>
          h('div', {
            key: ch.id,
            className: 'channel-card' + (allChannels[currentChannelIdx]?.id === ch.id ? ' active' : ''),
            onClick: () => onSelectChannel(ch),
            tabIndex: 0,
            role: 'button',
            style: { marginBottom: '0.25rem' }
          },
            // Channel number
            h('div', {
              style: {
                fontFamily: 'Orbitron, monospace', fontSize: '0.6875rem', color: '#00ff88',
                minWidth: '2.25rem', textAlign: 'center'
              }
            }, String(ch.channelNumber).padStart(3, '0')),

            // Logo
            ch.logo ? h('img', {
              src: ch.logo,
              style: { width: '2rem', height: '2rem', objectFit: 'contain', borderRadius: '0.25rem', background: 'rgba(255,255,255,0.1)' },
              onError: (e) => { e.target.style.display = 'none'; }
            }) : h('div', {
              style: { width: '2rem', height: '2rem', borderRadius: '0.25rem', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }
            }, '📺'),

            // Info
            h('div', { className: 'flex-1 min-w-0' },
              h('div', { style: { color: '#eee', fontSize: '0.875rem', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                countryFlag(ch.country), ' ', ch.name
              ),
              h('div', { style: { color: '#666', fontSize: '0.6875rem', fontFamily: 'IBM Plex Mono, monospace' } },
                (ch.categories || []).join(', ')
              )
            ),

            // Favorite star
            h('span', {
              className: 'fav-star' + (favorites.includes(ch.id) ? ' active' : ''),
              onClick: (e) => { e.stopPropagation(); toggleFavorite(ch.id); },
              tabIndex: 0,
              role: 'button',
              'aria-label': favorites.includes(ch.id) ? 'Remove from favorites' : 'Add to favorites'
            }, favorites.includes(ch.id) ? '★' : '☆')
          )
        ),
        channels.length > 100 && h('div', {
          style: { color: '#555', fontFamily: 'VT323, monospace', fontSize: '0.875rem', textAlign: 'center', padding: '0.625rem' }
        }, 'Showing first 100 of ' + channels.length + ' channels. Use search to narrow down.')
      )
    ),

    // Favorites tab
    tab === 'favorites' && h('div', { className: 'p-3' },
      h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '1.25rem', color: '#ffd700', marginBottom: '0.75rem' } },
        '★ Your Favorites (' + favoriteChannels.length + ')'
      ),
      favoriteChannels.length === 0 && h('div', {
        style: { color: '#666', fontFamily: 'VT323, monospace', fontSize: '1rem', textAlign: 'center', padding: '2.5rem' }
      }, 'No favorites yet! Star channels in the Guide to add them here.'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(8.75rem, 1fr))', gap: '0.5rem' } },
        favoriteChannels.map(ch =>
          h('div', {
            key: ch.id,
            className: 'channel-card',
            onClick: () => onSelectChannel(ch),
            tabIndex: 0,
            role: 'button',
            style: { flexDirection: 'column', textAlign: 'center', padding: '0.75rem' }
          },
            ch.logo ? h('img', {
              src: ch.logo,
              style: { width: '3rem', height: '3rem', objectFit: 'contain', margin: '0 auto 0.5rem', borderRadius: '0.375rem', background: 'rgba(255,255,255,0.1)' },
              onError: (e) => { e.target.style.display = 'none'; }
            }) : h('div', {
              style: { width: '3rem', height: '3rem', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }
            }, '📺'),
            h('div', { style: { color: '#ddd', fontSize: '0.75rem', fontFamily: 'IBM Plex Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              ch.name
            )
          )
        )
      )
    ),

    // Recent tab
    tab === 'recent' && h('div', { className: 'p-3' },
      h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '1.25rem', color: '#00ccff', marginBottom: '0.75rem' } },
        '🕐 Recently Watched'
      ),
      recentChannels.length === 0 && h('div', {
        style: { color: '#666', fontFamily: 'VT323, monospace', fontSize: '1rem', textAlign: 'center', padding: '2.5rem' }
      }, 'No watch history yet. Start surfing!'),
      recentChannels.map(ch =>
        h('div', {
          key: ch.id,
          className: 'channel-card',
          onClick: () => onSelectChannel(ch),
          tabIndex: 0,
          role: 'button',
          style: { marginBottom: '0.25rem' }
        },
          ch.logo ? h('img', {
            src: ch.logo,
            style: { width: '2rem', height: '2rem', objectFit: 'contain', borderRadius: '0.25rem', background: 'rgba(255,255,255,0.1)' },
            onError: (e) => { e.target.style.display = 'none'; }
          }) : null,
          h('div', { className: 'flex-1' },
            h('div', { style: { color: '#eee', fontSize: '0.875rem', fontFamily: 'IBM Plex Mono, monospace' } },
              countryFlag(ch.country), ' ', ch.name
            )
          )
        )
      )
    ),

    // Settings tab
    tab === 'settings' && h('div', { className: 'p-3' },
      h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '1.25rem', color: '#ff8800', marginBottom: '1rem' } },
        '⚙ Settings'
      ),

      // Scanlines toggle
      h('div', { className: 'settings-item' },
        h('div', null,
          h('div', { style: { color: '#ddd', fontSize: '0.875rem', fontFamily: 'IBM Plex Mono, monospace' } }, 'Scanlines'),
          h('div', { style: { color: '#666', fontSize: '0.75rem' } }, 'Classic CRT scanline overlay')
        ),
        h('div', {
          className: 'toggle-switch' + (settings.scanlines ? ' on' : ''),
          onClick: () => setSettings(s => ({ ...s, scanlines: !s.scanlines })),
          tabIndex: 0,
          role: 'switch',
          'aria-checked': settings.scanlines
        })
      ),

      // Theme selector
      h('div', { className: 'settings-item', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '0.625rem' } },
        h('div', null,
          h('div', { style: { color: '#ddd', fontSize: '0.875rem', fontFamily: 'IBM Plex Mono, monospace' } }, 'TV Frame Theme'),
          h('div', { style: { color: '#666', fontSize: '0.75rem' } }, 'Choose your retro style')
        ),
        h('div', { className: 'theme-selector-grid' },
          [
            { id: 'wood', label: 'Oak', icon: '🪵', desc: 'Classic 70s' },
            { id: 'walnut', label: 'Walnut', icon: '🌰', desc: 'Dark wood' },
            { id: 'plastic', label: 'Plastic', icon: '📺', desc: '90s black' },
            { id: 'silver', label: 'Silver', icon: '🪩', desc: 'Modern' },
            { id: 'midnight', label: 'Midnight', icon: '🌙', desc: 'Dark luxe' },
            { id: 'cinema', label: 'Cinema', icon: '🎬', desc: 'Frameless' }
          ].map(theme =>
            h('button', {
              key: theme.id,
              className: 'theme-card' + (settings.theme === theme.id ? ' active' : ''),
              onClick: () => setSettings(s => ({ ...s, theme: theme.id })),
              tabIndex: 0
            },
              h('span', { style: { fontSize: '1.25rem' } }, theme.icon),
              h('span', { style: { fontSize: '0.75rem', fontWeight: 700, color: settings.theme === theme.id ? '#00ff88' : '#ccc' } }, theme.label),
              h('span', { style: { fontSize: '0.625rem', color: '#666' } }, theme.desc)
            )
          )
        )
      ),

      // About
      h('div', { style: { marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' } },
        h('div', { style: { fontFamily: 'Orbitron, sans-serif', fontWeight: 900, fontSize: '1rem', color: '#00ff88', marginBottom: '0.5rem' } }, 'RETROVISION IPTV'),
        h('div', { style: { color: '#666', fontSize: '0.8125rem', fontFamily: 'IBM Plex Mono, monospace', lineHeight: '1.6' } },
          'A skeuomorphic IPTV client that looks like a real TV.',
          h('br'),
          'Channel data from iptv-org.github.io',
          h('br'),
          'Built with React, HLS.js, and way too much CSS.',
          h('br'),
          h('br'),
          '🎮 Easter egg: type 1337 on the number pad (4 digits supported!)',
          h('br'),
          h('br'),
          '📺 10-foot UI: Use arrow keys on your TV remote to navigate!',
          h('br'),
          '🎬 Cinema theme: frameless mode with auto-hiding controls.'
        )
      )
    )
  );
}

// ─── Remote Control Component ────────────────────────────────────────
function RemoteControl({ onChannelUp, onChannelDown, onVolumeUp, onVolumeDown, onMute, onMenu, onFavorites, onPower, onNumber, onClose }) {
  return h('div', {
    className: 'fixed bottom-0 right-0 z-40 remote-panel-v2',
  },

    // Compact remote layout — no scrolling needed
    h('div', { className: 'remote-inner' },

      // Top row: power + brand + close
      h('div', { className: 'remote-top-row' },
        h('button', { className: 'remote-btn-sm power-remote', onClick: onPower, tabIndex: 0, title: 'Power' }, '⏻'),
        h('div', { className: 'remote-brand' }, 'RETROVISION'),
        h('button', { className: 'remote-close-btn', onClick: onClose, tabIndex: 0 }, '✕')
      ),

      // Middle section: D-pad + number pad side by side
      h('div', { className: 'remote-body' },

        // Left: D-pad + function row
        h('div', { className: 'remote-left' },
          // D-pad
          h('div', { className: 'dpad-grid' },
            h('div'),
            h('button', { className: 'remote-btn-sm dpad-btn', onClick: onChannelUp, tabIndex: 0, title: 'Channel Up' }, '▲'),
            h('div'),
            h('button', { className: 'remote-btn-sm dpad-btn', onClick: onVolumeDown, tabIndex: 0, title: 'Volume Down' }, '◄'),
            h('button', { className: 'remote-btn-sm dpad-ok', onClick: onMenu, tabIndex: 0, title: 'OK / Menu' }, 'OK'),
            h('button', { className: 'remote-btn-sm dpad-btn', onClick: onVolumeUp, tabIndex: 0, title: 'Volume Up' }, '►'),
            h('div'),
            h('button', { className: 'remote-btn-sm dpad-btn', onClick: onChannelDown, tabIndex: 0, title: 'Channel Down' }, '▼'),
            h('div')
          ),
          // Function buttons
          h('div', { className: 'remote-fn-row' },
            h('button', { className: 'remote-fn-btn', onClick: onMenu, tabIndex: 0 }, 'GUIDE'),
            h('button', { className: 'remote-fn-btn', onClick: onMute, tabIndex: 0 }, 'MUTE'),
            h('button', { className: 'remote-fn-btn', onClick: onFavorites, tabIndex: 0 }, '★ FAV')
          )
        ),

        // Right: Number pad compact
        h('div', { className: 'remote-right' },
          h('div', { className: 'numpad-grid' },
            [1,2,3,4,5,6,7,8,9,null,0,null].map((n, i) =>
              n !== null ?
                h('button', {
                  key: i,
                  className: 'remote-num-btn',
                  onClick: () => onNumber(String(n)),
                  tabIndex: 0
                }, n) :
                h('div', { key: i })
            )
          ),
          // Color buttons
          h('div', { className: 'remote-color-row' },
            h('button', { className: 'remote-color-btn rc-red', tabIndex: 0 }),
            h('button', { className: 'remote-color-btn rc-green', tabIndex: 0 }),
            h('button', { className: 'remote-color-btn rc-yellow', tabIndex: 0 }),
            h('button', { className: 'remote-color-btn rc-blue', tabIndex: 0 })
          )
        )
      )
    )
  );
}

// ─── Mount ────────────────────────────────────────────────────────────
