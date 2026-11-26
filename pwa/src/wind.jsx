import { useEffect, useRef } from "react";

export function WindField() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let running = true;
    const dots = Array.from({ length: 110 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      layer: index % 3,
      size: 0.7 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
    }));

    function size() {
      const box = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(box.width * dpr));
      canvas.height = Math.max(1, Math.floor(box.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const watch = new ResizeObserver(size);
    watch.observe(canvas.parentElement);

    function paint(now) {
      if (!running) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const time = now * 0.00012;
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        const speed = 0.00035 + dot.layer * 0.00022;
        const wave = Math.sin(dot.y * 7 + time * (4 + dot.layer) + dot.phase);
        if (!reduce) {
          dot.x += speed + wave * 0.00025;
          dot.y += Math.sin(dot.x * 9 + time * 5 + dot.phase) * 0.00035;
          if (dot.x > 1.08) dot.x = -0.08;
          if (dot.y < -0.08) dot.y = 1.08;
          if (dot.y > 1.08) dot.y = -0.08;
        }
        const x = dot.x * width;
        const y = dot.y * height;
        const drift = 8 + dot.layer * 7;
        const alpha = 0.28 + dot.layer * 0.16;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = dot.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - drift, y - wave * 5);
        ctx.stroke();
      }
      if (!reduce) frame = window.requestAnimationFrame(paint);
    }
    frame = window.requestAnimationFrame(paint);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, []);
  return <canvas className="wind-field" ref={ref} aria-hidden="true" />;
}
