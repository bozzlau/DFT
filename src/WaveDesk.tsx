import {
  Activity,
  BarChart3,
  Check,
  Eye,
  EyeOff,
  FunctionSquare,
  Grid3X3,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Waves,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type WaveKind = "sin" | "cos";
type SampleCount = 512 | 1024 | 2048;
type CycleCount = 1 | 2 | 4;
type InputMode = "components" | "formula";

type WaveComponent = {
  id: string;
  kind: WaveKind;
  amplitude: number;
  frequency: number;
  phase: number;
  color: string;
  enabled: boolean;
};

type WavePoint = {
  x: number;
  y: number;
};

type WaveSeries = {
  id: string;
  color: string;
  points: WavePoint[];
};

type WaveData = {
  points: WavePoint[];
  overlays: WaveSeries[];
  min: number;
  max: number;
  peakToPeak: number;
  displayMin: number;
  displayMax: number;
};

type Token =
  | { type: "number"; value: number }
  | { type: "variable" }
  | { type: "function"; value: WaveKind }
  | { type: "operator"; value: Operator }
  | { type: "leftParen" }
  | { type: "rightParen" };

type RpnToken =
  | { type: "number"; value: number }
  | { type: "variable" }
  | { type: "function"; value: WaveKind }
  | { type: "operator"; value: Operator };

type Operator = "+" | "-" | "*" | "/" | "^" | "neg";

const COMPONENT_COLORS = ["#00d1b2", "#ffd166", "#f25f5c", "#58a6ff", "#c084fc", "#7dd3fc"];
const DEFAULT_FORMULA = "f(x) = 3sin(x) + 2sin(5x) + 0.5sin(10x)";
const DEFAULT_COMPONENTS: WaveComponent[] = [
  { id: "wave-1", kind: "sin", amplitude: 3, frequency: 1, phase: 0, color: COMPONENT_COLORS[0], enabled: true },
  { id: "wave-2", kind: "sin", amplitude: 2, frequency: 5, phase: 0, color: COMPONENT_COLORS[1], enabled: true },
  { id: "wave-3", kind: "sin", amplitude: 0.5, frequency: 10, phase: 0, color: COMPONENT_COLORS[2], enabled: true },
];

const isOperator = (value: string): value is Exclude<Operator, "neg"> => ["+", "-", "*", "/", "^"].includes(value);

const operatorInfo: Record<Operator, { precedence: number; associativity: "left" | "right"; arity: 1 | 2 }> = {
  "+": { precedence: 1, associativity: "left", arity: 2 },
  "-": { precedence: 1, associativity: "left", arity: 2 },
  "*": { precedence: 2, associativity: "left", arity: 2 },
  "/": { precedence: 2, associativity: "left", arity: 2 },
  neg: { precedence: 3, associativity: "right", arity: 1 },
  "^": { precedence: 4, associativity: "right", arity: 2 },
};

function normalizeFormula(input: string) {
  const withoutPrefix = input.replace(/^\s*f\s*\(\s*x\s*\)\s*=\s*/i, "");
  return withoutPrefix.replace(/\s+/g, "").toLowerCase();
}

function shouldInsertMultiply(previous: Token | null, next: Token) {
  if (!previous) return false;
  const previousIsValue = previous.type === "number" || previous.type === "variable" || previous.type === "rightParen";
  const nextStartsValue = next.type === "number" || next.type === "variable" || next.type === "function" || next.type === "leftParen";
  return previousIsValue && nextStartsValue;
}

function tokenize(expression: string): Token[] {
  const source = normalizeFormula(expression);
  if (!source) throw new Error("请输入一个公式。");
  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token) => {
    const previous = tokens[tokens.length - 1] ?? null;
    if (shouldInsertMultiply(previous, token)) tokens.push({ type: "operator", value: "*" });
    tokens.push(token);
  };

  while (index < source.length) {
    const char = source[index];
    if (/\d|\./.test(char)) {
      const match = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (!match) throw new Error(`无法识别数字：${char}`);
      push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (source.startsWith("sin", index) || source.startsWith("cos", index)) {
      push({ type: "function", value: source.slice(index, index + 3) as WaveKind });
      index += 3;
      continue;
    }
    if (source.startsWith("pi", index)) {
      push({ type: "number", value: Math.PI });
      index += 2;
      continue;
    }
    if (char === "x") {
      push({ type: "variable" });
      index += 1;
      continue;
    }
    if (char === "(") {
      push({ type: "leftParen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rightParen" });
      index += 1;
      continue;
    }
    if (isOperator(char)) {
      const previous = tokens[tokens.length - 1];
      const unary = char === "-" && (!previous || previous.type === "operator" || previous.type === "leftParen");
      tokens.push({ type: "operator", value: unary ? "neg" : char });
      index += 1;
      continue;
    }
    throw new Error(`公式里有暂不支持的字符：${char}`);
  }

  return tokens;
}

function toRpn(tokens: Token[]): RpnToken[] {
  const output: RpnToken[] = [];
  const stack: Token[] = [];

  tokens.forEach((token) => {
    if (token.type === "number" || token.type === "variable") {
      output.push(token);
      return;
    }
    if (token.type === "function") {
      stack.push(token);
      return;
    }
    if (token.type === "operator") {
      const incoming = operatorInfo[token.value];
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === "function") {
          output.push(stack.pop() as RpnToken);
          continue;
        }
        if (top.type !== "operator") break;
        const stacked = operatorInfo[top.value];
        const shouldPop =
          (incoming.associativity === "left" && incoming.precedence <= stacked.precedence) ||
          (incoming.associativity === "right" && incoming.precedence < stacked.precedence);
        if (!shouldPop) break;
        output.push(stack.pop() as RpnToken);
      }
      stack.push(token);
      return;
    }
    if (token.type === "leftParen") {
      stack.push(token);
      return;
    }
    if (token.type === "rightParen") {
      while (stack.length > 0 && stack[stack.length - 1].type !== "leftParen") {
        output.push(stack.pop() as RpnToken);
      }
      if (stack.length === 0) throw new Error("括号不匹配。");
      stack.pop();
      if (stack[stack.length - 1]?.type === "function") output.push(stack.pop() as RpnToken);
    }
  });

  while (stack.length > 0) {
    const token = stack.pop();
    if (!token || token.type === "leftParen" || token.type === "rightParen") throw new Error("括号不匹配。");
    output.push(token as RpnToken);
  }

  return output;
}

