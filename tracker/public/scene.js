// Small Three.js scenes for the tracker: a drifting particle backdrop across
// the whole page, and a procedural rocket in the "Next up" spotlight card
// that idles, ignites, and launches. Everything here is optional flourish —
// app.js works fine if THREE fails to load (see the typeof guard below).
const TrackerScene = (() => {
  const KIND_COLORS = {
    feature: 0x1b64c9,
    bug: 0xc0233c,
    spike: 0x7c3aed,
    debt: 0xb25e09,
  };
  const DEFAULT_COLOR = 0x4f46e5;

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function available() {
    return typeof THREE !== 'undefined';
  }

  // A soft round sprite for point clouds — plain THREE.Points render as hard
  // squares without a texture, which reads as "glitchy" rather than "starry".
  let dotTextureCache = null;
  function dotTexture() {
    if (dotTextureCache) return dotTextureCache;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    dotTextureCache = new THREE.CanvasTexture(canvas);
    return dotTextureCache;
  }

  // ---- Background: a slow drift of soft points behind the whole page ----
  function initBackground(canvas) {
    if (!available() || !canvas) return null;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 50);
    camera.position.set(0, 0, 12);

    const COUNT = 70;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      speeds[i] = 0.15 + Math.random() * 0.35;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: DEFAULT_COLOR,
      map: dotTexture(),
      size: 0.4,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
      return { dispose: () => window.removeEventListener('resize', resize) };
    }

    let raf = null;
    function tick(t) {
      const arr = geometry.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] += speeds[i] * 0.003;
        if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = -7;
      }
      geometry.attributes.position.needsUpdate = true;
      points.rotation.y = t * 0.00002;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return {
      dispose() {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      },
    };
  }

  // ---- Spotlight rocket ----
  function buildRocket() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.45, metalness: 0.25 });
    const accentMat = new THREE.MeshStandardMaterial({ color: DEFAULT_COLOR, roughness: 0.4, metalness: 0.2 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2b6f9c, emissiveIntensity: 0.6 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 });
    const padMat = new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR, transparent: true, opacity: 0.18, side: THREE.DoubleSide });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.85, 20), bodyMat);
    nose.position.y = 1.35;
    group.add(nose);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 20), bodyMat);
    body.position.y = 0.15;
    group.add(body);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.22, 20), accentMat);
    stripe.position.y = -0.05;
    group.add(stripe);

    const win = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), windowMat);
    win.position.set(0, 0.5, 0.4);
    group.add(win);

    const finGeo = new THREE.BoxGeometry(0.09, 0.55, 0.4);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeo, accentMat);
      const angle = (i / 3) * Math.PI * 2;
      fin.position.set(Math.sin(angle) * 0.42, -0.55, Math.cos(angle) * 0.42);
      fin.rotation.y = -angle;
      fin.rotation.z = 0.25;
      group.add(fin);
    }

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 16), flameMat);
    flame.position.y = -1.0;
    flame.rotation.x = Math.PI;
    group.add(flame);

    const pad = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -1.35;

    return { group, pad, flame, accentMat, padMat };
  }

  function mountSpotlight(canvas) {
    if (!available() || !canvas) return null;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.set(0, 0.4, 5.4);
    camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.PointLight(0xffffff, 0.9);
    key.position.set(2, 3, 4);
    scene.add(key);

    const { group, pad, flame, accentMat, padMat } = buildRocket();
    scene.add(group);
    scene.add(pad);

    const baseY = 0;
    let stage = 'idle'; // idle | ignition | empty | launching
    let flying = false;
    const exhaust = [];

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    function setKind(kind) {
      const color = KIND_COLORS[kind] ?? DEFAULT_COLOR;
      accentMat.color.setHex(color);
      padMat.color.setHex(color);
    }

    function setStage(next) {
      stage = next;
    }

    function spawnExhaust(count) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcf6b, transparent: true, opacity: 0.85 });
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat.clone());
        mesh.position.set(0, baseY - 1.1, 0);
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 1.2;
        exhaust.push({
          mesh,
          velocity: new THREE.Vector3(Math.cos(angle) * speed * 0.4, -0.5 - Math.random() * 0.8, Math.sin(angle) * speed * 0.4),
          life: 0,
          maxLife: 0.6 + Math.random() * 0.4,
        });
        scene.add(mesh);
      }
    }

    function launch(onComplete) {
      if (flying) return;
      flying = true;
      stage = 'launching';
      const start = performance.now();
      const duration = prefersReducedMotion ? 200 : 1300;

      function step(now) {
        const elapsed = now - start;
        const p = Math.min(elapsed / duration, 1);

        if (!prefersReducedMotion) {
          const ease = p * p;
          group.position.y = baseY + ease * 6;
          group.position.x = Math.sin(elapsed * 0.05) * 0.06 * (1 - p);
          flame.scale.set(1 + p * 0.6, 1 + p * 2.2, 1 + p * 0.6);
          if (elapsed % 40 < 20) spawnExhaust(2);
        } else {
          group.position.y = baseY + p * 6;
        }

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          group.position.set(0, baseY, 0);
          flame.scale.set(1, 1, 1);
          flying = false;
          stage = 'idle';
          if (onComplete) onComplete();
        }
      }
      requestAnimationFrame(step);
    }

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
    }

    let raf = null;
    function tick(t) {
      if (!flying) {
        const seconds = t * 0.001;
        if (stage === 'empty') {
          group.position.y = baseY + Math.sin(seconds * 0.8) * 0.03;
          group.rotation.y += 0.001;
          flame.visible = false;
        } else {
          flame.visible = true;
          group.position.y = baseY + Math.sin(seconds * 1.1) * 0.06;
          group.rotation.y += stage === 'ignition' ? 0.006 : 0.0025;
          const flicker = stage === 'ignition' ? 0.85 + Math.sin(seconds * 18) * 0.15 : 0.5 + Math.sin(seconds * 9) * 0.1;
          const baseScale = stage === 'ignition' ? 1.35 : 0.85;
          flame.scale.set(baseScale, baseScale * flicker + 0.3, baseScale);
        }
      }

      for (let i = exhaust.length - 1; i >= 0; i--) {
        const e = exhaust[i];
        e.life += 0.016;
        e.mesh.position.addScaledVector(e.velocity, 0.016);
        e.mesh.material.opacity = Math.max(0, 1 - e.life / e.maxLife);
        if (e.life >= e.maxLife) {
          scene.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.mesh.material.dispose();
          exhaust.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    if (!prefersReducedMotion) raf = requestAnimationFrame(tick);

    return {
      setKind,
      setStage,
      launch,
      dispose() {
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      },
    };
  }

  return { initBackground, mountSpotlight };
})();
