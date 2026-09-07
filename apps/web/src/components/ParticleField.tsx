/**
 * @file ParticleField — ambient Three.js particle background for the hero.
 *
 * A subtle, decorative field of drifting light points rendered behind the
 * landing hero. Purely atmospheric: no interaction, no click handling, no
 * DOM readback. It adapts its color intensity to the active theme and
 * honours prefers-reduced-motion by rendering a single static frame.
 *
 * Uses raw three.js (no react-three-fiber) to keep the dependency surface
 * small for what is a lightweight decorative layer.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ParticleFieldProps {
  /** Optional className so the caller can size/position the canvas. */
  className?: string;
}

const PARTICLE_COUNT = 1400;
const SPREAD_X = 14;
const SPREAD_Y = 9;
const SPREAD_Z = 8;

function isReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function resolveTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function ParticleField({ className }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    // Bail out cleanly when WebGL is unavailable (e.g. jsdom test env or
    // legacy browsers) instead of throwing from the renderer constructor.
    if (
      !(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    ) {
      return;
    }

    const reduced = isReducedMotion();
    const theme = resolveTheme();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.055);

    const camera = new THREE.PerspectiveCamera(
      60,
      wrap.clientWidth / Math.max(wrap.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.z = 10;

    // Particle geometry — small round points spread across a wide band.
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * SPREAD_X;
      positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD_Y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD_Z;
      speeds[i] = 0.04 + Math.random() * 0.08;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

    // Vertex shader: size points with per-particle drift + twinkle phase.
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#4f46e5") },
        uOpacity: { value: theme === "dark" ? 0.55 : 0.35 },
      },
      vertexShader: `
        attribute float speed;
        attribute float phase;
        uniform float uTime;
        varying float vPhase;
        void main() {
          vPhase = phase;
          vec3 p = position;
          p.x = position.x + cos(uTime * speed * 0.5 + phase) * 0.3;
          p.y = position.y + sin(uTime * speed * 0.8 + phase) * 0.6;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (0.12 + phase * 0.16) * (220.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vPhase;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, d);
          alpha *= 0.5 + 0.5 * sin(vPhase * 1.5 + uTime * 1.6);
          gl_FragColor = vec4(uColor, alpha * uOpacity);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let raf = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const renderFrame = () => {
      material.uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };

    const tick = () => {
      renderFrame();
      raf = requestAnimationFrame(tick);
    };

    resize();
    if (reduced) {
      renderFrame(); // static single frame
    } else {
      tick();
    }

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const mo = new MutationObserver(() => {
      material.uniforms.uColor.value.set("#4f46e5");
      material.uniforms.uOpacity.value =
        resolveTheme() === "dark" ? 0.55 : 0.35;
    });
    mo.observe(document.documentElement, { attributes: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
