'use client';

import { useEffect, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three';

/**
 * The home hero's one restrained 3D element: a slow particle field inside the hero box only (it used
 * to be a full-viewport canvas on every page — UX audit 2026-10-13: 3.2 s of main thread on
 * /corrections, ~9 s on /nai). Loaded only by HeroScene, after first paint and idle, and only on
 * devices that pass lib/hero-3d.ts. Renders at most ~30 fps, and not at all while the hero is
 * off-screen or the tab is hidden.
 */
export function HeroStarfield() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let renderer: WebGLRenderer;
    try {
      // failIfMajorPerformanceCaveat: never fall back to a software rasteriser (the decorative layer
      // is not worth a CPU-rendered frame). Throws when no such context exists.
      renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true });
    } catch {
      return;
    }
    const width = () => Math.max(1, el.clientWidth);
    const height = () => Math.max(1, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width(), height(), false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    el.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(60, width() / height(), 0.1, 1000);
    camera.position.z = 80;

    // Restrained: particle count scales with the hero area, capped (the old field drew 1,280).
    const count = Math.min(520, Math.max(160, Math.round((width() * height()) / 900)));
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      velocities[i * 2] = (Math.random() - 0.5) * 0.012;
      velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.006;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    const mat = new PointsMaterial({ color: 0x4ec98a, size: 0.34, transparent: true, opacity: 0.32, sizeAttenuation: true });
    const points = new Points(geo, mat);
    scene.add(points);

    const BLIPS = 36;
    const blipPos = new Float32Array(BLIPS * 3);
    for (let i = 0; i < BLIPS; i++) {
      blipPos[i * 3] = (Math.random() - 0.5) * 210;
      blipPos[i * 3 + 1] = (Math.random() - 0.5) * 70;
      blipPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const blipGeo = new BufferGeometry();
    blipGeo.setAttribute('position', new BufferAttribute(blipPos, 3));
    const blipMat = new PointsMaterial({ color: 0xe8c547, size: 0.62, transparent: true, opacity: 0.16, sizeAttenuation: true });
    const blips = new Points(blipGeo, blipMat);
    scene.add(blips);

    let visible = true;
    let frame = 0;
    let last = 0;
    let t = 0;
    const FRAME_MS = 1000 / 30;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      const elapsed = last === 0 ? FRAME_MS : now - last;
      if (elapsed < FRAME_MS) return;
      last = now;
      const k = Math.min(elapsed / (1000 / 60), 4);
      t += 0.001 * k;
      const pos = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += velocities[i * 2] * k;
        pos[i * 3 + 1] += velocities[i * 2 + 1] * k;
        if (pos[i * 3] > 100) pos[i * 3] = -100;
        else if (pos[i * 3] < -100) pos[i * 3] = 100;
        if (pos[i * 3 + 1] > 35) pos[i * 3 + 1] = -35;
        else if (pos[i * 3 + 1] < -35) pos[i * 3 + 1] = 35;
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.z += 0.0002 * k;
      blips.rotation.z -= 0.0001 * k;
      blipMat.opacity = 0.1 + Math.sin(t * 2) * 0.06;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    // Fade in once the first frame is drawn (the static hero background is already showing).
    requestAnimationFrame(() => el.setAttribute('data-ready', ''));

    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      camera.aspect = width() / height();
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height(), false);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      blipGeo.dispose();
      blipMat.dispose();
      renderer.dispose();
      if (el.contains(canvas)) el.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} className="hero-scene__canvas" />;
}
