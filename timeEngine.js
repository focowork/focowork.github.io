let startTime = null;
let elapsed = 0;
let running = false;

export function start() {
  if (running) return;
  running = true;
  startTime = Date.now();
}

export function stop() {
  if (!running) return elapsed;
  elapsed += Date.now() - startTime;
  running = false;
  return elapsed;
}

export function reset() {
  startTime = null;
  elapsed = 0;
  running = false;
}

export function getElapsed() {
  if (!running) return elapsed;
  return elapsed + (Date.now() - startTime);
}

export function format(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
