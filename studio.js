(() => {
  "use strict";

  // FERU STUDIO Stage 1: a safe add-on. It reads the existing IndexedDB store
  // and does not alter projects, assets, backups, or the database schema.
  const DB_NAME = "feru-cinema-local-db";
  const DB_VERSION = 1;
  const MODEL_VIEWER_URL =
    "https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js";

  let activeObjectUrl = null;
  let activeAssetName = "";
  let viewerLoadPromise = null;

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

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser does not support local asset storage."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error || new Error("Could not open the FERU asset library.")
        );
      request.onupgradeneeded = () => {
        // Do not create or change stores here. The main app owns the schema.
        request.transaction.abort();
        reject(
          new Error(
            "The FERU asset database has not been created yet. Open the main app first."
          )
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
          reject(request.error || new Error("Could not read assets."));
        tx.onabort = () =>
          reject(tx.error || new Error("Asset read was interrupted."));
      });
    } finally {
      db.close();
    }
  }

  function loadModelViewer() {
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (viewerLoadPromise) return viewerLoadPromise;

    viewerLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = MODEL_VIEWER_URL;
      script.onload = () =>
        customElements.whenDefined("model-viewer").then(resolve, reject);
      script.onerror = () =>
        reject(
          new Error(
            "The free 3D viewer library could not load. Connect to the internet and try again."
          )
        );
      document.head.appendChild(script);
    }).catch((error) => {
      viewerLoadPromise = null;
      throw error;
    });
    return viewerLoadPromise;
  }

  function showMessage(message, isError = false) {
    const status = document.getElementById("feru-studio-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("feru-studio-error", isError);
  }

  function releaseCurrentModel() {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
    activeAssetName = "";
  }

  function addStudioInterface() {
    const sidebar = document.querySelector(".sidebar");
    const main = document.getElementById("main");
    if (!sidebar || !main || document.getElementById("view-feru-studio"))
      return;

    const nav = document.createElement("button");
    nav.className = "nav-item";
    nav.type = "button";
    nav.dataset.feruStudioNav = "true";
    nav.innerHTML = "✧ <span>FERU Studio</span>";
    const standardsNav = sidebar.querySelector('[data-view="standards"]');
    sidebar.insertBefore(nav, standardsNav || null);

    const section = document.createElement("section");
    section.className = "view";
    section.id = "view-feru-studio";
    section.innerHTML = ` <div class="page-head feru-studio-head"> <div> <p class="eyebrow">FERU CREATIVE WORKSPACE</p> <h1>FERU Studio</h1> <p class="muted">Inspect and preview compatible 3D models from your local asset library.</p> </div> <button class="secondary" type="button" id="feru-refresh-models">Refresh models</button> </div> <div class="notice"> Your model files remain in this device's existing FERU library. The 3D viewer is a free open-source component loaded from the internet when first needed; the viewer itself may not be available offline until its library is cached by your browser. </div> <div class="feru-studio-grid"> <section class="feru-model-panel"> <div class="section-head"><div><p class="eyebrow">YOUR LOCAL FILES</p><h2>3D model library</h2></div></div> <div id="feru-model-list" class="feru-model-list"><div class="empty">Loading your models…</div></div> </section> <section class="feru-viewer-panel"> <div class="section-head"><div><p class="eyebrow">MODEL PREVIEW</p><h2 id="feru-model-title">No model selected</h2></div></div> <div class="feru-viewer-frame" id="feru-viewer-frame"> <div class="feru-viewer-placeholder"> <span class="feru-viewer-symbol">◉</span> <b>Your 3D stage is ready</b> <span>Select a GLB model from your library to begin.</span> </div> </div> <p id="feru-studio-status" class="feru-studio-status" role="status">Waiting for a model.</p> <div class="feru-viewer-controls"> <label class="feru-animation-control">Animation <select id="feru-animation-select" disabled><option value="">No animations detected</option></select> </label> <div class="feru-control-buttons"> <button class="secondary" type="button" id="feru-play-animation" disabled>Play animation</button> <button class="secondary" type="button" id="feru-reset-camera" disabled>Reset camera</button> <button class="secondary" type="button" id="feru-rotate-model" disabled>Auto-rotate: off</button> </div> </div> <p class="feru-studio-footnote">Touch controls: drag to rotate, pinch to zoom, and use two fingers to pan. Animation controls appear only when the model contains animations.</p> </section> </div>`;
    main.appendChild(section);

    nav.addEventListener("click", () => navigateToStudio());
    document
      .getElementById("feru-refresh-models")
      .addEventListener("click", renderModelList);
    document
      .getElementById("feru-play-animation")
      .addEventListener("click", toggleAnimation);
    document
      .getElementById("feru-reset-camera")
      .addEventListener("click", resetCamera);
    document
      .getElementById("feru-rotate-model")
      .addEventListener("click", toggleAutoRotate);
    document
      .getElementById("feru-animation-select")
      .addEventListener("change", (event) => {
        const viewer = document.getElementById("feru-model-viewer");
        if (!viewer) return;
        viewer.animationName = event.target.value || null;
        viewer.pause();
        document.getElementById("feru-play-animation").textContent =
          "Play animation";
      });

    document
      .getElementById("feru-model-list")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-feru-open-model]");
        if (button) openModel(button.dataset.feruOpenModel);
      });
  }

  function navigateToStudio() {
    document
      .querySelectorAll(".view")
      .forEach((view) =>
        view.classList.toggle("active", view.id === "view-feru-studio")
      );
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.feruStudioNav === "true");
      if (item.dataset.view) item.classList.remove("active");
    });
    if (location.hash !== "#studio") history.replaceState(null, "", "#studio");
    document.getElementById("main")?.focus({ preventScroll: true });
    renderModelList();
  }

  async function renderModelList() {
    const list = document.getElementById("feru-model-list");
    if (!list) return;
    list.innerHTML =
      '<div class="empty">Reading your local asset library…</div>';
    try {
      const assets = await readAssets();
      const models = assets
        .filter(
          (asset) =>
            asset.type === "3D model" && /\.(glb|gltf)$/i.test(asset.name || "")
        )
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

      if (!models.length) {
        list.innerHTML =
          '<div class="empty">No 3D models found. Import a GLB or glTF file in Asset library first.</div>';
        return;
      }

      list.innerHTML = models
        .map((asset) => {
          const isGLB = /\.glb$/i.test(asset.name);
          return `<article class="feru-model-item"> <div class="feru-model-file-icon">${isGLB ? "GLB" : "GLTF"}</div> <div class="feru-model-file-info"><b>${escapeHTML( asset.name )}</b><small>${escapeHTML(asset.sizeLabel || "")} · ${ isGLB ? "Ready to preview" : "External companion files may be required" }</small></div> <button class="secondary" type="button" data-feru-open-model="${escapeHTML( asset.id )}" ${isGLB ? "" : "disabled"}>${isGLB ? "Open" : "GLB only"}</button> </article>`;
        })
        .join("");
    } catch (error) {
      list.innerHTML = `<div class="empty">${escapeHTML(error.message)}</div>`;
    }
  }

  async function openModel(id) {
    const status = document.getElementById("feru-studio-status");
    const frame = document.getElementById("feru-viewer-frame");
    try {
      showMessage("Preparing your local 3D model…");
      const assets = await readAssets();
      const asset = assets.find((item) => item.id === id);
      if (!asset || !asset.blob)
        throw new Error(
          "This model could not be found in the local asset library."
        );
      if (!/\.glb$/i.test(asset.name))
        throw new Error(
          "Stage 1 preview currently supports GLB files. glTF support may require companion files."
        );
      await loadModelViewer();

      releaseCurrentModel();
      activeAssetName = asset.name;
      activeObjectUrl = URL.createObjectURL(asset.blob);
      document.getElementById("feru-model-title").textContent = asset.name;
      frame.innerHTML =
        '<model-viewer id="feru-model-viewer" camera-controls touch-action="pan-y" interaction-prompt="none" shadow-intensity="1" exposure="1" alt="Interactive 3D model preview"></model-viewer>';
      const viewer = document.getElementById("feru-model-viewer");
      viewer.addEventListener(
        "error",
        () =>
          showMessage(
            "The model could not be rendered. Check that this is a valid GLB file.",
            true
          ),
        { once: true }
      );
      viewer.addEventListener("load", () => setupAnimationControls(viewer), {
        once: true,
      });
      viewer.src = activeObjectUrl;
      document.getElementById("feru-play-animation").disabled = true;
      document.getElementById("feru-reset-camera").disabled = false;
      document.getElementById("feru-rotate-model").disabled = false;
      document.getElementById("feru-rotate-model").textContent =
        "Auto-rotate: off";
      showMessage(`Loading ${asset.name}…`);
    } catch (error) {
      showMessage(error.message, true);
      if (status) status.textContent = error.message;
    }
  }

  function setupAnimationControls(viewer) {
    const select = document.getElementById("feru-animation-select");
    const play = document.getElementById("feru-play-animation");
    const animations = viewer.availableAnimations || [];
    select.innerHTML = "";
    if (animations.length) {
      animations.forEach((name, index) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name || `Animation ${index + 1}`;
        select.appendChild(option);
      });
      select.disabled = false;
      viewer.animationName = animations[0];
      play.disabled = false;
      showMessage(
        `${activeAssetName} loaded · ${animations.length} animation${ animations.length === 1 ? "" : "s" } detected.`
      );
    } else {
      select.innerHTML = '<option value="">No animations detected</option>';
      select.disabled = true;
      play.disabled = true;
      showMessage(
        `${activeAssetName} loaded successfully. This model has no embedded animations.`
      );
    }
  }

  function toggleAnimation() {
    const viewer = document.getElementById("feru-model-viewer");
    const button = document.getElementById("feru-play-animation");
    if (!viewer || !viewer.availableAnimations?.length) return;
    if (button.textContent === "Play animation") {
      viewer.play();
      button.textContent = "Pause animation";
    } else {
      viewer.pause();
      button.textContent = "Play animation";
    }
  }

  function resetCamera() {
    const viewer = document.getElementById("feru-model-viewer");
    if (!viewer) return;
    viewer.cameraOrbit = "auto auto auto";
    viewer.cameraTarget = "auto";
    viewer.jumpCameraToGoal();
  }

  function toggleAutoRotate() {
    const viewer = document.getElementById("feru-model-viewer");
    const button = document.getElementById("feru-rotate-model");
    if (!viewer) return;
    viewer.toggleAttribute("auto-rotate");
    button.textContent = viewer.hasAttribute("auto-rotate")
      ? "Auto-rotate: on"
      : "Auto-rotate: off";
  }

  function init() {
    addStudioInterface();
    if (location.hash === "#studio") navigateToStudio();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#studio") navigateToStudio();
    });
    window.addEventListener("beforeunload", releaseCurrentModel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