function compileFormula(expression: string) {
  const rpn = toRpn(tokenize(expression));
  return (x: number) => {
    const stack: number[] = [];
    rpn.forEach((token) => {
      if (token.type === "number") {
        stack.push(token.value);
        return;
      }
      if (token.type === "variable") {
        stack.push(x);
        return;
      }
      if (token.type === "function") {
        const value = stack.pop();
        if (value === undefined) throw new Error(`${token.value} 缺少参数。`);
        stack.push(token.value === "sin" ? Math.sin(value) : Math.cos(value));
        return;
      }
      const info = operatorInfo[token.value];
      if (info.arity === 1) {
        const value = stack.pop();
        if (value === undefined) throw new Error("公式结构不完整。");
        stack.push(-value);
        return;
      }
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error("公式结构不完整。");
      if (token.value === "+") stack.push(left + right);
      if (token.value === "-") stack.push(left - right);
      if (token.value === "*") stack.push(left * right);
      if (token.value === "/") stack.push(left / right);
      if (token.value === "^") stack.push(left ** right);
    });
    if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error("公式计算结果无效。");
    return stack[0];
  };
}

function evaluatePhase(raw: string) {
  return compileFormula(raw || "0")(0);
}

function splitTopLevelTerms(source: string) {
  const terms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if ((char === "+" || char === "-") && depth === 0 && index > start) {
      terms.push(source.slice(start, index));
      start = index;
    }
  }
  terms.push(source.slice(start));
  return terms.filter(Boolean);
}

