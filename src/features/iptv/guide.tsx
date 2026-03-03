// @ts-nocheck
import React, { useEffect, useMemo, useRef } from "react";
import { countryFlag } from "./format";
import { THEME_OPTIONS } from "./settings";

const h = React.createElement;

function useSpatialNavigation(containerRef, active) {
  useEffect(() => {
    if (!active) return;

    function getFocusables() {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll(
          'button, [tabindex="0"], input, select, .channel-card, .category-pill, .theme-card, .fav-star, .toggle-switch, .cinema-ctrl-btn',
        ),
      ).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && !el.disabled;
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
          case "ArrowUp":
            valid = dy < -5;
            primaryDist = Math.abs(dy);
            secondaryDist = Math.abs(dx);
            break;
          case "ArrowDown":
            valid = dy > 5;
            primaryDist = Math.abs(dy);
            secondaryDist = Math.abs(dx);
            break;
          case "ArrowLeft":
            valid = dx < -5;
            primaryDist = Math.abs(dx);
            secondaryDist = Math.abs(dy);
            break;
          case "ArrowRight":
            valid = dx > 5;
            primaryDist = Math.abs(dx);
            secondaryDist = Math.abs(dy);
            break;
        }

        if (valid) {
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

      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "TEXTAREA");

      if (
        isInput &&
        activeElement.tagName !== "SELECT" &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (!containerRef.current.contains(activeElement)) {
          focusables[0]?.focus();
          e.preventDefault();
          return;
        }

        const candidate = findBestCandidate(activeElement, e.key, focusables);
        if (candidate) {
          candidate.focus();
          candidate.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          e.preventDefault();
        }
      }

      if (e.key === "Enter" && activeElement && containerRef.current.contains(activeElement)) {
        if (activeElement.tagName !== "INPUT" && activeElement.tagName !== "SELECT") {
          activeElement.click();
          e.preventDefault();
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [containerRef, active]);
}

export function MenuOverlay({
  tab,
  setTab,
  channels,
  allChannels,
  categories,
  countries,
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
  onSelectChannel,
  onClose,
  settings,
  setSettings,
  history,
}) {
  const menuRef = useRef(null);
  useSpatialNavigation(menuRef, true);

  const favoriteChannels = useMemo(
    () => allChannels.filter(ch => favorites.includes(ch.id)),
    [allChannels, favorites],
  );

  const recentChannels = useMemo(
    () => history.slice(0, 10).map(item => allChannels.find(ch => ch.id === item.id)).filter(Boolean),
    [history, allChannels],
  );

  return h(
    "div",
    { ref: menuRef, className: "menu-overlay" },
    h(
      "div",
      { className: "menu-topbar flex items-center justify-between p-3 border-b border-white/10" },
      h(
        "div",
        { className: "flex gap-1" },
        ["guide", "favorites", "recent", "settings"].map(t =>
          h(
            "button",
            {
              key: t,
              className: "category-pill" + (tab === t ? " active" : ""),
              onClick: () => setTab(t),
              tabIndex: 0,
            },
            t.charAt(0).toUpperCase() + t.slice(1),
          ),
        ),
      ),
      h(
        "button",
        {
          onClick: onClose,
          tabIndex: 0,
          style: {
            color: "#888",
            fontSize: "1.5rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.25rem 0.5rem",
          },
        },
        "✕",
      ),
    ),
    tab === "guide" &&
      h(
        "div",
        { className: "guide-panel p-3", style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } },
        h("input", {
          className: "retro-search guide-search",
          placeholder: "🔍 Search channels...",
          value: searchQuery,
          onChange: e => setSearchQuery(e.target.value),
          tabIndex: 0,
        }),
        h(
          "div",
          { className: "guide-categories flex gap-1 flex-wrap", style: { maxHeight: "3.75rem", overflowY: "auto" } },
          categories.slice(0, 20).map(cat =>
            h(
              "button",
              {
                key: cat,
                className: "category-pill" + (selectedCategory === cat ? " active" : ""),
                onClick: () => setSelectedCategory(cat),
                tabIndex: 0,
              },
              cat === "all" ? "All" : cat,
            ),
          ),
        ),
        h(
          "div",
          { className: "guide-country" },
          h(
            "select",
            {
              value: selectedCountry,
              onChange: e => setSelectedCountry(e.target.value),
              tabIndex: 0,
              style: {
                background: "rgba(0,0,0,0.5)",
                border: "0.0625rem solid rgba(255,255,255,0.15)",
                borderRadius: "0.375rem",
                padding: "0.375rem 0.625rem",
                color: "#00ff88",
                fontFamily: "VT323, monospace",
                fontSize: "1rem",
                width: "12.5rem",
                outline: "none",
              },
            },
            h("option", { value: "all" }, "🌐 All Countries"),
            ...countries
              .filter(c => c !== "all")
              .map(c =>
                h(
                  "option",
                  { key: c, value: c },
                  countryFlag(c) + " " + (countryNameMap && countryNameMap[c] ? countryNameMap[c] : c.toUpperCase()),
                ),
              ),
          ),
        ),
        h(
          "div",
          { className: "guide-channel-list", style: { flex: 1, overflowY: "auto" } },
          channels.length === 0 &&
            h(
              "div",
              { style: { color: "#666", fontFamily: "VT323, monospace", fontSize: "1rem", textAlign: "center", padding: "1.25rem" } },
              "No channels found",
            ),
          channels.slice(0, 100).map(ch =>
            h(
              "div",
              {
                key: ch.id,
                className: "channel-card" + (allChannels[currentChannelIdx]?.id === ch.id ? " active" : ""),
                onClick: () => onSelectChannel(ch),
                tabIndex: 0,
                role: "button",
                style: { marginBottom: "0.25rem" },
              },
              h(
                "div",
                { style: { fontFamily: "Orbitron, monospace", fontSize: "0.6875rem", color: "#00ff88", minWidth: "2.25rem", textAlign: "center" } },
                String(ch.channelNumber).padStart(3, "0"),
              ),
              ch.logo
                ? h("img", {
                    src: ch.logo,
                    style: {
                      width: "2rem",
                      height: "2rem",
                      objectFit: "contain",
                      borderRadius: "0.25rem",
                      background: "rgba(255,255,255,0.1)",
                    },
                    onError: e => {
                      e.target.style.display = "none";
                    },
                  })
                : h(
                    "div",
                    {
                      style: {
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "0.25rem",
                        background: "rgba(255,255,255,0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.875rem",
                      },
                    },
                    "📺",
                  ),
              h(
                "div",
                { className: "flex-1 min-w-0" },
                h(
                  "div",
                  {
                    style: {
                      color: "#eee",
                      fontSize: "0.875rem",
                      fontFamily: "IBM Plex Mono, monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  },
                  countryFlag(ch.country),
                  " ",
                  ch.name,
                ),
                h(
                  "div",
                  { style: { color: "#666", fontSize: "0.6875rem", fontFamily: "IBM Plex Mono, monospace" } },
                  (ch.categories || []).join(", "),
                ),
              ),
              h(
                "span",
                {
                  className: "fav-star" + (favorites.includes(ch.id) ? " active" : ""),
                  onClick: e => {
                    e.stopPropagation();
                    toggleFavorite(ch.id);
                  },
                  tabIndex: 0,
                  role: "button",
                  "aria-label": favorites.includes(ch.id) ? "Remove from favorites" : "Add to favorites",
                },
                favorites.includes(ch.id) ? "★" : "☆",
              ),
            ),
          ),
          channels.length > 100 &&
            h(
              "div",
              { style: { color: "#555", fontFamily: "VT323, monospace", fontSize: "0.875rem", textAlign: "center", padding: "0.625rem" } },
              "Showing first 100 of " + channels.length + " channels. Use search to narrow down.",
            ),
        ),
      ),
    tab === "favorites" &&
      h(
        "div",
        { className: "guide-panel p-3" },
        h("div", { style: { fontFamily: "VT323, monospace", fontSize: "1.25rem", color: "#ffd700", marginBottom: "0.75rem" } }, `★ Your Favorites (${favoriteChannels.length})`),
        favoriteChannels.length === 0 &&
          h(
            "div",
            { style: { color: "#666", fontFamily: "VT323, monospace", fontSize: "1rem", textAlign: "center", padding: "2.5rem" } },
            "No favorites yet! Star channels in the Guide to add them here.",
          ),
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(8.75rem, 1fr))", gap: "0.5rem" } },
          favoriteChannels.map(ch =>
            h(
              "div",
              {
                key: ch.id,
                className: "channel-card",
                onClick: () => onSelectChannel(ch),
                tabIndex: 0,
                role: "button",
                style: { flexDirection: "column", textAlign: "center", padding: "0.75rem" },
              },
              ch.logo
                ? h("img", {
                    src: ch.logo,
                    style: {
                      width: "3rem",
                      height: "3rem",
                      objectFit: "contain",
                      margin: "0 auto 0.5rem",
                      borderRadius: "0.375rem",
                      background: "rgba(255,255,255,0.1)",
                    },
                    onError: e => {
                      e.target.style.display = "none";
                    },
                  })
                : h(
                    "div",
                    {
                      style: {
                        width: "3rem",
                        height: "3rem",
                        margin: "0 auto 0.5rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                      },
                    },
                    "📺",
                  ),
              h(
                "div",
                {
                  style: {
                    color: "#ddd",
                    fontSize: "0.75rem",
                    fontFamily: "IBM Plex Mono, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                ch.name,
              ),
            ),
          ),
        ),
      ),
    tab === "recent" &&
      h(
        "div",
        { className: "guide-panel p-3" },
        h("div", { style: { fontFamily: "VT323, monospace", fontSize: "1.25rem", color: "#00ccff", marginBottom: "0.75rem" } }, "🕐 Recently Watched"),
        recentChannels.length === 0 &&
          h(
            "div",
            { style: { color: "#666", fontFamily: "VT323, monospace", fontSize: "1rem", textAlign: "center", padding: "2.5rem" } },
            "No watch history yet. Start surfing!",
          ),
        recentChannels.map(ch =>
          h(
            "div",
            {
              key: ch.id,
              className: "channel-card",
              onClick: () => onSelectChannel(ch),
              tabIndex: 0,
              role: "button",
              style: { marginBottom: "0.25rem" },
            },
            ch.logo
              ? h("img", {
                  src: ch.logo,
                  style: { width: "2rem", height: "2rem", objectFit: "contain", borderRadius: "0.25rem", background: "rgba(255,255,255,0.1)" },
                  onError: e => {
                    e.target.style.display = "none";
                  },
                })
              : null,
            h("div", { className: "flex-1" }, h("div", { style: { color: "#eee", fontSize: "0.875rem", fontFamily: "IBM Plex Mono, monospace" } }, countryFlag(ch.country), " ", ch.name)),
          ),
        ),
      ),
    tab === "settings" &&
      h(
        "div",
        { className: "guide-panel p-3" },
        h("div", { style: { fontFamily: "VT323, monospace", fontSize: "1.25rem", color: "#ff8800", marginBottom: "1rem" } }, "⚙ Settings"),
        h(
          "div",
          { className: "settings-item" },
          h(
            "div",
            null,
            h("div", { style: { color: "#ddd", fontSize: "0.875rem", fontFamily: "IBM Plex Mono, monospace" } }, "Scanlines"),
            h("div", { style: { color: "#666", fontSize: "0.75rem" } }, "Classic CRT scanline overlay"),
          ),
          h("div", {
            className: "toggle-switch" + (settings.scanlines ? " on" : ""),
            onClick: () => setSettings(s => ({ ...s, scanlines: !s.scanlines })),
            tabIndex: 0,
            role: "switch",
            "aria-checked": settings.scanlines,
          }),
        ),
        h(
          "div",
          { className: "settings-item", style: { flexDirection: "column", alignItems: "flex-start", gap: "0.625rem" } },
          h(
            "div",
            null,
            h("div", { style: { color: "#ddd", fontSize: "0.875rem", fontFamily: "IBM Plex Mono, monospace" } }, "TV Frame Theme"),
            h("div", { style: { color: "#666", fontSize: "0.75rem" } }, "Choose your retro style"),
          ),
          h(
            "div",
            { className: "theme-selector-grid" },
            THEME_OPTIONS.map(theme =>
              h(
                "button",
                {
                  key: theme.id,
                  className: "theme-card" + (settings.theme === theme.id ? " active" : ""),
                  onClick: () => setSettings(s => ({ ...s, theme: theme.id })),
                  tabIndex: 0,
                },
                h("span", { style: { fontSize: "1.25rem" } }, theme.icon),
                h(
                  "span",
                  { style: { fontSize: "0.75rem", fontWeight: 700, color: settings.theme === theme.id ? "#00ff88" : "#ccc" } },
                  theme.label,
                ),
                h("span", { style: { fontSize: "0.625rem", color: "#666" } }, theme.desc),
              ),
            ),
          ),
        ),
        h(
          "div",
          { style: { marginTop: "1.5rem", padding: "1rem", background: "rgba(255,255,255,0.03)", borderRadius: "0.5rem" } },
          h(
            "div",
            {
              style: {
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 900,
                fontSize: "1rem",
                color: "#00ff88",
                marginBottom: "0.5rem",
              },
            },
            "FRACTAL TV",
          ),
          h(
            "div",
            {
              style: { color: "#666", fontSize: "0.8125rem", fontFamily: "IBM Plex Mono, monospace", lineHeight: "1.6" },
            },
            "A skeuomorphic IPTV client that looks like a real TV.",
            h("br"),
            "Channel data from iptv-org.github.io",
            h("br"),
            "Built with React, HLS.js, and way too much CSS.",
            h("br"),
            h("br"),
            "🎮 Easter egg: type 1337 on the number pad (4 digits supported!)",
            h("br"),
            h("br"),
            "📺 10-foot UI: Use arrow keys on your TV remote to navigate!",
            h("br"),
            "🎬 Cinema theme: frameless mode with auto-hiding controls.",
          ),
        ),
      ),
  );
}
