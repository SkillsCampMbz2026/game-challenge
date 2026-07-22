(function () {
  "use strict";

  const SIZE = 5;
  const SHUFFLE_MOVES = 20;

  const boardEl = document.getElementById("lights-board");
  const moveCountEl = document.getElementById("move-count");
  const restartBtn = document.getElementById("restart-btn");
  const statusLine = document.getElementById("status-line");
  const victoryOverlay = document.getElementById("victory-overlay");
  const victoryMessage = document.getElementById("victory-message");
  const victoryAgainBtn = document.getElementById("victory-again-btn");

  let grid = [];
  let moveCount = 0;
  let won = false;
  let cellButtons = [];

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function toggleCell(r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
    grid[r][c] = !grid[r][c];
  }

  function applyClickAt(r, c) {
    toggleCell(r, c);
    toggleCell(r - 1, c);
    toggleCell(r + 1, c);
    toggleCell(r, c - 1);
    toggleCell(r, c + 1);
  }

  function isSolved() {
    return grid.every((row) => row.every((cell) => !cell));
  }

  function generateSolvableBoard() {
    let board;
    let solved;
    do {
      board = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
      grid = board;
      for (let i = 0; i < SHUFFLE_MOVES; i++) {
        const r = Math.floor(Math.random() * SIZE);
        const c = Math.floor(Math.random() * SIZE);
        applyClickAt(r, c);
      }
      solved = isSolved();
    } while (solved);
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    cellButtons = [];
    for (let r = 0; r < SIZE; r++) {
      const rowButtons = [];
      for (let c = 0; c < SIZE; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "light-cell";
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-label", `Light row ${r + 1}, column ${c + 1}`);
        btn.addEventListener("click", () => onCellClick(r, c));
        boardEl.appendChild(btn);
        rowButtons.push(btn);
      }
      cellButtons.push(rowButtons);
    }
  }

  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const btn = cellButtons[r][c];
        const on = grid[r][c];
        btn.classList.toggle("on", on);
        btn.classList.toggle("off", !on);
        btn.setAttribute("aria-pressed", String(on));
      }
    }
  }

  function onCellClick(r, c) {
    if (won) return;
    applyClickAt(r, c);
    moveCount++;
    moveCountEl.textContent = String(moveCount);
    setStatus(`Toggled row ${r + 1}, column ${c + 1} and its neighbors.`);
    render();
    checkVictory();
  }

  function checkVictory() {
    if (isSolved()) {
      won = true;
      victoryMessage.textContent = `All lights out in ${moveCount} move${moveCount === 1 ? "" : "s"}!`;
      victoryOverlay.hidden = false;
      setStatus("Puzzle solved! 🎉");
    }
  }

  function initGame() {
    generateSolvableBoard();
    moveCount = 0;
    won = false;
    victoryOverlay.hidden = true;
    moveCountEl.textContent = "0";
    setStatus("Click a light to start toggling.");
    render();
  }

  restartBtn.addEventListener("click", () => {
    initGame();
  });

  victoryAgainBtn.addEventListener("click", () => {
    victoryOverlay.hidden = true;
    initGame();
  });

  buildBoard();
  initGame();
})();
