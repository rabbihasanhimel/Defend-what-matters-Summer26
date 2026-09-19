/* BLACK TAG — the estate, in three dimensions.
   One block per service. Height is the number of systems in it, so the tallest
   thing on the site is the oncology trial store, which is the one you are most
   likely to black-tag. That is not a coincidence, it is the point. */
window.Ward = (function () {
  var R, scene, cam, composer, blocks = {}, beams = {}, t0 = performance.now();
  var orbit = 0.62, shake = 0, ok = false;

  var C = {
    up:      { c: 0x1c2026, e: 0x2b333c, i: 0.30 },
    down:    { c: 0x2a1319, e: 0xd33c4c, i: 0.52 },
    restored:{ c: 0x1d2716, e: 0x8aab5c, i: 0.34 },
    black:   { c: 0x0f0d0b, e: 0xb79554, i: 0.06 }
  };

  function init(services) {
    var cv = document.getElementById('ward');
    try {
      R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!R || !R.getContext()) return false;

    R.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    R.setSize(innerWidth, innerHeight);
    R.outputEncoding = THREE.sRGBEncoding;
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 0.86;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090a);
    scene.fog = new THREE.FogExp2(0x08090a, 0.026);

    cam = new THREE.PerspectiveCamera(31, innerWidth / innerHeight, 0.5, 300);

    scene.add(new THREE.AmbientLight(0x20262d, 0.6));
    var key = new THREE.DirectionalLight(0xffe6c4, 0.46); key.position.set(-14, 20, 9); scene.add(key);
    var rim = new THREE.DirectionalLight(0x6f8dbb, 0.26); rim.position.set(13, 7, -13); scene.add(rim);

    /* ground */
    var g = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .95, metalness: 0 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -0.02; scene.add(g);
    var grid = new THREE.GridHelper(150, 60, 0x1a1d22, 0x121418);
    grid.material.transparent = true; grid.material.opacity = .32; scene.add(grid);

    /* podium the estate sits on */
    var pod = new THREE.Mesh(new THREE.BoxGeometry(17.5, .38, 17.5),
      new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: .82, metalness: .12 }));
    pod.position.y = .19; scene.add(pod);

    /* one block per service, 4 x 4 */
    var n = services.length, span = 3.55;
    services.forEach(function (s, k) {
      var col = k % 4, row = Math.floor(k / 4);
      var x = (col - 1.5) * span, z = (row - (Math.ceil(n / 4) - 1) / 2) * span;
      var h = 0.9 + s.systems * 0.135;
      var w = 1.9 + (s.systems > 16 ? .5 : 0);

      var m = new THREE.MeshStandardMaterial({
        color: C.up.c, emissive: C.up.e, emissiveIntensity: C.up.i,
        roughness: .55, metalness: .28
      });
      var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
      b.position.set(x, .38 + h / 2, z);
      b.userData = { h: h, base: .38 + h / 2, state: 'up', ph: Math.random() * 6.28 };
      scene.add(b);

      var edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(b.geometry),
        new THREE.LineBasicMaterial({ color: 0x59636f, transparent: true, opacity: .34 }));
      b.add(edge); b.userData.edge = edge;

      /* the column of light that goes up when it falls over */
      var beam = new THREE.Mesh(
        new THREE.CylinderGeometry(w * .16, w * .16, 17, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xd33c4c, transparent: true, opacity: 0,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.set(x, 8.5, z); scene.add(beam);

      blocks[s.id] = b; beams[s.id] = beam;
    });

    /* bloom */
    try {
      composer = new THREE.EffectComposer(R);
      composer.addPass(new THREE.RenderPass(scene, cam));
      var bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.52, 0.5, 0.5);
      composer.addPass(bloom);
    } catch (e) { composer = null; }

    addEventListener('resize', resize);
    ok = true;
    requestAnimationFrame(loop);
    return true;
  }

  function resize() {
    if (!ok) return;
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    R.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
  }

  function setState(id, st) {
    var b = blocks[id]; if (!b) return;
    var c = C[st] || C.up;
    b.userData.state = st;
    b.material.color.setHex(c.c);
    b.material.emissive.setHex(c.e);
    b.material.emissiveIntensity = c.i;
    b.userData.edge.material.color.setHex(
      st === 'black' ? 0xb79554 : st === 'down' ? 0xd33c4c : st === 'restored' ? 0x8aab5c : 0x59636f);
    b.userData.edge.material.opacity = st === 'black' ? .45 : .34;
    beams[id].material.opacity = st === 'down' ? .035 : 0;
    if (st === 'black') b.scale.y = 1; // it stays standing. nobody is coming for it.
  }

  function shock(power) { shake = power || 1; }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!ok) return;
    var t = (now - t0) / 1000;
    orbit += 0.00042;

    var r = 34, y = 20.5;
    var sx = shake ? (Math.random() - .5) * shake * .45 : 0;
    var sy = shake ? (Math.random() - .5) * shake * .45 : 0;
    cam.position.set(Math.sin(orbit) * r + sx, y + Math.sin(t * .2) * .9 + sy, Math.cos(orbit) * r);
    cam.lookAt(0, 7.4, 0);
    if (shake > 0) shake = Math.max(0, shake - 0.022);

    for (var id in blocks) {
      var b = blocks[id];
      if (b.userData.state === 'down') {
        b.material.emissiveIntensity = 0.64 + Math.sin(t * 2.1 + b.userData.ph) * .26;
        beams[id].material.opacity = .024 + Math.sin(t * 2.1 + b.userData.ph) * .014;
      } else if (b.userData.state === 'restored') {
        b.material.emissiveIntensity = .30 + Math.sin(t * .85 + b.userData.ph) * .07;
      }
    }
    composer ? composer.render() : R.render(scene, cam);
  }

  return { init: init, setState: setState, shock: shock, ok: function () { return ok; } };
})();
