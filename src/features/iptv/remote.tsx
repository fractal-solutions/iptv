// @ts-nocheck
import React from "react";

const h = React.createElement;

export function RemoteControl({
  onChannelUp,
  onChannelDown,
  onVolumeUp,
  onVolumeDown,
  onMute,
  onMenu,
  onFavorites,
  onPower,
  onNumber,
  onClose,
}) {
  return h(
    "div",
    { className: "fixed bottom-0 right-0 z-40 remote-panel-v2" },
    h(
      "div",
      { className: "remote-inner" },
      h(
        "div",
        { className: "remote-top-row" },
        h("button", { className: "remote-btn-sm power-remote", onClick: onPower, tabIndex: 0, title: "Power" }, "◉"),
        h("div", { className: "remote-brand" }, "RETROVISION"),
        h("button", { className: "remote-close-btn", onClick: onClose, tabIndex: 0 }, "✕"),
      ),
      h(
        "div",
        { className: "remote-body" },
        h(
          "div",
          { className: "remote-left" },
          h(
            "div",
            { className: "dpad-grid" },
            h("div"),
            h("button", { className: "remote-btn-sm dpad-btn", onClick: onChannelUp, tabIndex: 0, title: "Channel Up" }, "▲"),
            h("div"),
            h("button", { className: "remote-btn-sm dpad-btn", onClick: onVolumeDown, tabIndex: 0, title: "Volume Down" }, "◄"),
            h("button", { className: "remote-btn-sm dpad-ok", onClick: onMenu, tabIndex: 0, title: "OK / Menu" }, "OK"),
            h("button", { className: "remote-btn-sm dpad-btn", onClick: onVolumeUp, tabIndex: 0, title: "Volume Up" }, "►"),
            h("div"),
            h("button", { className: "remote-btn-sm dpad-btn", onClick: onChannelDown, tabIndex: 0, title: "Channel Down" }, "▼"),
            h("div"),
          ),
          h(
            "div",
            { className: "remote-fn-row" },
            h("button", { className: "remote-fn-btn", onClick: onMenu, tabIndex: 0 }, "GUIDE"),
            h("button", { className: "remote-fn-btn", onClick: onMute, tabIndex: 0 }, "MUTE"),
            h("button", { className: "remote-fn-btn", onClick: onFavorites, tabIndex: 0 }, "★ FAV"),
          ),
        ),
        h(
          "div",
          { className: "remote-right" },
          h(
            "div",
            { className: "numpad-grid" },
            [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null].map((n, i) =>
              n !== null
                ? h(
                    "button",
                    {
                      key: i,
                      className: "remote-num-btn",
                      onClick: () => onNumber(String(n)),
                      tabIndex: 0,
                    },
                    n,
                  )
                : h("div", { key: i }),
            ),
          ),
          h(
            "div",
            { className: "remote-color-row" },
            h("button", { className: "remote-color-btn rc-red", tabIndex: 0 }),
            h("button", { className: "remote-color-btn rc-green", tabIndex: 0 }),
            h("button", { className: "remote-color-btn rc-yellow", tabIndex: 0 }),
            h("button", { className: "remote-color-btn rc-blue", tabIndex: 0 }),
          ),
        ),
      ),
    ),
  );
}
