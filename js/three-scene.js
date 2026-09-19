/**
 * Movie Night Matcher — Three.js Cinematic Scene
 * Particle starfield + floating film reels + spotlight rays
 */

class CinematicScene {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.scene    = new THREE.Scene();
    this.camera   = null;
    this.renderer = null;
    this.particles= null;
    this.filmReels= [];
    this.spotlightRays = [];
    this.mouse    = new THREE.Vector2(0, 0);
    this.clock    = new THREE.Clock();
    this.isRunning= false;

    this.init();
  }

  init() {
    const W = window.innerWidth;
    const H = window.innerHeight;

    /* ── Renderer ── */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    /* ── Camera ── */
    this.camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    this.camera.position.z = 50;

    /* ── Stars / Dust particles ── */
    this._createStarfield();

    /* ── Film grain floating planes ── */
    this._createFilmDust();

    /* ── Curtain volumetric rays ── */
    this._createSpotlightRays();

    /* ── Event listeners ── */
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    this.isRunning = true;
    this._animate();
  }

  _createStarfield() {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = (Math.random() - 0.5) * 200;
      positions[i3 + 2] = (Math.random() - 0.5) * 100 - 20;

      // Gold/amber tint for most, white for some
      const isGold = Math.random() > 0.6;
      colors[i3]     = isGold ? 0.83 : 0.95;
      colors[i3 + 1] = isGold ? 0.63 : 0.90;
      colors[i3 + 2] = isGold ? 0.09 : 0.85;

      sizes[i] = Math.random() * 2.5 + 0.3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time:       { value: 0 },
        pointTexture: { value: this._createCircleTexture() },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (400.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex;
          if (gl_FragColor.a < 0.05) discard;
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: false,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  _createFilmDust() {
    // Small golden dust motes floating
    const count = 300;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * 160;
      positions[i3 + 1] = (Math.random() - 0.5) * 120;
      positions[i3 + 2] = (Math.random() - 0.5) * 50;
      velocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: Math.random() * 0.03 + 0.005,
        z: 0,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._dustPositions = positions;
    this._dustVelocities = velocities;
    this._dustCount = count;

    const mat = new THREE.PointsMaterial({
      color: 0xD4A017,
      size: 0.3,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  _createSpotlightRays() {
    // Volumetric light cone from top center
    const rayCount = 6;
    for (let i = 0; i < rayCount; i++) {
      const geo = new THREE.ConeGeometry(8 + i * 3, 60, 8, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xD4A017,
        transparent: true,
        opacity: 0.015 + Math.random() * 0.01,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(
        (Math.random() - 0.5) * 10,
        30,
        -10
      );
      cone.rotation.x = Math.PI; // point downward
      cone.rotation.z = (Math.random() - 0.5) * 0.2;
      this.scene.add(cone);
      this.spotlightRays.push({ mesh: cone, originalOpacity: mat.opacity });
    }
  }

  _createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  }

  _animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this._animate());

    const t = this.clock.getElapsedTime();

    /* Rotate star field slowly, drift with mouse */
    if (this.particles) {
      this.particles.rotation.y = t * 0.008;
      this.particles.rotation.x = t * 0.003;
      this.particles.position.x += (this.mouse.x * 2 - this.particles.position.x) * 0.005;
      this.particles.position.y += (this.mouse.y * 1 - this.particles.position.y) * 0.005;
    }

    /* Animate dust motes rising */
    if (this.dustPoints) {
      const pos = this._dustPositions;
      for (let i = 0; i < this._dustCount; i++) {
        const i3 = i * 3;
        pos[i3]     += this._dustVelocities[i].x;
        pos[i3 + 1] += this._dustVelocities[i].y;
        pos[i3 + 2] += this._dustVelocities[i].z;

        // Reset if out of bounds
        if (pos[i3 + 1] > 60) {
          pos[i3 + 1] = -60;
          pos[i3]     = (Math.random() - 0.5) * 160;
        }
      }
      this.dustPoints.geometry.attributes.position.needsUpdate = true;
      this.dustPoints.material.opacity = 0.3 + Math.sin(t * 0.5) * 0.1;
    }

    /* Spotlight rays pulse */
    this.spotlightRays.forEach((ray, i) => {
      ray.mesh.material.opacity = ray.originalOpacity * (0.7 + 0.3 * Math.sin(t * 0.8 + i));
    });

    /* Camera subtle drift */
    this.camera.position.x = Math.sin(t * 0.1) * 1.5;
    this.camera.position.y = Math.cos(t * 0.08) * 0.8;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
  }

  destroy() {
    this.isRunning = false;
    this.renderer?.dispose();
  }
}

// Export for use in app.js
window.CinematicScene = CinematicScene;
