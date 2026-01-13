(() => {
  const INTERVAL_MS = 1000;

  const gridEl = document.getElementById("grid");
  const statusEl = document.getElementById("status");

  const rowsRange = document.getElementById("rowsRange");
  const colsRange = document.getElementById("colsRange");
  const rowsVal = document.getElementById("rowsVal");
  const colsVal = document.getElementById("colsVal");

  const startBtn = document.getElementById("startBtn");
  const quitBtn = document.getElementById("quitBtn");

  // If any of these are null, the script isn't wired to the right page.
  if (!gridEl || !statusEl || !rowsRange || !colsRange || !startBtn || !quitBtn) {
    console.error("Game2: missing DOM elements. Check ids in game2.html.");
    return;
  }

  let rows = 3;
  let cols = 4;
  let activeIndex = -1;
  let timerId = null;

  function updateSliderLabels() {
    rowsVal.textContent = rowsRange.value;
    colsVal.textContent = colsRange.value;
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function randomIndex() {
    return Math.floor(Math.random() * rows * cols);
  }

  function setDot(index) {
    if (activeIndex >= 0) {
      const oldCell = gridEl.children[activeIndex];
      if (oldCell) oldCell.innerHTML = "";
    }
    activeIndex = index;

    const cell = gridEl.children[activeIndex];
    if (!cell) return;

    const dot = document.createElement("div");
    dot.className = "dot";
    cell.appendChild(dot);
  }

  function tick() {
    let idx = randomIndex();
    if (rows * cols > 1) {
      while (idx === activeIndex) idx = randomIndex();
    }
    setDot(idx);
  }
function fitGridToPanel() {
  const panel = document.getElementById("rightPanel");
  if (!panel) return;

  // Available space inside the right panel:
  const panelRect = panel.getBoundingClientRect();
  const statusRect = statusEl.getBoundingClientRect();

  // Height available for the grid-wrap area (leave a little breathing room)
  const availableH = Math.max(140, (statusRect.top - panelRect.top) - 18);
  const availableW = Math.max(200, panelRect.width - 28);

  const ratio = cols / rows; // width / height

  let width, height;
  if (availableW / availableH > ratio) {
    // height-limited
    height = availableH;
    width = height * ratio;
  } else {
    // width-limited
    width = availableW;
    height = width / ratio;
  }

  gridEl.style.width = `${Math.floor(width)}px`;
  gridEl.style.height = `${Math.floor(height)}px`;

  // IMPORTANT: don't let aspect-ratio fight our explicit sizing
  gridEl.style.aspectRatio = "";
}

  function buildGrid() {
    gridEl.innerHTML = "";

    // Set grid dimensions + aspect ratio dynamically
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("aria-label", `Cell ${i + 1}`);

      // Phase 0: clicking does nothing (yet)
      cell.addEventListener("click", () => {});

      gridEl.appendChild(cell);
    }
    fitGridToPanel();

  }

  function startGame() {
    stopTimer();

    rows = parseInt(rowsRange.value, 10);
    cols = parseInt(colsRange.value, 10);

    activeIndex = -1;
    buildGrid();
    tick();
fitGridToPanel();

    timerId = window.setInterval(tick, INTERVAL_MS);
    statusEl.textContent = `Running: ${rows}×${cols}. Dot moves every 1 second.`;
  }

  // Wire UI
  rowsRange.addEventListener("input", updateSliderLabels);
  colsRange.addEventListener("input", updateSliderLabels);

  startBtn.addEventListener("click", startGame);

  quitBtn.addEventListener("click", () => {
    stopTimer();
    window.location.href = "../index.html";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else if (timerId === null && gridEl.children.length > 0) {
      tick();
      timerId = window.setInterval(tick, INTERVAL_MS);
    }
  });
window.addEventListener("resize", () => {
  if (gridEl.children.length > 0) fitGridToPanel();
});

  // Init
  updateSliderLabels();
  rows = parseInt(rowsRange.value, 10);
  cols = parseInt(colsRange.value, 10);
  buildGrid();                       // show a grid immediately
  statusEl.textContent = "Ready. Press Start to begin.";
})();
