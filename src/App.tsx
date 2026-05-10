import {
  Activity,
  AudioLines,
  FileAudio,
  Mic,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Upload,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { WaveDesk } from "./WaveDesk";

type Spectrum = {
  sampleRate: number;
  fftSize: number;
  binHz: number;
  average: Float32Array;
  frames: Float32Array[];
  peakHz: number;
};

type Band = {
  id: string;
  name: string;
  range: [number, number];
  color: string;
  hint: string;
};

type ActivePlayback = {
  context: AudioContext;
  sources: AudioBufferSourceNode[];
  gains: Record<string, GainNode>;
};

const FFT_SIZE = 2048;
const DEFAULT_BOUNDARIES = [250, 2000, 6000];
const MAX_FREQ = 20000;

const formatHz = (value: number) => {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} kHz`;
  return `${Math.round(value)} Hz`;
};

function makeBands(boundaries: number[]): Band[] {
  const [a, b, c] = boundaries;
  return [
    { id: "low", name: "低频", range: [20, a], color: "#00d1b2", hint: "鼓点、低音、厚度" },
    { id: "body", name: "低中频", range: [a, b], color: "#ffd166", hint: "主体音色、人声基础" },
    { id: "presence", name: "中高频", range: [b, c], color: "#f25f5c", hint: "清晰度、齿音、亮度" },
    { id: "air", name: "高频", range: [c, MAX_FREQ], color: "#7c5cff", hint: "空气感、细节、泛音" },
  ];
}

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass();
}

function getMonoSamples(buffer: AudioBuffer) {
  const length = buffer.length;
  const channelCount = buffer.numberOfChannels;
  const samples = new Float32Array(length);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) samples[i] += data[i] / channelCount;
  }
  return samples;
}

function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const vReal = real[i + j + len / 2] * wReal - imag[i + j + len / 2] * wImag;
        const vImag = real[i + j + len / 2] * wImag + imag[i + j + len / 2] * wReal;
        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[i + j + len / 2] = uReal - vReal;
        imag[i + j + len / 2] = uImag - vImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }
}

function analyzeBuffer(buffer: AudioBuffer): Spectrum {
  const samples = getMonoSamples(buffer);
  const hop = FFT_SIZE / 2;
  const frameCount = Math.max(1, Math.floor((samples.length - FFT_SIZE) / hop) + 1);
  const frames: Float32Array[] = [];
  const average = new Float32Array(FFT_SIZE / 2);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * hop;
    const real = new Float32Array(FFT_SIZE);
    const imag = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const sample = samples[offset + i] ?? 0;
      const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
      real[i] = sample * windowValue;
    }
    fft(real, imag);
    const magnitudes = new Float32Array(FFT_SIZE / 2);
    for (let i = 1; i < FFT_SIZE / 2; i += 1) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      const db = 20 * Math.log10(magnitude / FFT_SIZE + 1e-8);
      const normalized = Math.max(0, Math.min(1, (db + 92) / 92));
      magnitudes[i] = normalized;
      average[i] += normalized / frameCount;
    }
    frames.push(magnitudes);
  }

  let peakIndex = 1;
  for (let i = 2; i < average.length; i += 1) {
    if (average[i] > average[peakIndex]) peakIndex = i;
  }

  return {
    sampleRate: buffer.sampleRate,
    fftSize: FFT_SIZE,
    binHz: buffer.sampleRate / FFT_SIZE,
    average,
    frames,
    peakHz: peakIndex * (buffer.sampleRate / FFT_SIZE),
  };
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer | null) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.beginPath();
  ctx.moveTo(0, rect.height / 2);
  ctx.lineTo(rect.width, rect.height / 2);
  ctx.stroke();

  if (!buffer) {
    ctx.fillStyle = "rgba(244, 238, 220, .42)";
    ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("等待录音或上传音频", 18, 34);
    return;
  }

  const samples = getMonoSamples(buffer);
  const step = Math.ceil(samples.length / rect.width);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#f4eedc";
  ctx.beginPath();
  for (let x = 0; x < rect.width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    for (let i = 0; i < step; i += 1) {
      const value = samples[start + i] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    ctx.moveTo(x, ((1 + min) * rect.height) / 2);
    ctx.lineTo(x, ((1 + max) * rect.height) / 2);
  }
  ctx.stroke();
}

function drawSpectrum(canvas: HTMLCanvasElement, spectrum: Spectrum | null, bands: Band[]) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, rect.width, rect.height);

  bands.forEach((band) => {
    const x1 = (Math.log10(band.range[0]) - Math.log10(20)) / (Math.log10(MAX_FREQ) - Math.log10(20));
    const x2 = (Math.log10(band.range[1]) - Math.log10(20)) / (Math.log10(MAX_FREQ) - Math.log10(20));
    ctx.fillStyle = `${band.color}18`;
    ctx.fillRect(x1 * rect.width, 0, Math.max(2, (x2 - x1) * rect.width), rect.height);
  });

  if (!spectrum) return;

  const bars = Math.min(180, Math.floor(rect.width / 4));
  for (let i = 0; i < bars; i += 1) {
    const t = i / bars;
    const freq = 20 * Math.pow(MAX_FREQ / 20, t);
    const index = Math.min(spectrum.average.length - 1, Math.round(freq / spectrum.binHz));
    const value = spectrum.average[index];
    const x = (i / bars) * rect.width;
    const barWidth = rect.width / bars - 1;
    const height = Math.max(2, value * rect.height);
    const hue = 170 - value * 140;
    ctx.fillStyle = `hsl(${hue}, 88%, ${48 + value * 20}%)`;
    ctx.fillRect(x, rect.height - height, barWidth, height);
  }

  ctx.fillStyle = "rgba(244,238,220,.72)";
  ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  [20, 100, 1000, 10000, 20000].forEach((freq) => {
    const x = ((Math.log10(freq) - Math.log10(20)) / (Math.log10(MAX_FREQ) - Math.log10(20))) * rect.width;
    ctx.fillRect(x, 0, 1, rect.height);
    ctx.fillText(formatHz(freq), Math.min(rect.width - 48, x + 5), rect.height - 10);
  });
}

function drawHeatmap(canvas: HTMLCanvasElement, spectrum: Spectrum | null) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, rect.width, rect.height);
  if (!spectrum) return;

  const frames = spectrum.frames;
  const xStep = rect.width / frames.length;
  const bins = 96;
  for (let x = 0; x < frames.length; x += 1) {
    const frame = frames[x];
    for (let y = 0; y < bins; y += 1) {
      const t = 1 - y / bins;
      const freq = 20 * Math.pow(MAX_FREQ / 20, t);
      const index = Math.min(frame.length - 1, Math.round(freq / spectrum.binHz));
      const value = frame[index];
      const light = 8 + value * 62;
      const hue = 205 - value * 180;
      ctx.fillStyle = `hsl(${hue}, 86%, ${light}%)`;
      ctx.fillRect(x * xStep, (y / bins) * rect.height, Math.max(1, xStep + 0.5), rect.height / bins + 0.5);
    }
  }
}

function makeBandChain(context: AudioContext, source: AudioBufferSourceNode, band: Band) {
  const [low, high] = band.range;
  let first: AudioNode = source;
  if (low > 20) {
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = low;
    highpass.Q.value = 0.7;
    first.connect(highpass);
    first = highpass;
  }
  if (high < MAX_FREQ) {
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = high;
    lowpass.Q.value = 0.7;
    first.connect(lowpass);
    first = lowpass;
  }
  return first;
}

function AudioLab() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("尚未载入音频");
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("上传音频或录一段声音，开始观察频率结构。");
  const [spectrum, setSpectrum] = useState<Spectrum | null>(null);
  const [boundaries, setBoundaries] = useState(DEFAULT_BOUNDARIES);
  const [volumes, setVolumes] = useState<Record<string, number>>({ low: 0.9, body: 0.9, presence: 0.9, air: 0.9 });
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState(false);
  const [liveLevel, setLiveLevel] = useState(0);

  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackRef = useRef<ActivePlayback | null>(null);
  const rafRef = useRef<number | null>(null);

  const bands = useMemo(() => makeBands(boundaries), [boundaries]);
  const duration = audioBuffer ? audioBuffer.duration : 0;
  const binResolution = spectrum ? spectrum.binHz : 0;

  const decodeBlob = async (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const context = createAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    await context.close();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(url);
    setAudioBuffer(decoded);
    setSourceName(name);
    setSpectrum(analyzeBuffer(decoded));
    setStatus("音频已解析完成，可以观察频谱或试听不同频段。");
  };

  const stopPlayback = () => {
    if (!playbackRef.current) return;
    playbackRef.current.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already be stopped by the browser.
      }
    });
    playbackRef.current.context.close();
    playbackRef.current = null;
    setPlaying(false);
  };

  const playBands = async (soloBandId?: string) => {
    if (!audioBuffer) return;
    stopPlayback();
    const context = createAudioContext();
    const gains: Record<string, GainNode> = {};
    const sources: AudioBufferSourceNode[] = [];
    bands.forEach((band) => {
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      const filtered = makeBandChain(context, source, band);
      const gain = context.createGain();
      const shouldMute = soloBandId ? soloBandId !== band.id : muted[band.id];
      gain.gain.value = shouldMute ? 0 : volumes[band.id] ?? 0.9;
      filtered.connect(gain).connect(context.destination);
      source.onended = () => setPlaying(false);
      gains[band.id] = gain;
      sources.push(source);
    });
    playbackRef.current = { context, sources, gains };
    sources.forEach((source) => source.start());
    setPlaying(true);
    setStatus(soloBandId ? `正在单独试听 ${bands.find((band) => band.id === soloBandId)?.name}` : "正在播放四个频段混合后的声音。");
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    stopPlayback();
    setStatus("正在解析上传的音频文件...");
    try {
      await decodeBlob(file, file.name);
    } catch (error) {
      setStatus(`解析失败：${error instanceof Error ? error.message : "浏览器不支持该格式"}`);
    } finally {
      event.target.value = "";
    }
  };

  const startRecording = async () => {
    stopPlayback();
    setStatus("正在请求麦克风权限...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const context = createAudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      liveAnalyserRef.current = analyser;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        liveAnalyserRef.current = null;
        setLiveLevel(0);
        setStatus("录音结束，正在解析音频...");
        try {
          await decodeBlob(blob, `录音 ${new Date().toLocaleTimeString("zh-CN")}`);
        } catch (error) {
          setStatus(`录音解析失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
        context.close();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus("录音中：可以说话、哼唱，或在附近播放一小段声音。");
    } catch (error) {
      setStatus(`无法开始录音：${error instanceof Error ? error.message : "请检查浏览器权限"}`);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const setBoundary = (index: number, value: number) => {
    setBoundaries((current) => {
      const next = [...current];
      const min = index === 0 ? 80 : current[index - 1] + 100;
      const max = index === 2 ? 12000 : current[index + 1] - 100;
      next[index] = Math.max(min, Math.min(max, value));
      return next;
    });
  };

  useEffect(() => {
    const drawAll = () => {
      if (waveformRef.current) drawWaveform(waveformRef.current, audioBuffer);
      if (spectrumRef.current) drawSpectrum(spectrumRef.current, spectrum, bands);
      if (heatmapRef.current) drawHeatmap(heatmapRef.current, spectrum);
    };
    drawAll();
    window.addEventListener("resize", drawAll);
    return () => window.removeEventListener("resize", drawAll);
  }, [audioBuffer, spectrum, bands]);

  useEffect(() => {
    Object.entries(volumes).forEach(([id, volume]) => {
      const gain = playbackRef.current?.gains[id];
      if (gain) gain.gain.value = muted[id] ? 0 : volume;
    });
  }, [volumes, muted]);

  useEffect(() => {
    const tick = () => {
      const analyser = liveAnalyserRef.current;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const peak = data.reduce((max, value) => Math.max(max, value), 0);
        setLiveLevel(peak / 255);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Fourier Audio Lab</p>
          <h1>把声音拆开，看见频率的骨架</h1>
          <p className="hero-copy">录一段声音或上传音频，观察波形、频谱和时间-频率热力图，再把同一段声音拆成不同频段单独试听。</p>
        </div>
        <div className="hero-meter" aria-label="实时输入音量">
          <span style={{ height: `${12 + liveLevel * 78}%` }} />
          <span style={{ height: `${20 + liveLevel * 64}%` }} />
          <span style={{ height: `${30 + liveLevel * 55}%` }} />
          <span style={{ height: `${18 + liveLevel * 72}%` }} />
        </div>
      </section>

      <section className="control-grid">
        <div className="panel input-panel">
          <div className="panel-title">
            <Mic size={18} />
            <span>输入</span>
          </div>
          <div className="input-actions">
            <button className="primary-button" onClick={recording ? stopRecording : startRecording}>
              {recording ? <Square size={18} /> : <Mic size={18} />}
              {recording ? "停止录音" : "开始录音"}
            </button>
            <label className="ghost-button">
              <Upload size={18} />
              上传音频
              <input type="file" accept="audio/*" onChange={handleUpload} />
            </label>
          </div>
          <div className="source-card">
            <FileAudio size={18} />
            <div>
              <strong>{sourceName}</strong>
              <span>{audioBuffer ? `${duration.toFixed(2)} 秒 · ${audioBuffer.sampleRate.toLocaleString()} Hz` : "支持浏览器可解码的 mp3 / wav / m4a / webm"}</span>
            </div>
          </div>
          {audioUrl && <audio controls src={audioUrl} className="native-player" />}
          <p className="status-line">{status}</p>
        </div>

        <div className="panel stats-panel">
          <div className="panel-title">
            <Activity size={18} />
            <span>学习读数</span>
          </div>
          <div className="stat-grid">
            <div>
              <span>主频峰值</span>
              <strong>{spectrum ? formatHz(spectrum.peakHz) : "--"}</strong>
            </div>
            <div>
              <span>FFT Size</span>
              <strong>{spectrum?.fftSize ?? FFT_SIZE}</strong>
            </div>
            <div>
              <span>Bin 分辨率</span>
              <strong>{binResolution ? `${binResolution.toFixed(1)} Hz` : "--"}</strong>
            </div>
            <div>
              <span>采样率</span>
              <strong>{spectrum ? `${spectrum.sampleRate.toLocaleString()} Hz` : "--"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="visual-grid">
        <div className="panel visual-panel waveform-panel">
          <div className="panel-title">
            <Waves size={18} />
            <span>时间域波形</span>
          </div>
          <canvas ref={waveformRef} />
        </div>
        <div className="panel visual-panel">
          <div className="panel-title">
            <AudioLines size={18} />
            <span>平均频谱</span>
          </div>
          <canvas ref={spectrumRef} />
        </div>
        <div className="panel visual-panel heatmap-panel">
          <div className="panel-title">
            <Activity size={18} />
            <span>频谱热力图</span>
          </div>
          <canvas ref={heatmapRef} />
        </div>
      </section>

      <section className="split-section">
        <div className="panel band-controls">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <span>自定义频段边界</span>
          </div>
          <div className="boundary-grid">
            {boundaries.map((boundary, index) => (
              <label key={index}>
                <span>
                  边界 {index + 1}: {formatHz(boundary)}
                </span>
                <input type="range" min={index === 0 ? 80 : boundaries[index - 1] + 100} max={index === 2 ? 12000 : boundaries[index + 1] - 100} value={boundary} step={10} onChange={(event) => setBoundary(index, Number(event.target.value))} />
              </label>
            ))}
          </div>
          <div className="playbar">
            <button className="primary-button" disabled={!audioBuffer} onClick={() => (playing ? stopPlayback() : playBands())}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
              {playing ? "停止播放" : "播放分频混合"}
            </button>
            <button className="ghost-button" onClick={() => setBoundaries(DEFAULT_BOUNDARIES)}>
              重置边界
            </button>
          </div>
        </div>

        <div className="band-grid">
          {bands.map((band) => (
            <article className="band-card" key={band.id} style={{ borderColor: `${band.color}70` }}>
              <div className="band-head">
                <div>
                  <strong>{band.name}</strong>
                  <span>
                    {formatHz(band.range[0])} - {formatHz(band.range[1])}
                  </span>
                </div>
                <button aria-label={muted[band.id] ? "取消静音" : "静音"} className="icon-button" onClick={() => setMuted((current) => ({ ...current, [band.id]: !current[band.id] }))}>
                  {muted[band.id] ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              <p>{band.hint}</p>
              <input type="range" min={0} max={1} step={0.01} value={volumes[band.id] ?? 0.9} onChange={(event) => setVolumes((current) => ({ ...current, [band.id]: Number(event.target.value) }))} />
              <button className="solo-button" disabled={!audioBuffer} onClick={() => playBands(band.id)}>
                <Play size={16} />
                单独试听
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export function App() {
  return window.location.pathname.startsWith("/wave-desk") ? <WaveDesk /> : <AudioLab />;
}