function parseSimpleComponents(input: string): WaveComponent[] | null {
  const source = normalizeFormula(input);
  const terms = splitTopLevelTerms(source);
  if (!terms || terms.join("") !== source) return null;

  const parsed: WaveComponent[] = [];
  for (const term of terms) {
    const match = term.match(/^([+-]?)(?:(\d*\.?\d+)\*?)?(sin|cos)\((?:(\d*\.?\d+)\*?)?x(?:(\+|-)([^)]+))?\)$/);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const amplitude = sign * Number(match[2] ?? 1);
    const kind = match[3] as WaveKind;
    const frequency = Number(match[4] ?? 1);
    const phase = match[6] ? evaluatePhase(`${match[5]}${match[6]}`) : 0;
    parsed.push({
      id: `wave-${Date.now()}-${parsed.length}`,
      kind,
      amplitude,
      frequency,
      phase,
      color: COMPONENT_COLORS[parsed.length % COMPONENT_COLORS.length],
      enabled: true,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

function formatNumber(value: number) {
  if (Math.abs(value) < 0.0001) return "0";
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/\.?0+$/, "");
}

function componentToFormula(component: WaveComponent, withSign: boolean) {
  const sign = component.amplitude < 0 ? "-" : withSign ? "+ " : "";
  const amplitude = Math.abs(component.amplitude);
  const ampText = amplitude === 1 ? "" : `${formatNumber(amplitude)}`;
  const freqText = component.frequency === 1 ? "x" : `${formatNumber(component.frequency)}x`;
  const phaseText = component.phase === 0 ? "" : component.phase > 0 ? ` + ${formatNumber(component.phase)}` : ` - ${formatNumber(Math.abs(component.phase))}`;
  return `${sign}${sign && sign !== "-" ? "" : ""}${ampText}${component.kind}(${freqText}${phaseText})`;
}

function componentsToFormula(components: WaveComponent[]) {
  const enabled = components.filter((component) => component.enabled);
  if (enabled.length === 0) return "f(x) = 0";
  return `f(x) = ${enabled
    .map((component, index) => componentToFormula(component, index > 0))
    .join(" ")
    .replace(/\+ -/g, "- ")}`;
}

function componentValue(component: WaveComponent, x: number) {
  return component.amplitude * (component.kind === "sin" ? Math.sin(component.frequency * x + component.phase) : Math.cos(component.frequency * x + component.phase));
}

function sampleComponents(components: WaveComponent[], cycles: CycleCount, sampleCount: SampleCount, showParts: boolean): WaveData {
  const xMax = cycles * Math.PI * 2;
  const enabled = components.filter((component) => component.enabled);
  const points: WavePoint[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < sampleCount; index += 1) {
    const x = (index / (sampleCount - 1)) * xMax;
    const y = enabled.reduce((total, component) => total + componentValue(component, x), 0);
    points.push({ x, y });
    min = Math.min(min, y);
    max = Math.max(max, y);
  }

  const overlays = showParts
    ? enabled.map((component) => ({
          id: component.id,
          color: component.color,
          points: points.map(({ x }) => ({ x, y: componentValue(component, x) })),
        }))
    : [];

  const amplitudeBound = enabled.reduce((total, component) => total + Math.abs(component.amplitude), 0);
  const stableBound = amplitudeBound > 0 ? amplitudeBound : 1;

  return {
    points,
    overlays,
    min,
    max,
    peakToPeak: max - min,
    displayMin: -stableBound,
    displayMax: stableBound,
  };
}

function sampleFormula(formula: (x: number) => number, cycles: CycleCount, sampleCount: SampleCount): WaveData {
  const xMax = cycles * Math.PI * 2;
  const points: WavePoint[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < sampleCount; index += 1) {
    const x = (index / (sampleCount - 1)) * xMax;
    const y = formula(x);
    points.push({ x, y });
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  const autoPadding = Math.max(0.5, (max - min) * 0.12);
  return {
    points,
    overlays: [],
    min,
    max,
    peakToPeak: max - min,
    displayMin: min - autoPadding,
    displayMax: max + autoPadding,
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#0d131a";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(237, 244, 239, 0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += height / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(237, 244, 239, 0.22)";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawSeries(ctx: CanvasRenderingContext2D, points: WavePoint[], color: string, width: number, height: number, min: number, max: number, lineWidth: number, alpha = 1) {
  const span = Math.max(0.001, max - min);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const px = (index / (points.length - 1)) * width;
    const py = height - ((point.y - min) / span) * height;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function drawWaveCanvas(canvas: HTMLCanvasElement, data: WaveData | null) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  drawGrid(ctx, rect.width, rect.height);
  if (!data) return;
  const min = data.displayMin;
  const max = data.displayMax;
  data.overlays.forEach((series) => drawSeries(ctx, series.points, series.color, rect.width, rect.height, min, max, 1.4, 0.42));
  drawSeries(ctx, data.points, "#edf4ef", rect.width, rect.height, min, max, 3.2, 1);
  ctx.fillStyle = "rgba(237,244,239,.58)";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`max ${formatNumber(data.max)}`, 16, 24);
  ctx.fillText(`min ${formatNumber(data.min)}`, 16, rect.height - 16);
}

function drawSpectrumCanvas(canvas: HTMLCanvasElement, components: WaveComponent[]) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  drawGrid(ctx, rect.width, rect.height);
  const enabled = components.filter((component) => component.enabled);
  const maxAmp = Math.max(1, ...enabled.map((component) => Math.abs(component.amplitude)));
  const maxFreq = Math.max(12, ...enabled.map((component) => component.frequency));
  enabled.forEach((component) => {
    const x = (component.frequency / maxFreq) * (rect.width - 64) + 32;
    const h = (Math.abs(component.amplitude) / maxAmp) * (rect.height - 52);
    const barWidth = Math.max(16, Math.min(42, rect.width / Math.max(10, enabled.length * 2)));
    ctx.fillStyle = component.color;
    ctx.fillRect(x - barWidth / 2, rect.height - 30 - h, barWidth, h);
    ctx.fillStyle = "rgba(237,244,239,.72)";
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`${formatNumber(component.frequency)}x`, x - 13, rect.height - 10);
  });
}

export function WaveDesk() {
  const [formulaInput, setFormulaInput] = useState(DEFAULT_FORMULA);
  const [activeFormula, setActiveFormula] = useState(DEFAULT_FORMULA);
  const [components, setComponents] = useState<WaveComponent[]>(DEFAULT_COMPONENTS);
  const [inputMode, setInputMode] = useState<InputMode>("components");
  const [cycles, setCycles] = useState<CycleCount>(1);
  const [sampleCount, setSampleCount] = useState<SampleCount>(1024);
  const [showParts, setShowParts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastValidDataRef = useRef<WaveData | null>(null);

  const compiledFormula = useMemo((): { formula: ((x: number) => number) | null; error: string | null } => {
    try {
      return { formula: compileFormula(formulaInput), error: null };
    } catch (caught) {
      return { formula: null, error: caught instanceof Error ? caught.message : "公式解析失败。" };
    }
  }, [formulaInput]);

  const waveResult = useMemo((): { data: WaveData | null; error: string | null } => {
    if (inputMode === "components") {
      const data = sampleComponents(components, cycles, sampleCount, showParts);
      lastValidDataRef.current = data;
      return { data, error: null };
    }
    if (!compiledFormula.formula) return { data: lastValidDataRef.current, error: compiledFormula.error };
    try {
      const data = sampleFormula(compiledFormula.formula, cycles, sampleCount);
      lastValidDataRef.current = data;
      return { data, error: null };
    } catch (caught) {
      return { data: lastValidDataRef.current, error: caught instanceof Error ? caught.message : "公式计算失败。" };
    }
  }, [inputMode, components, cycles, sampleCount, showParts, compiledFormula]);

  const waveData = waveResult.data;
  const displayError = error ?? waveResult.error;

  useEffect(() => {
    if (compiledFormula.formula) setActiveFormula(formulaInput);
  }, [compiledFormula, formulaInput]);

  useEffect(() => {
    const draw = () => {
      if (waveCanvasRef.current) drawWaveCanvas(waveCanvasRef.current, waveData);
      if (spectrumCanvasRef.current) drawSpectrumCanvas(spectrumCanvasRef.current, components);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [waveData, components]);

  const updateComponent = (id: string, patch: Partial<WaveComponent>) => {
    setComponents((current) => {
      const next = current.map((component) => (component.id === id ? { ...component, ...patch } : component));
      setFormulaInput(componentsToFormula(next));
      setInputMode("components");
      setError(null);
      return next;
    });
  };

  const addComponent = () => {
    setComponents((current) => {
      const next: WaveComponent[] = [
        ...current,
        {
          id: `wave-${Date.now()}`,
          kind: "sin",
          amplitude: 1,
          frequency: Math.max(1, ...current.map((component) => component.frequency)) + 1,
          phase: 0,
          color: COMPONENT_COLORS[current.length % COMPONENT_COLORS.length],
          enabled: true,
        },
      ];
      setFormulaInput(componentsToFormula(next));
      setInputMode("components");
      setError(null);
      return next;
    });
  };

  const deleteComponent = (id: string) => {
    setComponents((current) => {
      const next = current.filter((component) => component.id !== id);
      setFormulaInput(componentsToFormula(next));
      setInputMode("components");
      setError(null);
      return next;
    });
  };

  const resetExample = () => {
    setComponents(DEFAULT_COMPONENTS);
    setFormulaInput(DEFAULT_FORMULA);
    setInputMode("components");
    setError(null);
  };

  const applyFormulaToComponents = () => {
    try {
      const parsed = parseSimpleComponents(formulaInput);
      compileFormula(formulaInput);
      if (parsed) {
        setComponents(parsed);
        setInputMode("components");
        setError(null);
      } else {
        setInputMode("formula");
        setError("复杂公式模式：当前只绘制公式总波形，分量滑块不会参与计算。");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "公式解析失败。");
    }
  };

  const readouts = [
    { label: "最大值", value: waveData ? formatNumber(waveData.max) : "--" },
    { label: "最小值", value: waveData ? formatNumber(waveData.min) : "--" },
    { label: "峰峰值", value: waveData ? formatNumber(waveData.peakToPeak) : "--" },
    { label: "启用分量", value: `${components.filter((component) => component.enabled).length}` },
  ];

  return (
    <main className="app-shell">
      <section className="top-strip">
        <div>
          <p className="eyebrow">Wave Synthesis Desk</p>
          <h1>公式波形盘</h1>
        </div>
        <div className="formula-card">
          <label htmlFor="formula-input">
            <FunctionSquare size={18} />
            输入 f(x)
          </label>
          <div className="formula-row">
            <input
              id="formula-input"
              value={formulaInput}
              onChange={(event) => {
                setFormulaInput(event.target.value);
                setError(null);
              }}
              spellCheck={false}
              placeholder="f(x) = 3sin(x) + 2sin(5x) + 0.5sin(10x)"
            />
            <button className="primary-button" onClick={applyFormulaToComponents}>
              <Check size={17} />
              应用
            </button>
          </div>
          <p className={displayError ? "status-line error" : "status-line"}>
            {displayError ?? "支持 sin、cos、x、pi、括号、加减乘除，也支持 3sin(x) 与 5x 这类省略乘号写法。"}
          </p>
        </div>
      </section>

      <section className="lab-grid">
        <div className="scope-column">
          <div className="panel scope-panel">
            <div className="panel-title">
              <Waves size={18} />
              <span>时间域波形</span>
              <button className="icon-text-button" onClick={() => setShowParts((current) => !current)}>
                {showParts ? <Eye size={16} /> : <EyeOff size={16} />}
                {showParts ? "显示分量" : "隐藏分量"}
              </button>
            </div>
            <canvas ref={waveCanvasRef} />
          </div>

          <div className="panel spectrum-panel">
            <div className="panel-title">
              <BarChart3 size={18} />
              <span>频率组成</span>
            </div>
            <canvas ref={spectrumCanvasRef} />
          </div>
        </div>

        <aside className="panel control-panel">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <span>分量编辑器</span>
            <button className="icon-button" aria-label="新增分量" onClick={addComponent}>
              <Plus size={17} />
            </button>
          </div>

          <div className="readout-grid">
            {readouts.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="settings-block">
            <label>
              <span>周期范围</span>
              <select value={cycles} onChange={(event) => setCycles(Number(event.target.value) as CycleCount)}>
                <option value={1}>1 周期：0 到 2pi</option>
                <option value={2}>2 周期：0 到 4pi</option>
                <option value={4}>4 周期：0 到 8pi</option>
              </select>
            </label>
            <label>
              <span>采样点数</span>
              <select value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value) as SampleCount)}>
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
              </select>
            </label>
          </div>

          <div className="component-list">
            {components.map((component, index) => (
              <article className="component-card" key={component.id} style={{ borderColor: `${component.color}78` }}>
                <div className="component-head">
                  <div>
                    <span style={{ background: component.color }} />
                    <strong>分量 {index + 1}</strong>
                  </div>
                  <div className="component-actions">
                    <button className="icon-button" aria-label={component.enabled ? "禁用分量" : "启用分量"} onClick={() => updateComponent(component.id, { enabled: !component.enabled })}>
                      {component.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button className="icon-button" aria-label="删除分量" onClick={() => deleteComponent(component.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="compact-grid">
                  <label>
                    <span>函数</span>
                    <select value={component.kind} onChange={(event) => updateComponent(component.id, { kind: event.target.value as WaveKind })}>
                      <option value="sin">sin</option>
                      <option value="cos">cos</option>
                    </select>
                  </label>
                  <label>
                    <span>颜色</span>
                    <input type="color" value={component.color} onChange={(event) => updateComponent(component.id, { color: event.target.value })} />
                  </label>
                </div>

                <RangeControl label="振幅" min={-5} max={5} step={0.1} value={component.amplitude} onChange={(value) => updateComponent(component.id, { amplitude: value })} />
                <RangeControl label="频率倍数" min={0.5} max={20} step={0.5} value={component.frequency} onChange={(value) => updateComponent(component.id, { frequency: value })} />
                <RangeControl label="相位" min={-Math.PI} max={Math.PI} step={0.05} value={component.phase} onChange={(value) => updateComponent(component.id, { phase: value })} />
              </article>
            ))}
          </div>

          <div className="control-footer">
            <button className="ghost-button" onClick={resetExample}>
              <RotateCcw size={17} />
              重置示例
            </button>
            <button className="ghost-button" onClick={() => setFormulaInput(componentsToFormula(components))}>
              <Grid3X3 size={17} />
              从分量生成公式
            </button>
          </div>
        </aside>
      </section>

      <section className="formula-readout wave-desk-readout">
        <Activity size={18} />
        <span>{activeFormula}</span>
      </section>
    </main>
  );
}

function RangeControl({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>{formatNumber(value)}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))} />
    </label>
  );
}
