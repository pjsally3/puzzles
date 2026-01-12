(() => {
  const ROWS = 3;
  const COLS = 4;
  const INTERVAL_MS = 1000;

  const gridEl = document.getElementById("grid");
  const statusEl = document.getElementById("status");
  const quitBtn = document.getElementById("quitBtn");

  /** index: 0..(ROWS*COLS-1) */
  let activeIndex = -1;
  let timerId = null;

  function makeCells() {
    gridEl.innerHTML = "";
    for (let i = 0; i < ROWS * COLS; i++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("aria-label", `Cell ${i + 1}`);
      cell.addEventListener("click", () => {
        // For now: do nothing besides allow quitting.
        // Later: this will become "click the NEXT cell to win".
      });
      gridEl.appendChild(cell);
    }
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

  function randomIndex() {
    return Math.floor(Math.random() * ROWS * COLS);
  }

  function tick() {
    // avoid repeating same cell if possible
    let idx = randomIndex();
    if (ROWS * COLS > 1) {
      while (idx === activeIndex) idx = randomIndex();
    }
    setDot(idx);
  }

  function start() {
    makeCells();
    tick();
    timerId = window.setInterval(tick, INTERVAL_MS);
  }

  function stop() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  quitBtn.addEventListener("click", () => {
    stop();
    // back to your main page
    window.location.href = "../index.html";
  });

  // stop timer if tab goes inactive (nice mobile behavior)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (!timerId) {
      tick();
      timerId = window.setInterval(tick, INTERVAL_MS);
    }
  });

  start();
})();
