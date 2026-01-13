(() => {
  const INTERVAL_MS = 1000;

  const gridEl = document.getElementById("grid");
  const gridWrapEl = document.getElementById("gridWrap");
  const rightPanelEl = document.getElementById("rightPanel");
  const statusEl = document.getElementById("status");
  const bannerEl = document.getElementById("banner");

  const rowsRange = document.getElementById("rowsRange");
  const colsRange = document.getElementById("colsRange");
  const rowsVal = document.getElementById("rowsVal");
  const colsVal = document.getElementById("colsVal");

  const startBtn = document.getElementById("startBtn");
  const quitBtn = document.getElementById("quitBtn");

  if (!gridEl || !gridWrapEl || !rightPanelEl || !statusEl || !bannerEl ||
      !rowsRange || !colsRange || !rowsVal || !colsVal || !startBtn || !quitBtn) {
    console.error("Game2: missing DOM elements. Check ids in game2.html.");
    return;
  }

  let rows = 5;
  let cols = 4;

  // Dot / timer
  let activeIndex = -1;
  let timerId = null;

  // Pattern state
  let curRow = 0;
  let curCol = 0;
  let rowInc = 0;
  let colInc = 0;

  // Guessing state
  let nextIndex = -1;
  let solved = false;

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

  function randIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function idxFromRC(r, c) {
    return r * cols + c;
  }

  function computeNextIndex() {
    const nr = (curRow + rowInc) % rows;
    const nc = (curCol + colInc) % cols;
    return idxFromRC(nr, nc);
  }

  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.style.display = "block";
  }

  function hideBanner() {
    bannerEl.style.display = "none";
    bannerEl.textContent = "";
  }

  function flashClass(cell, className, ms = 450) {
    cell.classList.add(className);
    window.setTimeout(() => cell.classList.remove(className), ms);
  }

  function setDot(index) {
    // remove old dot
    if (activeIndex >= 0) {
      const oldCell = gridEl.children[activeIndex];
      if (oldCell) oldCell.innerHTML = "";
    }
    activeIndex = index;

    // add new dot
    const cell = gridEl.children[activeIndex];
    if (!cell) return;

    const dot = document.createElement("div");
    dot.className = "dot";
    cell.appendChild(dot);
  }

  function handleGuess(clickedIndex) {
    if (solved || nextIndex < 0) return;

    const cell = gridEl.children[clickedIndex];
    if (!cell) return;

    if (clickedIndex === nextIndex) {
      solved = true;
      stopTimer();
      cell.classList.add("correct");
      showBanner("✅ Correct! You found the next cell.");
      statusEl.textContent =
        `Solved: ${rows}×${cols}. Δrow=${rowInc}, Δcol=${colInc}. Press Start for a new pattern.`;
    } else {
      flashClass(cell, "wrong", 450);
      showBanner("❌ Not that one — try again.");
      window.setTimeout(() => { if (!solved) hideBanner(); }, 900);
    }
  }

  // Fit grid so it never clips top/bottom
  function fitGridToPanel() {
    // We want the grid to fit inside gridWrap
    const wrapRect = gridWrapEl.getBoundingClientRect();

    // Padding inside .grid itself (from CSS)
    // We remove it from available space so the grid content stays visible.
    const gridPadding = 28; // 14px left + 14px right (and same vertically)
    const availableW = Math.max(220, wrapRect.width - 10);   // a little breathing room
    const availableH = Math.max(220, wrapRect.height - 10);

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

    // Keep the grid from becoming too tiny
    width = Math.max(240, width);
    height = Math.max(200, height);

    gridEl.style.width = `${Math.floor(width)}px`;
    gridEl.style.height = `${Math.floor(height)}px`;
  }

  function tick() {
    // advance using modular arithmetic
    curRow = (curRow + rowInc) % rows;
    curCol = (curCol + colInc) % cols;

    setDot(idxFromRC(curRow, curCol));
    nextIndex = computeNextIndex();
  }

  function buildGrid() {
    gridEl.innerHTML = "";

    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("aria-label", `Cell ${i + 1}`);
      cell.addEventListener("click", () => handleGuess(i));
      gridEl.appendChild(cell);
    }

    fitGridToPanel();
  }

  function startGame() {
    stopTimer();
    hideBanner();
    solved = false;

    rows = parseInt(rowsRange.value, 10);
    cols = parseInt(colsRange.value, 10);

    // choose new pattern each start
    rowInc = randIntInclusive(0, rows - 1);
    colInc = randIntInclusive(0, cols - 1);

    // avoid fully stationary pattern (optional safety)
    if (rowInc === 0 && colInc === 0) {
      colInc = (cols > 1) ? 1 : 0;
    }

    // choose random starting position
    curRow = randIntInclusive(0, rows - 1);
    curCol = randIntInclusive(0, cols - 1);

    activeIndex = -1;
    buildGrid();

    // show starting location
    setDot(idxFromRC(curRow, curCol));
    nextIndex = computeNextIndex();

    timerId = window.setInterval(tick, INTERVAL_MS);

    statusEl.textContent =
      `Running: ${rows}×${cols}. Δrow=${rowInc}, Δcol=${colInc}. Click the NEXT cell.`;
  }

  // UI wiring
  rowsRange.addEventListener("input", updateSliderLabels);
  colsRange.addEventListener("input", updateSliderLabels);

  startBtn.addEventListener("click", startGame);

  quitBtn.addEventListener("click", () => {
    stopTimer();
    window.location.href = "../index.html";
  });

  window.addEventListener("resize", () => {
    if (gridEl.children.length > 0) fitGridToPanel();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else if (!solved && timerId === null && gridEl.children.length > 0) {
      timerId = window.setInterval(tick, INTERVAL_MS);
    }
  });

  // Init
  updateSliderLabels();
  rows = parseInt(rowsRange.value, 10);
  cols = parseInt(colsRange.value, 10);
  buildGrid();
  statusEl.textContent = "Ready. Press Start to begin.";
})();
