// CONFIG
// CSV file should be in the same folder as index.html
const CSV_URL = "freedom-of-expression-index.csv";

// Path to your font file (ttf/otf/woff).
const FONT_URL = "Rules-Regular.woff";

// How strong the distortion can get at the worst freedom score
const MAX_EXTRA_POINTS = 10;

// Maximum blur (in pixels) when score is very low
const MAX_BLUR_PX = 4;

// DOM references
const textInput = document.getElementById("textInput");
const countrySelect = document.getElementById("countrySelect");
const yearSlider = document.getElementById("yearSlider");
const yearValueLabel = document.getElementById("yearValue");
const yearMinLabel = document.getElementById("yearMinLabel");
const yearMaxLabel = document.getElementById("yearMaxLabel");

const fontSizeInput = document.getElementById("fontSizeInput");
const letterSpacingInput = document.getElementById("letterSpacingInput");
const lineHeightInput = document.getElementById("lineHeightInput");
const fontSizeValue = document.getElementById("fontSizeValue");
const letterSpacingValue = document.getElementById("letterSpacingValue");
const lineHeightValue = document.getElementById("lineHeightValue");

const canvas = document.getElementById("textCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const ctx = canvas.getContext("2d");

// Score panel DOM
const panelCountry = document.getElementById("panelCountry");
const panelYear = document.getElementById("panelYear");
const panelScore = document.getElementById("panelScore");

// Data structures
let font = null;
let dataByCountry = new Map(); // country -> [{year, score}]
let currentCountry = null;
let currentYear = null;
let currentScore = null;

// ----------------- INITIALIZATION -----------------

// Load CSV data, then font, then hook up events.
init();

async function init() {
  try {
    const csvText = await fetch(CSV_URL).then((r) => r.text());
    parseCSV(csvText);
    populateCountryDropdown();

    await loadFont();

    // After data + font are ready, set default country & year
    if (countrySelect.options.length > 0) {
      currentCountry = countrySelect.value;
      updateYearSliderForCountry(currentCountry);
    }

    attachEventListeners();
    resizeCanvas();
    window.addEventListener("resize", () => {
      resizeCanvas();
      drawOutput();
    });

    drawOutput();
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

// ----------------- DATA LOADING -----------------

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");

  const entityIdx = header.indexOf("Entity");
  const yearIdx = header.indexOf("Year");
  const scoreIdx = header.indexOf(
    "Freedom of expression and alternative sources of information index (central estimate)"
  );

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const country = cols[entityIdx];
    const year = parseInt(cols[yearIdx], 10);
    const score = parseFloat(cols[scoreIdx]);

    if (!country || isNaN(year) || isNaN(score)) continue;

    if (!dataByCountry.has(country)) {
      dataByCountry.set(country, []);
    }
    dataByCountry.get(country).push({ year, score });
  }

  // Sort each country's data by year ascending
  for (const [country, arr] of dataByCountry.entries()) {
    arr.sort((a, b) => a.year - b.year);
  }
}

function populateCountryDropdown() {
  countrySelect.innerHTML = "";
  const countries = Array.from(dataByCountry.keys()).sort();

  countries.forEach((c) => {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    countrySelect.appendChild(option);
  });

  if (countries.length > 0) {
    countrySelect.value = countries[0];
    currentCountry = countries[0];
  }
}

// Load the font via opentype.js.
function loadFont() {
  return new Promise((resolve, reject) => {
    opentype.load(FONT_URL, (err, loadedFont) => {
      if (err) {
        console.error("Error loading font:", err);
        reject(err);
      } else {
        font = loadedFont;
        resolve();
      }
    });
  });
}

// ----------------- UI EVENT HANDLING -----------------

function attachEventListeners() {
  textInput.addEventListener("input", drawOutput);

  countrySelect.addEventListener("change", () => {
    currentCountry = countrySelect.value;
    updateYearSliderForCountry(currentCountry);
    drawOutput();
  });

  yearSlider.addEventListener("input", () => {
    currentYear = parseInt(yearSlider.value, 10);
    yearValueLabel.textContent = currentYear;
    drawOutput();
  });

  fontSizeInput.addEventListener("input", () => {
    fontSizeValue.textContent = fontSizeInput.value + " px";
    drawOutput();
  });

  letterSpacingInput.addEventListener("input", () => {
    letterSpacingValue.textContent = letterSpacingInput.value;
    drawOutput();
  });

  lineHeightInput.addEventListener("input", () => {
    const factor = (parseInt(lineHeightInput.value, 10) / 100).toFixed(2);
    lineHeightValue.textContent = factor + "×";
    drawOutput();
  });
}

function updateYearSliderForCountry(country) {
  const arr = dataByCountry.get(country);
  if (!arr || arr.length === 0) return;

  const minYear = arr[0].year;
  const maxYear = arr[arr.length - 1].year;

  yearSlider.min = minYear;
  yearSlider.max = maxYear;
  yearSlider.value = maxYear;

  currentYear = maxYear;

  yearMinLabel.textContent = String(minYear);
  yearMaxLabel.textContent = String(maxYear);
  yearValueLabel.textContent = String(currentYear);
}

// ----------------- VISUAL MAPPING LOGIC -----------------

function scoreToDistortion(score) {
  const clamped = Math.max(0, Math.min(1, score));
  return 1 - clamped; // invert: low score = high distortion
}

// Solid color mapping: 0 → red, 1 → green
function scoreToColor(score) {
  const s = Math.max(0, Math.min(1, score));
  const r = lerp(220, 20, s); // high score: lower red
  const g = lerp(40, 210, s); // high score: stronger green
  const b = lerp(40, 120, s); // subtle blue shift
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getCurrentScore(country, year) {
  const arr = dataByCountry.get(country);
  if (!arr || arr.length === 0) return null;

  const exact = arr.find((d) => d.year === year);
  if (exact) return exact.score;

  let best = arr[0];
  for (const d of arr) {
    if (d.year <= year && d.year >= best.year) {
      best = d;
    }
  }
  return best.score;
}

// ----------------- TYPOGRAPHIC DISTORTION -----------------

function distortPath(path, distortionLevel) {
  if (distortionLevel <= 0) return;

  const extraPoints = Math.round(distortionLevel * MAX_EXTRA_POINTS);
  if (extraPoints <= 0) return;

  const newCommands = [];
  let prevX = 0;
  let prevY = 0;

  for (const cmd of path.commands) {
    if (cmd.type === "M") {
      newCommands.push(cmd);
      prevX = cmd.x;
      prevY = cmd.y;
    } else if (cmd.type === "L") {
      const targetX = cmd.x;
      const targetY = cmd.y;

      for (let i = 1; i <= extraPoints; i++) {
        const t = i / (extraPoints + 1);
        const baseX = prevX + (targetX - prevX) * t;
        const baseY = prevY + (targetY - prevY) * t;

        const jitter = distortionLevel * 6;
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;

        newCommands.push({
          type: "L",
          x: baseX + jx,
          y: baseY + jy
        });
      }

      newCommands.push(cmd);
      prevX = targetX;
      prevY = targetY;
    } else if (cmd.type === "Q" || cmd.type === "C") {
      const targetX = cmd.x;
      const targetY = cmd.y;

      for (let i = 1; i <= extraPoints; i++) {
        const t = i / (extraPoints + 1);
        const baseX = prevX + (targetX - prevX) * t;
        const baseY = prevY + (targetY - prevY) * t;

        const jitter = distortionLevel * 10;
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;

        newCommands.push({
          type: "L",
          x: baseX + jx,
          y: baseY + jy
        });
      }

      newCommands.push(cmd);
      prevX = targetX;
      prevY = targetY;
    } else {
      newCommands.push(cmd);
    }
  }

  path.commands = newCommands;
}

// ----------------- TEXT LAYOUT (WRAPPING) -----------------

/**
 * Measure the approximate width of a string in canvas space,
 * using glyph advance widths + letter spacing.
 */
function measureLineWidth(str, font, scale, letterSpacing) {
  let width = 0;
  for (const ch of str) {
    const glyph = font.charToGlyph(ch);
    width += glyph.advanceWidth * scale + letterSpacing;
  }
  return width;
}

/**
 * Layout text into multiple lines so it stays inside the canvas box.
 * We do simple word-based wrapping.
 */
function layoutTextIntoLines(text, maxWidth, font, scale, letterSpacing) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    const testWidth = measureLineWidth(testLine, font, scale, letterSpacing);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// ----------------- DRAWING -----------------

function resizeCanvas() {
  const rect = canvasWrapper.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

/**
 * Main render:
 * - Reads UI state
 * - Computes score → color / distortion / blur
 * - Updates score panel & output background
 * - Draws wrapped & distorted text
 */
function drawOutput() {
  const text = textInput.value.trim() || "font";
  const country = currentCountry || countrySelect.value;
  const year = currentYear || parseInt(yearSlider.value, 10);

  if (!country) return;

  const rawScore = getCurrentScore(country, year);
  const score = rawScore != null ? rawScore : 0.5;
  const clampedScore = Math.max(0, Math.min(1, score));
  const distortionLevel = scoreToDistortion(clampedScore);
  const color = scoreToColor(clampedScore);

  currentScore = clampedScore;

  // ----- Panel + background -----
  panelCountry.textContent = country;
  panelYear.textContent = year;
  panelScore.textContent = clampedScore.toFixed(3);

  const baseColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
  canvasWrapper.style.background = baseColor; // SOLID color instead of gradient

  // Blur: low score → high blur, high score → sharp
  const blurPx = distortionLevel * MAX_BLUR_PX;
  canvas.style.filter = `blur(${blurPx}px)`;

  // If font didn't load, stop after updating color/panel
  if (!font) return;

  // ----- Draw text -----
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const fontSize = parseInt(fontSizeInput.value, 10) || 120;
  const letterSpacing = parseInt(letterSpacingInput.value, 10) || 0;
  const lineHeightFactor = parseInt(lineHeightInput.value, 10) / 100 || 1.2;

  const unitsPerEm = font.unitsPerEm || 1000;
  const scale = fontSize / unitsPerEm;

  // Word wrapping within 80% of canvas width
  const maxLineWidth = canvas.width * 0.8;
  const lines = layoutTextIntoLines(text, maxLineWidth, font, scale, letterSpacing);

  const totalHeight = lines.length * fontSize * lineHeightFactor;
  let y = (canvas.height - totalHeight) / 2 + fontSize;

  ctx.fillStyle = "#000000";
  ctx.save();

  for (const line of lines) {
    const lineWidth = measureLineWidth(line, font, scale, letterSpacing);
    let x = (canvas.width - lineWidth) / 2;

    for (const ch of line) {
      const glyph = font.charToGlyph(ch);
      const glyphPath = glyph.getPath(x, y, fontSize);

      distortPath(glyphPath, distortionLevel);
      glyphPath.draw(ctx);

      x += glyph.advanceWidth * scale + letterSpacing;
    }

    y += fontSize * lineHeightFactor;
  }

  ctx.restore();
}