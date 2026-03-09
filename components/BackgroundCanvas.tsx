'use client';

import { useEffect, useRef, useCallback } from 'react';

export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Array<{ x: number; y: number; z: number; vx: number; vy: number }>>([]);

  const initParticles = useCallback((width: number, height: number) => {
    const count = Math.min(80, Math.floor((width * height) / 18000));
    return Array.from({ length: count }, () => ({
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
      z: Math.random() * 400 - 200,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let visible = true;
    const handleVisibility = () => {
      visible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleResize = () => {
      const dpr = Math.min(2, window.devicePixelRatio ?? 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particlesRef.current = initParticles(window.innerWidth, window.innerHeight);
    };

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 40,
        y: (e.clientY / window.innerHeight - 0.5) * 40,
      };
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouse);
    handleResize();

    const animate = () => {
      if (!visible || !ctx || !canvas) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.fillStyle = '#070a0f';
      ctx.fillRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const particles = particlesRef.current;
      const centerX = w / 2;
      const centerY = h / 2;

      particles.forEach((p, i) => {
        p.x += p.vx + mx * 0.02;
        p.y += p.vy + my * 0.02;
        if (p.x < -w / 2 - 50) p.x = w / 2 + 50;
        if (p.x > w / 2 + 50) p.x = -w / 2 - 50;
        if (p.y < -h / 2 - 50) p.y = h / 2 + 50;
        if (p.y > h / 2 + 50) p.y = -h / 2 - 50;

        const sx = centerX + p.x + (p.z * mx) / 200;
        const sy = centerY + p.y + (p.z * my) / 200;
        const size = 1 + (p.z + 200) / 400;
        const alpha = 0.15 + (p.z + 200) / 800;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 197, 71, ${alpha})`;
        ctx.fill();
      });

      ctx.strokeStyle = 'rgba(232, 197, 71, 0.04)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        const ax = centerX + a.x + (a.z * mx) / 200;
        const ay = centerY + a.y + (a.z * my) / 200;
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const bx = centerX + b.x + (b.z * mx) / 200;
          const by = centerY + b.y + (b.z * my) / 200;
          const dx = ax - bx;
          const dy = ay - by;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouse);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 h-full w-full"
      style={{ background: 'var(--bg-primary)' }}
      aria-hidden
    />
  );
}
