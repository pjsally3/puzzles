(() => {
  // ---------- Config ----------
  const WORD_FILE = "words5.txt";
  const DEFAULT_CHAIN_LEN = 3; // 2..5 supported
  const ALLOWED_WORD_LENS = new Set([3, 4, 5]);

  // Visual
  const COLORS = {
    white: "#ffffff",
    black: "#000000",
    node: "rgb(50,100,200)",
    start: "rgb(50,180,50)",
    end: "rgb(200,60,60)",
    legendBg: "rgb(248,248,252)",
    legendBorder: "rgb(150,150,165)",
    tooltipBg: "#ffffff",
    tooltipBorder: "rgb(120,120,140)",
    buttonBg: "rgb(230,230,230)",
    buttonHover: "rgb(210,210,210)",
    buttonBorder: "rgb(100,100,100)",
  };

  const WORD_EDGE_COLORS = [
    "rgb(0,120,215)",
    "rgb(200,120,0)",
    "rgb(140,0,200)",
    "rgb(0,150,120)",
    "rgb(170,60,60)",
  ];

  const NODE_R = 22;
  const LEGEND_NODE_R = 16;
  const LANE_SPACING = 22;
  const MAX_LANE_BOOST = 6;

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  window.addEventListener("resize", resize);

  // ---------- UI Modal ----------
  const howtoOverlay = document.getElementById("howtoOverlay");
  document.getElementById("closeHowto")?.addEventListener("click", () => {
    howtoOverlay.style.display = "none";
  });

  // ---------- State ----------
  let words = [];
  let chainLen = DEFAULT_CHAIN_LEN;
  let chain = null; // array of words
  let revealed = []; // array of Set(indexes)
  let showWords = false;
  let errorCount = 0;
  let hintCount = 0;
  let solved = false;

  let puzzleStart = performance.now();
  let solvedElapsedMs = 0;

  // Drag state (legend -> node)
  let dragging = false;
  let draggedLetter = null;
  let pointer = { x: 0, y: 0 };

  // Hover
  let hoverNode = null;

  // Geometry caches (recomputed each frame)
  let positions = new Map(); // letter -> {x,y}
  let rcMap = new Map(); // letter -> {r,c}
  let order = []; // unique letters in appearance order
  let edges = []; // {a,b,wi}
  let edgeParams = []; // {kind, offsetY?, above?}
  let legendItems = []; // {letter, cx, cy, remaining}

  // Buttons
  let buttons = [];
  function makeButtons() {
    const labels = [
      { label: "Hint", action: "hint" },
      { label: "Reveal", action: "reveal" },
      { label: "How To Play", action: "howto" },
      { label: "Next", action: "next" },
      { label: "Quit", action: "quit" },
    ];
    buttons = labels.map((x) => ({ ...x, rect: { x: 0, y: 0, w: 0, h: 0 } }));
  }
  makeButtons();

  // ---------- Word chain logic ----------
  function cleanWord(s) {
    return (s || "").trim().toLowerCase();
  }

  function buildLetterSeq(chainArr) {
    if (!chainArr || chainArr.length === 0) return [];
    const seq = [...chainArr[0]];
    for (let i = 1; i < chainArr.length; i++) seq.push(...chainArr[i].slice(1));
    return seq;
  }

  function buildEdgesByWord(chainArr) {
    const e = [];
    chainArr.forEach((w, wi) => {
      for (let i = 0; i < w.length - 1; i++) e.push({ a: w[i], b: w[i + 1], wi });
    });
    return e;
  }

  function freqMap(chainArr) {
    const m = new Map();
    chainArr.forEach((w) => [...w].forEach((ch) => m.set(ch, (m.get(ch) || 0) + 1)));
    return m;
  }

  function hiddenCounts(chainArr, revealedSets) {
    const m = new Map();
    for (let wi = 0; wi < chainArr.length; wi++) {
      const w = chainArr[wi];
      for (let li = 0; li < w.length; li++) {
        if (!revealedSets[wi].has(li)) {
          const ch = w[li];
          m.set(ch, (m.get(ch) || 0) + 1);
        }
      }
    }
    return m;
  }

  function chooseRandomUnrevealed(chainArr, revealedSets) {
    const candidates = [];
    for (let wi = 0; wi < chainArr.length; wi++) {
      const w = chainArr[wi];
      for (let li = 0; li < w.length; li++) {
        if (!revealedSets[wi].has(li)) candidates.push({ wi, li });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function revealAllOccurrences(chainArr, revealedSets, letter) {
    for (let wi = 0; wi < chainArr.length; wi++) {
      const w = chainArr[wi];
      for (let li = 0; li < w.length; li++) {
        if (w[li] === letter) revealedSets[wi].add(li);
      }
    }
  }

  function isLetterAlreadyRevealedAny(chainArr, revealedSets, letter) {
    for (let wi = 0; wi < chainArr.length; wi++) {
      const w = chainArr[wi];
      for (const li of revealedSets[wi]) {
        if (w[li] === letter) return true;
      }
    }
    return false;
  }

  function tryChain(wordList, n) {
    if (wordList.length < n) return null;
    const used = new Set();
    const c = [];
    c.push(wordList[Math.floor(Math.random() * wordList.length)]);
    used.add(c[0]);

    for (let i = 1; i < n; i++) {
      const last = c[c.length - 1].slice(-1);
      const options = wordList.filter((w) => w[0] === last && !used.has(w));
      if (options.length === 0) return null;
      const w = options[Math.floor(Math.random() * options.length)];
      c.push(w);
      used.add(w);
    }
    return c;
  }

  function getChain(wordList, n, maxAttempts = 1500) {
    for (let i = 0; i < maxAttempts; i++) {
      const c = tryChain(wordList, n);
      if (c) return c;
    }
    return null;
  }

  function newPuzzle() {
    chain = getChain(words, chainLen);
    if (!chain) {
      alert("Could not create a chain from your word list. Add more words.");
      return;
    }
    revealed = chain.map(() => new Set());
    showWords = false;
    errorCount = 0;
    hintCount = 0;
    solved = false;
    dragging = false;
    draggedLetter = null;
    hoverNode = null;
    puzzleStart = performance.now();
    solvedElapsedMs = 0;
  }

  // ---------- Layout ----------
  function computePositions(seqChars, W, H) {
    order = [];
    for (const ch of seqChars) if (!order.includes(ch)) order.push(ch);

    positions = new Map();
    rcMap = new Map();
    if (order.length === 0) return;

    const n = order.length;
    const rows = n <= 18 ? 2 : 3;
    const cols = Math.max(1, Math.ceil(n / rows));

    const leftMargin = 40;
    const rightMargin = 310; // reserve legend space
    const usableW = Math.max(220, W - leftMargin - rightMargin);
    const step = cols > 1 ? usableW / (cols - 1) : 0;

    const centerY = Math.floor(H / 2 + 20);
    const rowYs =
      rows === 2 ? [centerY - 70, centerY + 70] : [centerY - 90, centerY, centerY + 90];

    order.forEach((ch, idx) => {
      const r = idx % rows;
      const c = Math.floor(idx / rows);
      const x = leftMargin + c * step;
      const y = rowYs[r];
      positions.set(ch, { x, y });
      rcMap.set(ch, { r, c });
    });
  }

  function computeEdgeParamsWithLanes(edgesArr, centerY) {
    const params = [];
    const laneCounts = new Map();

    for (const e of edgesArr) {
      const a = e.a,
        b = e.b;
      if (!positions.has(a) || !positions.has(b)) {
        params.push({ kind: "skip" });
        continue;
      }
      const pa = positions.get(a);
      const pb = positions.get(b);

      if (a === b) {
        params.push({ kind: "loop", above: pa.y <= centerY });
        continue;
      }

      const ra = rcMap.get(a),
        rb = rcMap.get(b);
      if (ra && rb && ra.r === rb.r && Math.abs(ra.c - rb.c) === 1) {
        params.push({ kind: "straight" });
        continue;
      }

      const midY = (pa.y + pb.y) / 2;
      const outward = midY <= centerY ? -1 : 1;

      const colDist = Math.abs((ra?.c ?? 0) - (rb?.c ?? 0));
      let base = 50 + 18 * Math.min(6, colDist);
      if ((ra?.r ?? 0) !== (rb?.r ?? 0)) base += 25;

      const cmin = Math.min(ra?.c ?? 0, rb?.c ?? 0);
      const cmax = Math.max(ra?.c ?? 0, rb?.c ?? 0);
      const rmin = Math.min(ra?.r ?? 0, rb?.r ?? 0);
      const rmax = Math.max(ra?.r ?? 0, rb?.r ?? 0);

      const key = `${cmin}|${cmax}|${outward}|${rmin}|${rmax}`;
      const lane = laneCounts.get(key) || 0;
      laneCounts.set(key, lane + 1);

      const laneBoost = Math.min(lane, MAX_LANE_BOOST);
      const offsetY = outward * (base + laneBoost * LANE_SPACING);

      params.push({ kind: "curve", offsetY });
    }
    return params;
  }

  // ---------- Drawing primitives ----------
  function drawCircle(x, y, r, fill, stroke, strokeW = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawArrowhead(tipX, tipY, angleRad, color, headLen = 18, headW = 10) {
    const lx = tipX - headLen * Math.cos(angleRad) + headW * Math.sin(angleRad);
    const ly = tipY - headLen * Math.sin(angleRad) - headW * Math.cos(angleRad);
    const rx = tipX - headLen * Math.cos(angleRad) - headW * Math.sin(angleRad);
    const ry = tipY - headLen * Math.sin(angleRad) + headW * Math.cos(angleRad);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();
  }

  function drawStraightArrow(pa, pb, color, width = 3) {
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return;

    const ux = dx / dist,
      uy = dy / dist;
    const start = { x: pa.x + ux * NODE_R, y: pa.y + uy * NODE_R };
    const tip = { x: pb.x - ux * NODE_R, y: pb.y - uy * NODE_R };

    const headLen = 16;
    const shaftEnd = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shaftEnd.x, shaftEnd.y);
    ctx.stroke();

    drawArrowhead(tip.x, tip.y, Math.atan2(dy, dx), color, 16, 10);
  }

  function quadPoint(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  function quadDeriv(p0, p1, p2, t) {
    return {
      x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
    };
  }

  function drawCurvedArrow(pa, pb, offsetY, color, width = 3) {
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return;

    const ux = dx / dist,
      uy = dy / dist;
    const p0 = { x: pa.x + ux * NODE_R, y: pa.y + uy * NODE_R };
    const c = { x: pb.x, y: pb.y };
    const mid = { x: (p0.x + c.x) / 2, y: (p0.y + c.y) / 2 };
    const p1 = { x: mid.x, y: mid.y + offsetY };

    const HEAD_W = 10;
    const nudgeY = pa.y > pb.y ? HEAD_W / 4 : 0;

    // binary search for where curve hits node circle
    const R = NODE_R;
    let tHi = 1.0;
    let tLo = null;

    for (let i = 1; i <= 30; i++) {
      const t = 1 - i / 30;
      const p = quadPoint(p0, p1, c, t);
      if (Math.hypot(p.x - c.x, p.y - c.y) >= R) {
        tLo = t;
        break;
      }
    }
    if (tLo === null) return;

    for (let i = 0; i < 28; i++) {
      const tm = (tLo + tHi) / 2;
      const p = quadPoint(p0, p1, c, tm);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d >= R) tLo = tm;
      else tHi = tm;
    }
    const tTip = tLo;
    const tip0 = quadPoint(p0, p1, c, tTip);
    const tip = { x: tip0.x, y: tip0.y + nudgeY };

    // Draw curve in segments
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y + nudgeY);

    const steps = 34;
    for (let i = 1; i <= steps; i++) {
      const t = tTip * (i / steps);
      const p = quadPoint(p0, p1, c, t);
      ctx.lineTo(p.x, p.y + nudgeY);
    }
    ctx.stroke();

    const v = quadDeriv(p0, p1, c, tTip);
    const ang = Math.atan2(v.y, v.x);
    drawArrowhead(tip.x, tip.y, ang, color, 18, HEAD_W);
  }

  function drawTeardropLoop(p, above, color, width = 3) {
    const start = above
      ? { x: p.x - NODE_R * 0.6, y: p.y - NODE_R * 0.9 }
      : { x: p.x - NODE_R * 0.6, y: p.y + NODE_R * 0.9 };
    const end = above
      ? { x: p.x + NODE_R * 0.6, y: p.y - NODE_R * 0.9 }
      : { x: p.x + NODE_R * 0.6, y: p.y + NODE_R * 0.9 };
    const tipOffsetY = above ? -NODE_R * 2.2 : NODE_R * 2.2;
    const ctrl = { x: p.x, y: p.y + tipOffsetY };

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const pt = {
        x: u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y,
      };
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    const pPrev = { x: (end.x + ctrl.x) / 2, y: (end.y + ctrl.y) / 2 };
    const ang = Math.atan2(end.y - pPrev.y, end.x - pPrev.x);
    drawArrowhead(end.x, end.y, ang, color, 12, 8);
  }

  // ---------- UI drawing ----------
  function setFont(px, bold = false) {
    ctx.font = `${bold ? "600 " : ""}${px}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  }

  function measure(text) {
    return ctx.measureText(text).width;
  }

  function drawRoundedRect(x, y, w, h, r, fill, stroke, strokeW = 2) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function strokeWordSlotBox(x, yTop, w, h, color) {
    ctx.save();
    drawRoundedRect(x, yTop, w, h, 6, null, color, 3);
    ctx.restore();
  }

  function formatElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function drawTimer(elapsedMs) {
    setFont(18, true);
    ctx.fillStyle = COLORS.black;
    ctx.fillText(`Time: ${formatElapsed(elapsedMs)}`, 14, 26);
  }

  function maskedWords(chainArr, revealedSets) {
    return chainArr.map((w, wi) => [...w].map((ch, li) => (revealedSets[wi].has(li) ? ch : "_")).join(""));
  }

  // Draw header words + swatches AND return per-character layout so we can highlight slots
  function drawChainHeaderAndSwatches(chainArr) {
    const wordsToDraw = showWords ? chainArr : maskedWords(chainArr, revealed);

    setFont(28, true);
    const arrow = " → ";
    const widths = wordsToDraw.map((w) => measure(w));
    const arrowW = measure(arrow);

    let totalW = widths.reduce((a, b) => a + b, 0) + arrowW * (wordsToDraw.length - 1);
    const baselineY = 30;
    let x = canvas.clientWidth / 2 - totalW / 2;

    const layouts = [];

    for (let wi = 0; wi < wordsToDraw.length; wi++) {
      const displayed = wordsToDraw[wi];

      ctx.fillStyle = COLORS.black;
      ctx.fillText(displayed, x, baselineY);

      const charBoxes = [];
      for (let i = 0; i < displayed.length; i++) {
        const left = x + measure(displayed.slice(0, i));
        const w = Math.max(1, measure(displayed[i]));
        charBoxes.push({ x: left, w });
      }

      layouts.push({ wi, x, baselineY, displayed, charBoxes });

      x += widths[wi];
      if (wi < wordsToDraw.length - 1) {
        ctx.fillText(arrow, x, baselineY);
        x += arrowW;
      }
    }

    // swatches under each word
    const swW = 26,
      swH = 10;
    const swY = baselineY + 14;
    layouts.forEach((L) => {
      const rW = widths[L.wi];
      const c = WORD_EDGE_COLORS[L.wi % WORD_EDGE_COLORS.length];
      const swX = L.x + rW / 2 - swW / 2;
      drawRoundedRect(swX, swY, swW, swH, 3, c, "#000", 1);
    });

    return { headerBottom: swY + swH, layouts };
  }

  function drawTooltipCountOnly(count, nodePos) {
    const text = `used: ${count}`;
    setFont(16, false);
    const padX = 10,
      padY = 6;
    const w = measure(text) + padX * 2;
    const h = 18 + padY * 2;

    let tx = nodePos.x - w / 2;
    let ty = nodePos.y - NODE_R - h - 10;

    tx = Math.max(10, Math.min(tx, canvas.clientWidth - w - 10));
    ty = Math.max(10, Math.min(ty, canvas.clientHeight - h - 10));

    drawRoundedRect(tx, ty, w, h, 8, COLORS.tooltipBg, `rgba(120,120,140,1)`, 2);
    ctx.fillStyle = COLORS.black;
    ctx.fillText(text, tx + padX, ty + padY + 14);
  }

  function layoutButtons() {
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    const bw = 130,
      bh = 40,
      spacing = 14;
    const total = buttons.length * bw + (buttons.length - 1) * spacing;
    const startX = (W - total) / 2;
    const y = H - 70;
    buttons.forEach((b, i) => {
      b.rect = { x: startX + i * (bw + spacing), y, w: bw, h: bh };
    });
  }

  function drawButtons() {
    setFont(16, true);
    buttons.forEach((b) => {
      const r = b.rect;
      const hover = pointInRect(pointer.x, pointer.y, r);
      const bg = hover ? COLORS.buttonHover : COLORS.buttonBg;
      drawRoundedRect(r.x, r.y, r.w, r.h, 8, bg, COLORS.buttonBorder, 2);
      ctx.fillStyle = COLORS.black;
      const tw = measure(b.label);
      ctx.fillText(b.label, r.x + (r.w - tw) / 2, r.y + 26);
    });
  }

  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function hitNodeAt(x, y) {
    for (const [ch, p] of positions.entries()) {
      if (Math.hypot(x - p.x, y - p.y) <= NODE_R) return ch;
    }
    return null;
  }

  function buildLegend(hiddenMap) {
    const W = canvas.clientWidth;
    const legendX = W - 250;
    const legendY = 110;

    const remaining = [...hiddenMap.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([letter, n]) => ({ letter, remaining: n }));

    const nItems = remaining.length;
    const rowH = 32,
      pad = 12;
    const twoCols = nItems > 8;
    const colGap = 20,
      colW = 90;
    const rowsPerCol = twoCols ? 8 : nItems;

    const boxW = twoCols ? colW * 2 + colGap + pad * 2 : colW + pad * 2 + 50;
    const boxH = pad + rowH * (twoCols ? 8 : nItems) + pad;

    legendItems = [];
    for (let idx = 0; idx < remaining.length; idx++) {
      const item = remaining[idx];
      let col = 0,
        row = idx;
      if (twoCols) {
        col = idx < rowsPerCol ? 0 : 1;
        row = idx < rowsPerCol ? idx : idx - rowsPerCol;
        if (row >= rowsPerCol) continue;
      }
      const x0 = legendX + pad + col * (colW + colGap);
      const y0 = legendY + pad + row * rowH;
      const cx = x0 + LEGEND_NODE_R;
      const cy = y0 + LEGEND_NODE_R;
      legendItems.push({ letter: item.letter, cx, cy, remaining: item.remaining });
    }

    return { legendX, legendY, boxW, boxH };
  }

  function withAlpha(rgbString, a) {
    if (rgbString.startsWith("rgba")) return rgbString;
    return rgbString.replace("rgb(", "rgba(").replace(")", `,${a})`);
  }

  // ---------- Main draw ----------
  function draw() {
    resize();
    const W = canvas.clientWidth,
      H = canvas.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, W, H);

    layoutButtons();

    if (!chain) {
      requestAnimationFrame(draw);
      return;
    }

    const elapsed = solved ? solvedElapsedMs : performance.now() - puzzleStart;
    drawTimer(elapsed);

    // Header (words + swatches) and capture layout info for per-letter boxes
    const headerInfo = drawChainHeaderAndSwatches(chain);
    const headerBottom = headerInfo.headerBottom;
    const wordLayouts = headerInfo.layouts;

    // compute geometry
    const seq = buildLetterSeq(chain);
    edges = buildEdgesByWord(chain);

    computePositions(seq, W, H);
    const centerY = Math.floor(H / 2 + 20);
    edgeParams = computeEdgeParamsWithLanes(edges, centerY);

    const freq = freqMap(chain);
    const hidden = hiddenCounts(chain, revealed);

    // hover node (works whether or not dragging)
    hoverNode = hitNodeAt(pointer.x, pointer.y);

    // Highlight corresponding slots in the top words when hovering a node
    if (hoverNode && chain && wordLayouts && wordLayouts.length) {
      const boxH = 34;
      const yTop = wordLayouts[0].baselineY - 26;

      for (const L of wordLayouts) {
        const actualWord = chain[L.wi];
        const color = WORD_EDGE_COLORS[L.wi % WORD_EDGE_COLORS.length];

        for (let li = 0; li < actualWord.length; li++) {
          if (actualWord[li] === hoverNode) {
            const cb = L.charBoxes[li];
            if (!cb) continue;
            const padX = 3;
            strokeWordSlotBox(cb.x - padX, yTop, cb.w + padX * 2, boxH, color);
          }
        }
      }
    }

    // legend
    const legendBox = buildLegend(hidden);

    // draw edges
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const p = edgeParams[i];
      if (p.kind === "skip") continue;
      if (!positions.has(e.a) || !positions.has(e.b)) continue;

      const baseCol = WORD_EDGE_COLORS[e.wi % WORD_EDGE_COLORS.length];
      const alpha =
        hoverNode == null ? 0.42 : e.a === hoverNode || e.b === hoverNode ? 0.9 : 0.25;
      const stroke = withAlpha(baseCol, alpha);

      const pa = positions.get(e.a);
      const pb = positions.get(e.b);

      if (p.kind === "loop") {
        drawTeardropLoop(pa, p.above, stroke, 3);
      } else if (p.kind === "straight") {
        drawStraightArrow(pa, pb, stroke, 3);
      } else if (p.kind === "curve") {
        drawCurvedArrow(pa, pb, p.offsetY, stroke, 3);
      }
    }

    // nodes
    const first = seq[0];
    const last = seq[seq.length - 1];

    const revealedLetters = new Set();
    if (showWords) {
      for (const [ch] of freq.entries()) revealedLetters.add(ch);
    } else {
      for (let wi = 0; wi < chain.length; wi++) {
        for (const li of revealed[wi]) revealedLetters.add(chain[wi][li]);
      }
    }

    for (const ch of order) {
      const p = positions.get(ch);
      const fill = ch === first ? COLORS.start : ch === last ? COLORS.end : COLORS.node;

      if (hoverNode === ch) {
        drawCircle(p.x, p.y, NODE_R + 6, null, "rgba(30,30,30,1)", 2);
      }

      drawCircle(p.x, p.y, NODE_R, fill, COLORS.black, 2);

      if (revealedLetters.has(ch)) {
        setFont(26, true);
        ctx.fillStyle = "#fff";
        const t = ch.toUpperCase();
        const tw = measure(t);
        ctx.fillText(t, p.x - tw / 2, p.y + 9);
      }
    }

    // hover tooltip: show ONLY the number, not the letter
    if (hoverNode) {
      drawTooltipCountOnly(freq.get(hoverNode) || 0, positions.get(hoverNode));
    }

    // draw legend box
    drawRoundedRect(
      legendBox.legendX,
      legendBox.legendY,
      legendBox.boxW,
      legendBox.boxH,
      10,
      COLORS.legendBg,
      COLORS.legendBorder,
      2
    );

    // legend items
    for (const item of legendItems) {
      setFont(18, true);
      drawCircle(item.cx, item.cy, LEGEND_NODE_R, COLORS.node, COLORS.black, 2);
      ctx.fillStyle = "#fff";
      const t = item.letter.toUpperCase();
      const tw = measure(t);
      ctx.fillText(t, item.cx - tw / 2, item.cy + 6);

      ctx.fillStyle = COLORS.black;
      setFont(16, false);
      ctx.fillText(`(${item.remaining})`, item.cx + LEGEND_NODE_R + 8, item.cy + 6);
    }

    // dragged letter
    if (dragging && draggedLetter) {
      drawCircle(pointer.x, pointer.y, LEGEND_NODE_R, COLORS.node, COLORS.black, 2);
      setFont(18, true);
      ctx.fillStyle = "#fff";
      const t = draggedLetter.toUpperCase();
      const tw = measure(t);
      ctx.fillText(t, pointer.x - tw / 2, pointer.y + 6);
    }

    // solved banner
    if (solved) {
      const msg = `You solved it!  Errors: ${errorCount}  Time: ${formatElapsed(elapsed)}`;
      setFont(34, true);
      const padX = 18,
        padY = 10;
      const mw = measure(msg);
      const bw = mw + padX * 2;
      const bh = 42 + padY * 2;
      const bx = W / 2 - bw / 2;
      const by = Math.max(105, headerBottom + 35) - bh / 2;
      drawRoundedRect(bx, by, bw, bh, 10, "rgb(245,255,245)", "rgb(60,150,60)", 3);
      ctx.fillStyle = "rgb(60,150,60)";
      ctx.fillText(msg, bx + padX, by + padY + 34);
    }

    drawButtons();

    requestAnimationFrame(draw);
  }

  // ---------- Input (pointer for mouse + touch) ----------
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    updatePointer(e);

    // buttons
    for (const b of buttons) {
      if (pointInRect(pointer.x, pointer.y, b.rect)) {
        handleAction(b.action);
        return;
      }
    }

    // howto overlay blocks play
    if (howtoOverlay && howtoOverlay.style.display === "flex") return;

    // start dragging if touch/click on legend letter
    for (const item of legendItems) {
      if (Math.hypot(pointer.x - item.cx, pointer.y - item.cy) <= LEGEND_NODE_R) {
        dragging = true;
        draggedLetter = item.letter;
        return;
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    updatePointer(e);
  });

  canvas.addEventListener("pointerup", (e) => {
    updatePointer(e);
    if (!dragging || !draggedLetter || !chain) {
      dragging = false;
      draggedLetter = null;
      return;
    }

    const node = hitNodeAt(pointer.x, pointer.y);
    if (node && !showWords && !solved) {
      if (node === draggedLetter) {
        revealAllOccurrences(chain, revealed, draggedLetter);

        const hidden = hiddenCounts(chain, revealed);
        const totalHidden = [...hidden.values()].reduce((a, b) => a + b, 0);
        if (totalHidden === 0) {
          solved = true;
          solvedElapsedMs = performance.now() - puzzleStart;
          showWords = true;
        }
      } else {
        // wrong — but do NOT count error if that node's letter is already revealed anywhere
        if (!isLetterAlreadyRevealedAny(chain, revealed, node)) {
          errorCount += 1;
        }
      }
    }

    dragging = false;
    draggedLetter = null;
  });

  function updatePointer(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }

  // ---------- Button actions ----------
  function handleAction(action) {
    if (!chain) return;

    if (action === "howto") {
      if (howtoOverlay) howtoOverlay.style.display = "flex";
      return;
    }
    if (action === "quit") {
      // Go back to the main PJ PUZZLES page
      window.location.href = "../../index.html";
      return;
    }
    if (action === "next") {
      newPuzzle();
      return;
    }
    if (action === "reveal") {
      showWords = true;
      return;
    }
    if (action === "hint") {
      if (showWords || solved) return;
      const pick = chooseRandomUnrevealed(chain, revealed);
      if (!pick) return;
      const letter = chain[pick.wi][pick.li];
      revealAllOccurrences(chain, revealed, letter);
      hintCount += 1;

      const hidden = hiddenCounts(chain, revealed);
      const totalHidden = [...hidden.values()].reduce((a, b) => a + b, 0);
      if (totalHidden === 0) {
        solved = true;
        solvedElapsedMs = performance.now() - puzzleStart;
        showWords = true;
      }
      return;
    }
  }

  // ---------- Load words.txt and start ----------
  async function loadWords() {
    try {
      const res = await fetch(WORD_FILE, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const list = text
        .split(/\r?\n/)
        .map(cleanWord)
        .filter((w) => w && /^[a-z]+$/.test(w) && ALLOWED_WORD_LENS.has(w.length));
      words = [...new Set(list)];
    } catch (err) {
   //   words = ["able", "echo", "oval", "lava", "ally", "yarn", "nope", "eager", "ramp", "palm", "mood", "dome", "else", "eels", "sour", "ruse"];
      words = [""art", "tin", "nut"];
      console.warn("Could not load words.txt. Using fallback list.", err);
    }

    newPuzzle();
    resize();
    requestAnimationFrame(draw);
  }

  loadWords();
})();
