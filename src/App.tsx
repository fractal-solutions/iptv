// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "./index.css";
import { MenuOverlay } from "./features/iptv/guide";
import { RemoteControl } from "./features/iptv/remote";
import { countryFlag } from "./features/iptv/format";
import { CACHE, KEYBINDINGS, SECRET_CHANNEL_CODE, TIMEOUTS } from "./features/iptv/constants";
import { loadLS, saveLS, STORAGE_KEYS } from "./features/iptv/storage";
import { DEFAULT_SETTINGS_PREFS } from "./features/iptv/settings";
import { destroyHls, playChannelStream, StaticNoise, TestPattern } from "./features/iptv/player";
import { fetchIptvDataWithRetry } from "./features/iptv/api";

const h = React.createElement;
export function App() {
  // State
  const [poweredOn, setPoweredOn] = useState(loadLS(STORAGE_KEYS.settings, {}).poweredOn !== false);
  const [powerAnim, setPowerAnim] = useState(null); // 'on' or 'off'
  const [channels, setChannels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentChannelIdx, setCurrentChannelIdx] = useState(loadLS(STORAGE_KEYS.settings, {}).lastChannel || 0);
  const [volume, setVolume] = useState(loadLS(STORAGE_KEYS.settings, {}).volume || 0.7);
  const [muted, setMuted] = useState(loadLS(STORAGE_KEYS.settings, {}).muted || false);
  const [showOsd, setShowOsd] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuTab, setMenuTab] = useState('guide'); // guide, favorites, settings
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [favorites, setFavorites] = useState(loadLS(STORAGE_KEYS.favorites, []));
  const [history, setHistory] = useState(loadLS(STORAGE_KEYS.history, []));
  const [settings, setSettings] = useState(loadLS(STORAGE_KEYS.settingsPrefs, DEFAULT_SETTINGS_PREFS));
  const [streamError, setStreamError] = useState(false);
  const [isStatic, setIsStatic] = useState(true);
  const [showRemote, setShowRemote] = useState(false);
  const [numberBuffer, setNumberBuffer] = useState('');
  const [degaussing, setDegaussing] = useState(false);
  const [isFramelessFullscreen, setIsFramelessFullscreen] = useState(false);
  const [antennaWobble, setAntennaWobble] = useState(false);
  const [showTestPattern, setShowTestPattern] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(loadLS(STORAGE_KEYS.settingsPrefs, {}).theme === 'cinema');
  const [dataError, setDataError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
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
    cinemaHideTimeout.current = setTimeout(() => setCinemaControlsVisible(false), TIMEOUTS.cinemaControlsHideMs);
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

  // â”€â”€â”€ Fetch IPTV data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setDataError("");
      try {
        const cache = loadLS(STORAGE_KEYS.channelCache, null);
        const cacheAge = cache ? Date.now() - cache.cachedAt : Infinity;

        if (cache && cacheAge < CACHE.channelCacheTtlMs) {
          setChannels(cache.channels);
          setStreams(cache.streams);
          setCategories(cache.categories || []);
          setCountries(cache.countries || []);
          setLoading(false);
          return;
        }

        const { channels: channelsRes, streams: streamsRes, categories: categoriesRes, countries: countriesRes } =
          await fetchIptvDataWithRetry();

        setChannels(channelsRes);
        setStreams(streamsRes);
        setCategories(categoriesRes);
        setCountries(countriesRes);

        saveLS(STORAGE_KEYS.channelCache, {
          channels: channelsRes,
          streams: streamsRes,
          categories: categoriesRes,
          countries: countriesRes,
          cachedAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to fetch IPTV data:", err);
        const staleCache = loadLS(STORAGE_KEYS.channelCache, null);
        if (staleCache?.channels?.length && staleCache?.streams?.length) {
          setChannels(staleCache.channels);
          setStreams(staleCache.streams);
          setCategories(staleCache.categories || []);
          setCountries(staleCache.countries || []);
          setDataError("Using cached channels. Live refresh failed.");
        } else {
          setDataError("Unable to load channel directory. Check network and retry.");
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [reloadToken]);

  // â”€â”€â”€ Play stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const playStream = useCallback(
    channel => {
      playChannelStream({
        channel,
        videoRef,
        hlsRef,
        setIsStatic,
        setStreamError,
        setShowTestPattern,
        setAntennaWobble,
      });
    },
    [videoRef, hlsRef, setIsStatic, setStreamError, setShowTestPattern, setAntennaWobble],
  );

  // â”€â”€â”€ Channel change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tuneToChannel = useCallback((idx) => {
    if (idx < 0) idx = mergedChannels.length - 1;
    if (idx >= mergedChannels.length) idx = 0;

    if (idx === -1 || mergedChannels.length === 0) return;

    setCurrentChannelIdx(idx);
    saveLS(STORAGE_KEYS.settings, { ...loadLS(STORAGE_KEYS.settings, {}), lastChannel: idx });

    // Show OSD
    setShowOsd(true);
    if (osdTimeout.current) clearTimeout(osdTimeout.current);
    osdTimeout.current = setTimeout(() => setShowOsd(false), TIMEOUTS.osdHideMs);

    // Add to history
    const ch = mergedChannels[idx];
    if (ch) {
      const newHistory = [{ id: ch.id, name: ch.name, timestamp: Date.now() },
        ...history.filter(h => h.id !== ch.id)].slice(0, 50);
      setHistory(newHistory);
      saveLS(STORAGE_KEYS.history, newHistory);
    }

    // Check test pattern (channel 0)
    if (idx === 0) {
      setShowTestPattern(false); // We'll use channel 0 as first real channel
    }

    playStream(mergedChannels[idx]);
  }, [mergedChannels, playStream, history]);

  // â”€â”€â”€ Start playing when channels load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (mergedChannels.length > 0 && poweredOn) {
      const idx = Math.min(currentChannelIdx, mergedChannels.length - 1);
      setCurrentChannelIdx(idx);
      playStream(mergedChannels[idx]);
    }
  }, [mergedChannels.length, poweredOn]);

  // â”€â”€â”€ Volume â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume;
    }
    saveLS(STORAGE_KEYS.settings, { ...loadLS(STORAGE_KEYS.settings, {}), volume, muted });
  }, [volume, muted]);

  const adjustVolume = useCallback((delta) => {
    setVolume(v => Math.max(0, Math.min(1, v + delta)));
    setShowVolume(true);
    if (volumeTimeout.current) clearTimeout(volumeTimeout.current);
    volumeTimeout.current = setTimeout(() => setShowVolume(false), TIMEOUTS.volumeHideMs);
  }, []);

  // â”€â”€â”€ Power toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const togglePower = useCallback(() => {
    if (poweredOn) {
      setPowerAnim('off');
      setTimeout(() => {
        setPoweredOn(false);
        setPowerAnim(null);
        destroyHls(hlsRef);
        if (videoRef.current) videoRef.current.src = '';
      }, TIMEOUTS.powerOffMs);
    } else {
      setPoweredOn(true);
      setPowerAnim('on');
      setDegaussing(true);
      setTimeout(() => {
        setPowerAnim(null);
        setDegaussing(false);
        if (mergedChannels.length > 0) playStream(mergedChannels[currentChannelIdx]);
      }, TIMEOUTS.powerOnMs);
    }
    saveLS(STORAGE_KEYS.settings, { ...loadLS(STORAGE_KEYS.settings, {}), poweredOn: !poweredOn });
  }, [poweredOn, mergedChannels, currentChannelIdx, playStream]);

  // â”€â”€â”€ Favorites â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toggleFavorite = useCallback((channelId) => {
    setFavorites(prev => {
      const next = prev.includes(channelId) ? prev.filter(id => id !== channelId) : [...prev, channelId];
      saveLS(STORAGE_KEYS.favorites, next);
      return next;
    });
  }, []);

  // â”€â”€â”€ Keyboard shortcuts (when menu is NOT open) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    function handleKey(e) {
      if (!poweredOn) {
        if (KEYBINDINGS.power.includes(e.key)) togglePower();
        return;
      }
      if (showMenu && e.key === 'Escape') { setShowMenu(false); return; }

      // If menu is open, let spatial navigation handle arrows
      if (showMenu) {
        if (KEYBINDINGS.closeMenu.includes(e.key)) {
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
        case 'm': case 'M':
          if (KEYBINDINGS.mute.includes(e.key)) setMuted(m => !m);
          break;
        case 'g': case 'G': case 'Enter':
          if (KEYBINDINGS.menuToggle.includes(e.key)) setShowMenu(v => !v);
          break;
        case 'Escape': case 'Backspace':
          if (KEYBINDINGS.closeMenu.includes(e.key)) setShowMenu(false);
          break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            handleNumberInput(e.key);
          }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [poweredOn, currentChannelIdx, showMenu, togglePower, tuneToChannel, adjustVolume]);

  // â”€â”€â”€ Number input (direct channel entry) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleNumberInput = useCallback((digit) => {
    setNumberBuffer(prev => {
      const next = (prev + digit).slice(-4);
      if (numberTimeout.current) clearTimeout(numberTimeout.current);
      numberTimeout.current = setTimeout(() => {
        const num = parseInt(next, 10);
        if (num === SECRET_CHANNEL_CODE) {
          // Easter egg!
          alert('ðŸ•¹ï¸ You found the secret! RetroVision says: IDDQD â€” God mode activated!');
        } else if (num >= 1 && num <= mergedChannels.length) {
          tuneToChannel(num - 1);
        }
        setNumberBuffer('');
      }, TIMEOUTS.numberCommitMs);
      return next;
    });
  }, [mergedChannels.length, tuneToChannel]);

  // â”€â”€â”€ Frameless fullscreen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Save settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => { saveLS(STORAGE_KEYS.settingsPrefs, settings); }, [settings]);

  // â”€â”€â”€ Category list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Theme class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const themeClass = settings.theme === 'plastic' ? 'theme-plastic' : settings.theme === 'silver' ? 'theme-silver' : settings.theme === 'midnight' ? 'theme-midnight' : settings.theme === 'walnut' ? 'theme-walnut' : '';
  const retryChannelLoad = useCallback(() => setReloadToken(v => v + 1), []);

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
              currentChannel ? currentChannel.name + ' â€” Stream unavailable' : 'No channel selected'
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
                (currentChannel.categories || []).join(' Â· '), ' â€” ',
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
        }, '◉'),
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
      }, numberBuffer),

      dataError && h('div', {
        style: {
          position: 'fixed',
          left: '50%',
          bottom: '1rem',
          transform: 'translateX(-50%)',
          zIndex: 60,
          maxWidth: 'min(90vw, 42rem)',
          background: 'rgba(0,0,0,0.82)',
          border: '1px solid rgba(255,120,120,0.45)',
          color: '#f2dede',
          padding: '0.6rem 0.8rem',
          borderRadius: '0.5rem',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }
      },
        h('span', null, dataError),
        h('button', {
          onClick: retryChannelLoad,
          tabIndex: 0,
          style: {
            border: '1px solid #00ff88',
            color: '#00ff88',
            background: 'rgba(0,0,0,0.25)',
            padding: '0.25rem 0.6rem',
            borderRadius: '0.35rem',
            fontFamily: 'IBM Plex Mono, monospace',
            cursor: 'pointer'
          }
        }, 'Retry')
      )
    );
  }

  // â”€â”€â”€ Skeuomorphic (default) render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          currentChannel ? currentChannel.name + ' â€” Stream unavailable' : 'No channel selected'
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
            (currentChannel.categories || []).join(' Â· '), ' â€” ',
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
                  h('span', { style: { fontSize: '1.25rem' } }, '◉'),
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

    dataError && h('div', {
      style: {
        marginTop: '0.75rem',
        background: 'rgba(80,0,0,0.35)',
        border: '1px solid rgba(255,120,120,0.45)',
        color: '#f2dede',
        borderRadius: '0.5rem',
        padding: '0.6rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '0.8rem'
      }
    },
      h('span', null, dataError),
      h('button', {
        onClick: retryChannelLoad,
        tabIndex: 0,
        style: {
          border: '1px solid #00ff88',
          color: '#00ff88',
          background: 'rgba(0,0,0,0.25)',
          padding: '0.25rem 0.6rem',
          borderRadius: '0.35rem',
          fontFamily: 'IBM Plex Mono, monospace',
          cursor: 'pointer'
        }
      }, 'Retry')
    ),

    // Channel count
    !loading && mergedChannels.length > 0 && h('div', {
      style: { color: '#555', fontFamily: 'VT323, monospace', fontSize: '0.875rem', marginTop: '0.75rem' }
    }, mergedChannels.length + ' channels available â€¢ Press G for guide â€¢ Arrow keys to surf'),

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

