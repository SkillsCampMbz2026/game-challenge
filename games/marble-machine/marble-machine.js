(function () {
  "use strict";

  const GRID = 40;
  const COLS = 12;
  const ROWS = 10;
  const W = COLS * GRID;
  const H = ROWS * GRID;
  const BALL_R = 12;
  const GRAVITY = 0.55;
  const SUBSTEPS = 4;
  const SUBSTEP_DT = 1 / SUBSTEPS;

  const START_COL = 0;
  const START_ROW = 0;
  const START = { x: START_COL * GRID + GRID / 2, y: START_ROW * GRID + GRID / 2 };

  const BASKET = { leftCol: 5, rightCol: 6, topRow: 7 };
  const basket = {
    leftX: BASKET.leftCol * GRID,
    rightX: (BASKET.rightCol + 1) * GRID,
    topY: BASKET.topRow * GRID,
    floorY: ROWS * GRID,
  };
  const basketSegments = [
    { x1: basket.leftX, y1: basket.topY, x2: basket.leftX, y2: basket.floorY, restitution: 0.15, friction: 0.85, kind: "basket" },
    { x1: basket.rightX, y1: basket.topY, x2: basket.rightX, y2: basket.floorY, restitution: 0.15, friction: 0.85, kind: "basket" },
    { x1: basket.leftX, y1: basket.floorY, x2: basket.rightX, y2: basket.floorY, restitution: 0.15, friction: 0.85, kind: "basket" },
  ];

  const INITIAL_INVENTORY = { "ramp-right": 4, "ramp-left": 4, platform: 3, spring: 2 };
  const PART_LABELS = { "ramp-right": "ramp", "ramp-left": "ramp", platform: "platform", spring: "spring" };

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const tray = document.getElementById("tray");
  const partsPlacedEl = document.getElementById("parts-placed");
  const runBtn = document.getElementById("run-btn");
  const resetBtn = document.getElementById("reset-btn");
  const statusLine = document.getElementById("status-line");
  const victoryOverlay = document.getElementById("victory-overlay");
  const victoryMessage = document.getElementById("victory-message");
  const victoryAgainBtn = document.getElementById("victory-again-btn");
  const chipEls = Array.from(tray.querySelectorAll(".part-chip"));

  let inventory = { ...INITIAL_INVENTORY };
  let placedParts = new Map(); // key "col,row" -> part
  let armedType = null;
  let cursor = { col: -1, row: -1 };
  let ball = { x: START.x, y: START.y, vx: 0, vy: 0 };
  let isRunning = false;
  let frameCount = 0;
  let settleCount = 0;

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function isBasketCell(col, row) {
    return col >= BASKET.leftCol && col <= BASKET.rightCol && row >= BASKET.topRow && row < ROWS;
  }

  function isStartCell(col, row) {
    return col === START_COL && row === START_ROW;
  }

  function inBounds(col, row) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
  }

  function buildSegment(type, col, row) {
    const x0 = col * GRID;
    const y0 = row * GRID;
    const x1 = x0 + GRID;
    const y1 = y0 + GRID;
    const midY = y0 + GRID / 2;
    switch (type) {
      case "ramp-right":
        return { x1: x0, y1: y0, x2: x1, y2: y1, restitution: 0.55, friction: 0.97, kind: "ramp" };
      case "ramp-left":
        return { x1: x0, y1: y1, x2: x1, y2: y0, restitution: 0.55, friction: 0.97, kind: "ramp" };
      case "platform":
        return { x1: x0, y1: midY, x2: x1, y2: midY, restitution: 0.2, friction: 0.9, kind: "platform" };
      case "spring":
        return { x1: x0, y1: midY, x2: x1, y2: midY, restitution: 0.3, friction: 0.95, kind: "spring" };
      default:
        throw new Error("Unknown part type: " + type);
    }
  }

  function updateChipCounts() {
    for (const type of Object.keys(inventory)) {
      const el = document.getElementById("count-" + type);
      if (el) el.textContent = String(inventory[type]);
      const chip = chipEls.find((c) => c.dataset.part === type);
      if (chip) chip.disabled = inventory[type] <= 0 && armedType !== type;
    }
  }

  function updatePartsPlacedStat() {
    partsPlacedEl.textContent = String(placedParts.size);
  }

  function setArmed(type) {
    armedType = armedType === type ? null : type;
    chipEls.forEach((chip) => chip.classList.toggle("armed", chip.dataset.part === armedType));
    if (armedType) {
      setStatus(`${PART_LABELS[armedType][0].toUpperCase()}${PART_LABELS[armedType].slice(1)} armed. Click or press Enter on an empty cell to place it.`);
    }
  }

  function tryPlace(type, col, row) {
    if (isRunning) return false;
    if (!inBounds(col, row)) return false;
    if (isBasketCell(col, row)) {
      setStatus("That's the basket — you can't build there.");
      return false;
    }
    if (isStartCell(col, row)) {
      setStatus("That's the start point — you can't build there.");
      return false;
    }
    const key = col + "," + row;
    if (placedParts.has(key)) {
      setStatus("That cell is already occupied. Click it to remove the part first.");
      return false;
    }
    if (inventory[type] <= 0) {
      setStatus("You're out of that part. Remove one from the board to reuse it.");
      return false;
    }
    inventory[type]--;
    placedParts.set(key, { type, col, row, segment: buildSegment(type, col, row), springArmed: true });
    if (inventory[type] === 0 && armedType === type) {
      armedType = null;
      chipEls.forEach((chip) => chip.classList.remove("armed"));
    }
    updateChipCounts();
    updatePartsPlacedStat();
    setStatus(`Placed a ${PART_LABELS[type]}.`);
    render();
    return true;
  }

  function tryRemove(col, row) {
    if (isRunning) return false;
    const key = col + "," + row;
    const part = placedParts.get(key);
    if (!part) return false;
    inventory[part.type]++;
    placedParts.delete(key);
    updateChipCounts();
    updatePartsPlacedStat();
    setStatus(`Removed a ${PART_LABELS[part.type]}.`);
    render();
    return true;
  }

  function handleCellActivate(col, row) {
    if (isRunning) return;
    const key = col + "," + row;
    if (placedParts.has(key)) {
      tryRemove(col, row);
    } else if (armedType) {
      tryPlace(armedType, col, row);
    } else {
      setStatus("Select a part from the tray first, or drag one onto the board.");
    }
  }

  function clientToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const logicalX = (clientX - rect.left) * scaleX;
    const logicalY = (clientY - rect.top) * scaleY;
    return { col: Math.floor(logicalX / GRID), row: Math.floor(logicalY / GRID) };
  }

  canvas.addEventListener("click", (e) => {
    const { col, row } = clientToGrid(e.clientX, e.clientY);
    handleCellActivate(col, row);
  });

  canvas.addEventListener("keydown", (e) => {
    if (isRunning) return;
    if (cursor.col === -1) {
      cursor.col = 0;
      cursor.row = 0;
    }
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        cursor.row = Math.max(0, cursor.row - 1);
        render();
        break;
      case "ArrowDown":
        e.preventDefault();
        cursor.row = Math.min(ROWS - 1, cursor.row + 1);
        render();
        break;
      case "ArrowLeft":
        e.preventDefault();
        cursor.col = Math.max(0, cursor.col - 1);
        render();
        break;
      case "ArrowRight":
        e.preventDefault();
        cursor.col = Math.min(COLS - 1, cursor.col + 1);
        render();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        handleCellActivate(cursor.col, cursor.row);
        break;
      case "Escape":
        armedType = null;
        chipEls.forEach((chip) => chip.classList.remove("armed"));
        setStatus("Nothing armed.");
        break;
      default:
        break;
    }
  });

  canvas.addEventListener("focus", () => {
    if (cursor.col === -1) {
      cursor.col = 0;
      cursor.row = 0;
    }
    render();
  });
  canvas.addEventListener("blur", render);

  // --- Tray: click-to-arm, or drag-to-place ---
  let suppressNextClick = false;
  let chipDrag = null;
  const DRAG_THRESHOLD = 6;

  chipEls.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      const type = chip.dataset.part;
      if (inventory[type] <= 0 && armedType !== type) {
        setStatus("You're out of that part.");
        return;
      }
      setArmed(type);
    });

    chip.addEventListener("pointerdown", (e) => {
      if (isRunning) return;
      const type = chip.dataset.part;
      if (inventory[type] <= 0) return;
      chipDrag = { type, startX: e.clientX, startY: e.clientY, dragging: false, ghost: null };
      window.addEventListener("pointermove", onChipPointerMove);
      window.addEventListener("pointerup", onChipPointerUp, { once: true });
    });
  });

  function onChipPointerMove(e) {
    if (!chipDrag) return;
    const dx = e.clientX - chipDrag.startX;
    const dy = e.clientY - chipDrag.startY;
    if (!chipDrag.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      chipDrag.dragging = true;
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost " + chipDrag.type + "-icon";
      document.body.appendChild(ghost);
      chipDrag.ghost = ghost;
    }
    if (chipDrag.ghost) {
      chipDrag.ghost.style.left = e.clientX - 23 + "px";
      chipDrag.ghost.style.top = e.clientY - 10 + "px";
    }
  }

  function onChipPointerUp(e) {
    window.removeEventListener("pointermove", onChipPointerMove);
    if (!chipDrag) return;
    const drag = chipDrag;
    chipDrag = null;
    if (!drag.dragging) return;
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
    if (drag.ghost) drag.ghost.remove();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el === canvas) {
      const { col, row } = clientToGrid(e.clientX, e.clientY);
      tryPlace(drag.type, col, row);
    }
  }

  // --- Physics ---
  function pointSegDistance(px, py, seg) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - seg.x1) * dx + (py - seg.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = seg.x1 + t * dx;
    const cy = seg.y1 + t * dy;
    const ddx = px - cx;
    const ddy = py - cy;
    return { dist: Math.hypot(ddx, ddy), nx: ddx, ny: ddy };
  }

  function resolveCollision(seg, part) {
    const { dist, nx: rawNx, ny: rawNy } = pointSegDistance(ball.x, ball.y, seg);
    if (dist >= BALL_R || dist <= 0.0001) return;
    const nx = rawNx / dist;
    const ny = rawNy / dist;
    const overlap = BALL_R - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      const restitution = seg.restitution;
      const friction = seg.friction;
      const vnAfter = -vn * restitution;
      const tx = -ny;
      const ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      const vtAfter = vt * friction;
      ball.vx = nx * vnAfter + tx * vtAfter;
      ball.vy = ny * vnAfter + ty * vtAfter;
      if (seg.kind === "spring" && part && part.springArmed) {
        ball.vx += nx * 13;
        ball.vy += ny * 13;
        part.springArmed = false;
      }
    }
  }

  function allSegments() {
    const segs = basketSegments.map((s) => ({ seg: s, part: null }));
    for (const part of placedParts.values()) segs.push({ seg: part.segment, part });
    return segs;
  }

  function checkVictoryAndMiss() {
    const speed = Math.hypot(ball.vx, ball.vy);
    const inBasketX = ball.x > basket.leftX + BALL_R - 2 && ball.x < basket.rightX - BALL_R + 2;
    const nearFloor = ball.y + BALL_R >= basket.floorY - 3;
    if (inBasketX && nearFloor && speed < 0.7) {
      settleCount++;
    } else {
      settleCount = 0;
    }
    if (settleCount > 12) {
      triggerVictory();
      return true;
    }
    if (ball.y - BALL_R > H + 80) {
      triggerMiss();
      return true;
    }
    if (frameCount > 900) {
      triggerTimeout();
      return true;
    }
    return false;
  }

  function triggerVictory() {
    isRunning = false;
    runBtn.disabled = false;
    const count = placedParts.size;
    victoryMessage.textContent = `The ball landed in the basket using ${count} part${count === 1 ? "" : "s"}!`;
    victoryOverlay.hidden = false;
    setStatus("Victory! The ball is in the basket. 🎉");
  }

  function triggerMiss() {
    isRunning = false;
    runBtn.disabled = false;
    setStatus("The ball missed the basket. Adjust your contraption and press Run again, or Reset to start over.");
  }

  function triggerTimeout() {
    isRunning = false;
    runBtn.disabled = false;
    setStatus("The ball won't settle — try adjusting your contraption and run again.");
  }

  function stepSimulation() {
    if (!isRunning) return;
    for (let s = 0; s < SUBSTEPS; s++) {
      ball.vy += GRAVITY * SUBSTEP_DT;
      ball.x += ball.vx * SUBSTEP_DT;
      ball.y += ball.vy * SUBSTEP_DT;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = -ball.vx * 0.5;
      }
      if (ball.x + BALL_R > W) {
        ball.x = W - BALL_R;
        ball.vx = -ball.vx * 0.5;
      }
      if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.3;
      }

      for (const { seg, part } of allSegments()) resolveCollision(seg, part);

      for (const part of placedParts.values()) {
        if (part.type === "spring" && !part.springArmed) {
          const { dist } = pointSegDistance(ball.x, ball.y, part.segment);
          if (dist > BALL_R + 3) part.springArmed = true;
        }
      }
    }
    frameCount++;
    const done = checkVictoryAndMiss();
    render();
    if (isRunning && !done) requestAnimationFrame(stepSimulation);
  }

  runBtn.addEventListener("click", () => {
    if (isRunning) return;
    ball.x = START.x;
    ball.y = START.y;
    ball.vx = 0;
    ball.vy = 0;
    isRunning = true;
    frameCount = 0;
    settleCount = 0;
    victoryOverlay.hidden = true;
    for (const part of placedParts.values()) {
      if (part.type === "spring") part.springArmed = true;
    }
    runBtn.disabled = true;
    setStatus("Running! Watch the ball go...");
    requestAnimationFrame(stepSimulation);
  });

  function resetGame() {
    isRunning = false;
    inventory = { ...INITIAL_INVENTORY };
    placedParts = new Map();
    armedType = null;
    chipEls.forEach((chip) => chip.classList.remove("armed"));
    ball = { x: START.x, y: START.y, vx: 0, vy: 0 };
    frameCount = 0;
    settleCount = 0;
    runBtn.disabled = false;
    victoryOverlay.hidden = true;
    updateChipCounts();
    updatePartsPlacedStat();
    setStatus("Drag parts onto the board to build your contraption.");
    render();
  }

  resetBtn.addEventListener("click", resetGame);
  victoryAgainBtn.addEventListener("click", () => {
    victoryOverlay.hidden = true;
    resetGame();
  });

  // --- Rendering ---
  function drawSegment(seg, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * GRID, 0);
      ctx.lineTo(c * GRID, H);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * GRID);
      ctx.lineTo(W, r * GRID);
      ctx.stroke();
    }

    // start marker
    ctx.strokeStyle = "#818cf8";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(START.x, START.y, BALL_R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("START", START.x + BALL_R + 6, START.y + 3);
    ctx.textAlign = "center";

    // basket
    for (const seg of basketSegments) drawSegment(seg, "#34d399", 6);
    ctx.fillStyle = "rgba(52, 211, 153, 0.15)";
    ctx.fillRect(basket.leftX, basket.topY, basket.rightX - basket.leftX, basket.floorY - basket.topY);
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "10px sans-serif";
    ctx.fillText("TARGET", (basket.leftX + basket.rightX) / 2, basket.topY - 6);

    // placed parts
    for (const part of placedParts.values()) {
      if (part.type === "ramp-right" || part.type === "ramp-left") {
        drawSegment(part.segment, "#fb923c", 8);
      } else if (part.type === "platform") {
        drawSegment(part.segment, "#60a5fa", 8);
      } else if (part.type === "spring") {
        drawSegment(part.segment, "#f472b6", 8);
        ctx.strokeStyle = "#fce7f3";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const seg = part.segment;
        const steps = 6;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = seg.x1 + (seg.x2 - seg.x1) * t;
          const y = seg.y1 + (i % 2 === 0 ? -4 : 4);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // keyboard cursor
    if (!isRunning && document.activeElement === canvas && cursor.col >= 0) {
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(cursor.col * GRID + 2, cursor.row * GRID + 2, GRID - 4, GRID - 4);
      ctx.setLineDash([]);
    }

    // ball
    const grad = ctx.createRadialGradient(ball.x - 4, ball.y - 4, 2, ball.x, ball.y, BALL_R);
    grad.addColorStop(0, "#fff7ed");
    grad.addColorStop(1, "#f59e0b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  updateChipCounts();
  updatePartsPlacedStat();
  render();
})();
