import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/TransformControls.js";

(() => {
  "use strict";

  const DB_NAME = "feru-cinema-local-db";
  const DB_VERSION = 1;
  const SCENE_KEY = "feru-cinema-scenes-v1";
  const $ = (id) => document.getElementById(id);

  let scene, camera, renderer, orbit, transform, loader;
  let stageReady = false;
  let animationFrame = 0;
  let selectedRoot = null;
  let objectCounter = 0;
  let resizeObserver = null;
  let directionalLight = null;

  const roots = [];
  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[ch])
    );

  function status(message, error = false) {
    const el = $("feru-builder-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("feru-studio-error", error);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error || new Error("Could not open the local asset library.")
        );
      request.onupgradeneeded = () => {
        request.transaction.abort();
        reject(
          new Error("Open FERU CINEMA first so its asset library is ready.")
        );
      };
    });
  }

  async function readAssets() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("assets", "readonly");
        const request = tx.objectStore("assets").getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () =>
          reject(request.error || new Error("Could not read local assets."));
      });
    } finally {
      db.close();
    }
  }

  function addBuilderInterface() {
    const studio = $("view-feru-studio");
    const head = studio?.querySelector(".feru-studio-head");
    if (!studio || !head || $("feru-scene-builder")) return;

    const openButton = document.createElement("button");
    openButton.className = "secondary";
    openButton.type = "button";
    openButton.id = "feru-open-builder";
    openButton.textContent = "Open Scene Builder";
    head.appendChild(openButton);

    const panel = document.createElement("section");
    panel.id = "feru-scene-builder";
    panel.className = "feru-builder-panel";
    panel.hidden = true;
    panel.innerHTML = ` <div class="feru-builder-heading"> <div> <p class="eyebrow">FERU STUDIO · STAGE 2</p> <h2>3D Scene Builder</h2> <p class="muted">Assemble a simple 3D shot from models already in your local asset library.</p> </div> <button class="secondary" type="button" id="feru-close-builder">Close builder</button> </div> <div class="feru-builder-notice">Free 3D engine loaded from jsDelivr when online. Scene layouts are saved in this browser; model files stay in your existing FERU asset library. This is a scene-layout tool, not yet a full animation or film-rendering system.</div> <div class="feru-builder-layout"> <aside class="feru-builder-sidebar"> <div class="feru-builder-card"> <h3>Model library</h3> <p class="feru-builder-help">Tap Add to place a GLB model into the scene.</p> <div id="feru-builder-assets" class="feru-builder-assets">Loading models…</div> </div> <div class="feru-builder-card"> <h3>Scene objects</h3> <div id="feru-object-list" class="feru-object-list"><p class="feru-builder-help">No objects in the scene yet.</p></div> <button class="feru-danger-button" type="button" id="feru-remove-object" disabled>Remove selected object</button> </div> <div class="feru-builder-card"> <h3>Save scene</h3> <label class="feru-builder-label" for="feru-scene-name">Scene name</label> <input id="feru-scene-name" type="text" maxlength="60" value="My first scene" /> <button class="feru-builder-action" type="button" id="feru-save-scene">Save scene</button> <label class="feru-builder-label" for="feru-scene-select">Saved scenes</label> <select id="feru-scene-select"><option value="">No saved scenes</option></select> <button class="secondary" type="button" id="feru-load-scene">Open selected scene</button> <button class="feru-danger-button" type="button" id="feru-delete-scene">Delete selected scene</button> </div> </aside> <div class="feru-builder-main"> <div class="feru-builder-toolbar"> <div class="feru-tool-group" aria-label="Transform mode"> <button class="feru-tool active" type="button" data-feru-mode="translate">Move</button> <button class="feru-tool" type="button" data-feru-mode="rotate">Rotate</button> <button class="feru-tool" type="button" data-feru-mode="scale">Resize</button> </div> <div class="feru-tool-group"> <button class="secondary" type="button" id="feru-camera-reset">Reset camera</button> <button class="secondary" type="button" id="feru-scene-clear">Clear scene</button> </div> </div> <div id="feru-scene-viewport" class="feru-scene-viewport"> <div class="feru-scene-loading">Preparing 3D workspace…</div> </div> <div class="feru-builder-inspector"> <div> <b id="feru-selected-name">Nothing selected</b> <p class="feru-builder-help">Select an object, then use Move, Rotate or Resize. On touch screens, drag the colored handles.</p> </div> <label class="feru-light-control">Key light <input id="feru-light-intensity" type="range" min="0" max="3" step="0.1" value="1.6" /> </label> </div> <p id="feru-builder-status" class="feru-studio-status" role="status">Scene builder is ready.</p> <p class="feru-builder-footnote">Touch: one finger orbits the camera; pinch zooms. Select an object to show its transform handles. Use two fingers carefully on the scene if your browser captures a gesture.</p> </div> </div>`;

    studio.appendChild(panel);
    openButton.addEventListener("click", openBuilder);
    $("feru-close-builder").addEventListener("click", closeBuilder);
    $("feru-remove-object").addEventListener("click", removeSelected);
    $("feru-save-scene").addEventListener("click", saveScene);
    $("feru-load-scene").addEventListener("click", loadSelectedScene);
    $("feru-delete-scene").addEventListener("click", deleteSelectedScene);
    $("feru-camera-reset").addEventListener("click", resetCamera);
    $("feru-scene-clear").addEventListener("click", clearScene);
    $("feru-light-intensity").addEventListener("input", (event) => {
      if (directionalLight)
        directionalLight.intensity = Number(event.target.value);
    });
    $("feru-builder-assets").addEventListener("click", (event) => {
      const button = event.target.closest("[data-feru-add-asset]");
      if (button) addAssetToScene(button.dataset.feruAddAsset);
    });
    $("feru-object-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-feru-select-object]");
      if (button)
        selectRoot(
          roots.find(
            (root) =>
              root.userData.feruObjectId === button.dataset.feruSelectObject
          )
        );
    });
    panel.querySelectorAll("[data-feru-mode]").forEach((button) => {
      button.addEventListener("click", () =>
        setTransformMode(button.dataset.feruMode)
      );
    });
    refreshSceneSelect();
  }

  async function renderAssetChoices() {
    const list = $("feru-builder-assets");
    if (!list) return;
    try {
      const assets = await readAssets();
      const models = assets.filter(
        (item) => item.type === "3D model" && /\.glb$/i.test(item.name || "")
      );
      if (!models.length) {
        list.innerHTML =
          '<p class="feru-builder-help">No GLB files found. Import a .glb file in Asset library first.</p>';
        return;
      }
      list.innerHTML = models
        .map(
          (asset) => ` <div class="feru-builder-asset"> <span><b>${escapeHTML(asset.name)}</b><small>${escapeHTML( asset.sizeLabel || "GLB model" )}</small></span> <button class="secondary" type="button" data-feru-add-asset="${escapeHTML( asset.id )}">Add</button> </div>`
        )
        .join("");
    } catch (error) {
      list.textContent = error.message;
      status(error.message, true);
    }
  }

  async function initEngine() {
    if (stageReady) return;
    const viewport = $("feru-scene-viewport");
    if (!viewport) throw new Error("The 3D viewport is missing.");
    loader = new GLTFLoader();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111922);

    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
    camera.position.set(6, 5, 8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    viewport.innerHTML = "";
    viewport.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x39404b, 1.8);
    scene.add(hemi);
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.6);
    directionalLight.position.set(4, 8, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    scene.add(directionalLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({
        color: 0x27313b,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    floor.receiveShadow = true;
    floor.name = "FERU ground";
    scene.add(floor);

    const grid = new THREE.GridHelper(80, 80, 0x65717e, 0x394550);
    grid.position.y = 0.002;
    scene.add(grid);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.target.set(0, 1, 0);
    orbit.update();

    transform = new TransformControls(camera, renderer.domElement);
    transform.setMode("translate");
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !event.value;
    });
    transform.addEventListener("change", renderObjectList);
    scene.add(transform.getHelper());

    resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(viewport);
    resizeRenderer();
    stageReady = true;
    renderOnce();
  }

  function resizeRenderer() {
    if (!renderer || !$("feru-scene-viewport")) return;
    const box = $("feru-scene-viewport").getBoundingClientRect();
    const width = Math.max(1, Math.floor(box.width));
    const height = Math.max(1, Math.floor(box.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderOnce();
  }

  function renderOnce() {
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function animate() {
    if (!$("feru-scene-builder") || $("feru-scene-builder").hidden) {
      animationFrame = 0;
      return;
    }
    animationFrame = requestAnimationFrame(animate);
    orbit?.update();
    renderOnce();
  }

  function startRendering() {
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  }

  function stopRendering() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  async function openBuilder() {
    const panel = $("feru-scene-builder");
    panel.hidden = false;
    $("feru-open-builder").textContent = "Scene Builder Open";
    try {
      await initEngine();
      await renderAssetChoices();
      refreshSceneSelect();
      resizeRenderer();
      startRendering();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      status("3D scene workspace ready. Add a model from your library.");
    } catch (error) {
      status(`Could not start the 3D workspace: ${error.message}`, true);
      $("feru-scene-viewport").innerHTML =
        '<div class="feru-scene-loading">3D workspace could not start. Check your internet connection and WebGL support, then reopen the builder.</div>';
    }
  }

  function closeBuilder() {
    $("feru-scene-builder").hidden = true;
    $("feru-open-builder").textContent = "Open Scene Builder";
    stopRendering();
  }

  async function addAssetToScene(id, savedTransform = null) {
    try {
      status("Loading model into the scene…");
      const assets = await readAssets();
      const asset = assets.find((item) => item.id === id);
      if (!asset?.blob)
        throw new Error(
          "The selected GLB is missing from your local asset library."
        );
      const buffer = await asset.blob.arrayBuffer();
      loader.parse(
        buffer,
        "",
        (gltf) => {
          const root = gltf.scene;
          root.userData.feruObjectId = `feru-object-${++objectCounter}`;
          root.userData.feruAssetId = asset.id;
          root.userData.feruAssetName = asset.name;
          root.traverse((node) => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDimension = Math.max(size.x, size.y, size.z) || 1;
          if (!savedTransform) {
            root.scale.multiplyScalar(2.2 / maxDimension);
            const centered = new THREE.Box3().setFromObject(root);
            const center = centered.getCenter(new THREE.Vector3());
            root.position.set(
              -center.x + roots.length * 1.5,
              -center.y,
              -center.z
            );
          } else {
            root.position.fromArray(savedTransform.position || [0, 0, 0]);
            root.rotation.fromArray(
              savedTransform.rotation || [0, 0, 0, "XYZ"]
            );
            root.scale.fromArray(savedTransform.scale || [1, 1, 1]);
          }
          scene.add(root);
          roots.push(root);
          selectRoot(root);
          renderObjectList();
          renderOnce();
          status(`${asset.name} added to the scene.`);
        },
        (error) =>
          status(`Could not read this GLB: ${error.message || error}`, true)
      );
    } catch (error) {
      status(error.message, true);
    }
  }

  function selectRoot(root) {
    selectedRoot = root || null;
    if (transform) {
      if (selectedRoot) transform.attach(selectedRoot);
      else transform.detach();
    }
    $("feru-selected-name").textContent =
      selectedRoot?.userData.feruAssetName || "Nothing selected";
    $("feru-remove-object").disabled = !selectedRoot;
    renderObjectList();
    renderOnce();
  }

  function renderObjectList() {
    const list = $("feru-object-list");
    if (!list) return;
    if (!roots.length) {
      list.innerHTML =
        '<p class="feru-builder-help">No objects in the scene yet.</p>';
      return;
    }
    list.innerHTML = roots
      .map((root) => {
        const id = root.userData.feruObjectId;
        const name = root.userData.feruAssetName || "3D object";
        return `<button class="feru-object-row ${ root === selectedRoot ? "selected" : "" }" type="button" data-feru-select-object="${escapeHTML( id )}">${escapeHTML(name)}</button>`;
      })
      .join("");
  }

  function setTransformMode(mode) {
    if (!transform) return;
    transform.setMode(mode);
    document
      .querySelectorAll("[data-feru-mode]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.feruMode === mode)
      );
    status(`${mode[0].toUpperCase()}${mode.slice(1)} tool selected.`);
  }

  function removeSelected() {
    if (!selectedRoot) return;
    transform.detach();
    scene.remove(selectedRoot);
    disposeTree(selectedRoot);
    const index = roots.indexOf(selectedRoot);
    if (index >= 0) roots.splice(index, 1);
    selectedRoot = null;
    selectRoot(null);
    renderObjectList();
    renderOnce();
    status("Selected object removed. Your original asset file is unchanged.");
  }

  function disposeTree(root) {
    root.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value && value.isTexture) value.dispose();
          });
          material.dispose();
        });
      }
    });
  }

  function clearScene() {
    [...roots].forEach((root) => {
      scene.remove(root);
      disposeTree(root);
    });
    roots.length = 0;
    selectedRoot = null;
    transform?.detach();
    renderObjectList();
    selectRoot(null);
    status("Scene cleared. Your asset library is unchanged.");
    renderOnce();
  }

  function resetCamera() {
    if (!camera || !orbit) return;
    camera.position.set(6, 5, 8);
    orbit.target.set(0, 1, 0);
    orbit.update();
    renderOnce();
  }

  function getSavedScenes() {
    try {
      const value = JSON.parse(localStorage.getItem(SCENE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function refreshSceneSelect(selectedId = "") {
    const select = $("feru-scene-select");
    if (!select) return;
    const scenes = getSavedScenes();
    select.innerHTML = scenes.length
      ? scenes
          .map(
            (item) =>
              `<option value="${escapeHTML(item.id)}">${escapeHTML( item.name )}</option>`
          )
          .join("")
      : '<option value="">No saved scenes</option>';
    if (selectedId) select.value = selectedId;
  }

  function saveScene() {
    if (!stageReady) {
      status("Open the 3D builder before saving a scene.", true);
      return;
    }
    const name = $("feru-scene-name").value.trim() || "Untitled scene";
    const saved = getSavedScenes();
    const sceneData = {
      id: `scene-${Date.now()}`,
      name,
      updatedAt: new Date().toISOString(),
      camera: {
        position: camera.position.toArray(),
        target: orbit.target.toArray(),
      },
      lightIntensity: directionalLight.intensity,
      objects: roots.map((root) => ({
        assetId: root.userData.feruAssetId,
        name: root.userData.feruAssetName,
        position: root.position.toArray(),
        rotation: root.rotation.toArray(),
        scale: root.scale.toArray(),
      })),
    };
    saved.push(sceneData);
    try {
      localStorage.setItem(SCENE_KEY, JSON.stringify(saved));
      refreshSceneSelect(sceneData.id);
      status(`Scene "${name}" saved in this browser.`);
    } catch {
      status("Could not save the scene. Browser storage may be full.", true);
    }
  }

  async function loadSelectedScene() {
    const id = $("feru-scene-select").value;
    const sceneData = getSavedScenes().find((item) => item.id === id);
    if (!sceneData) {
      status("Choose a saved scene first.", true);
      return;
    }
    clearScene();
    status("Rebuilding your saved scene…");
    for (const object of sceneData.objects || []) {
      await addAssetToScene(object.assetId, object);
    }
    if (sceneData.camera?.position)
      camera.position.fromArray(sceneData.camera.position);
    if (sceneData.camera?.target)
      orbit.target.fromArray(sceneData.camera.target);
    if (typeof sceneData.lightIntensity === "number") {
      directionalLight.intensity = sceneData.lightIntensity;
      $("feru-light-intensity").value = String(sceneData.lightIn
