// @ts-nocheck
import React, { useEffect, useRef } from "react";
import Hls from "hls.js";
import { TIMEOUTS } from "./constants";

const h = React.createElement;

export function StaticNoise({ show }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!show) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    function draw() {
      if (!running) return;
      const w = (canvas.width = canvas.offsetWidth);
      const ht = (canvas.height = canvas.offsetHeight);
      if (!w || !ht) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const imageData = ctx.createImageData(w, ht);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 200;
      }
      ctx.putImageData(imageData, 0, 0);
      frameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      running = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [show]);

  if (!show) return null;
  return h("canvas", { ref: canvasRef, className: "static-canvas", style: { width: "100%", height: "100%" } });
}

export function TestPattern() {
  const colors = ["#fff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000"];
  return h(
    "div",
    { className: "test-pattern" },
    ...colors.map((c, i) => h("div", { key: i, className: "test-bar", style: { background: c } })),
  );
}

export function destroyHls(hlsRef) {
  if (hlsRef.current) {
    hlsRef.current.destroy();
    hlsRef.current = null;
  }
}

export function playChannelStream({
  channel,
  videoRef,
  hlsRef,
  setIsStatic,
  setStreamError,
  setShowTestPattern,
  setAntennaWobble,
}) {
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

  setTimeout(() => {
    const streamUrl = channel.streams[0].url;
    destroyHls(hlsRef);

    if (Hls.isSupported() && streamUrl.includes(".m3u8")) {
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
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStreamError(true);
          setIsStatic(true);
          setAntennaWobble(true);
          setTimeout(() => setAntennaWobble(false), TIMEOUTS.antennaWobbleMs);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.play().catch(() => {});
          setIsStatic(false);
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          setStreamError(true);
          setIsStatic(true);
        },
        { once: true },
      );
    } else {
      video.src = streamUrl;
      video.addEventListener(
        "canplay",
        () => {
          video.play().catch(() => {});
          setIsStatic(false);
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          setStreamError(true);
          setIsStatic(true);
        },
        { once: true },
      );
    }
  }, TIMEOUTS.staticSwitchMs);
}

