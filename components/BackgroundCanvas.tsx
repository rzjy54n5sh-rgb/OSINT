'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function BackgroundCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 80;

    // ── Primary particle field — drifting dots ──
    const COUNT = 1200;
    const positions  = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      velocities[i * 3]     = (Math.random() - 0.5) * 0.012;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.007;
      velocities[i * 3 + 2] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x4ec98a,  // --accent-green
      size: 0.32,
      transparent: true,
      opacity: 0.28,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ── Secondary sparse large dots (radar blips) ──
    const BLIP_COUNT = 80;
    const blipPos = new Float32Array(BLIP_COUNT * 3);
    for (let i = 0; i < BLIP_COUNT; i++) {
      blipPos[i * 3]     = (Math.random() - 0.5) * 220;
      blipPos[i * 3 + 1] = (Math.random() - 0.5) * 130;
      blipPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const blipGeo = new THREE.BufferGeometry();
    blipGeo.setAttribute('position', new THREE.BufferAttribute(blipPos, 3));
    const blipMat = new THREE.PointsMaterial({
      color: 0xe8c547,  // --accent-gold
      size: 0.6,
      transparent: true,
      opacity: 0.15,
      sizeAttenuation: true,
    });
    const blips = new THREE.Points(blipGeo, blipMat);
    scene.add(blips);

    // ── Animation loop ──
    let frame: number;
    let t = 0;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      t += 0.001;

      const pos = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        pos[i * 3]     += velocities[i * 3];
        pos[i * 3 + 1] += velocities[i * 3 + 1];
        // Wrap edges
        if (pos[i * 3]     >  100) pos[i * 3]     = -100;
        if (pos[i * 3]     < -100) pos[i * 3]     =  100;
        if (pos[i * 3 + 1] >   60) pos[i * 3 + 1] =  -60;
        if (pos[i * 3 + 1] <  -60) pos[i * 3 + 1] =   60;
      }
      geo.attributes.position.needsUpdate = true;

      // Very slow rotation
      points.rotation.z += 0.00025;
      blips.rotation.z  -= 0.00012;

      // Pulse gold blips opacity
      blipMat.opacity = 0.1 + Math.sin(t * 2) * 0.07;

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      blipGeo.dispose();
      blipMat.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.65,
      }}
    />
  );
}
