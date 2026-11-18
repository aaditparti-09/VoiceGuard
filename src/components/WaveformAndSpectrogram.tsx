import { useEffect, useRef } from 'react';
import type { RiskLevel } from '../types/voiceguard';

export function WaveformPreviewCanvas({
  peaks,
  progress = 0,
  height = 84,
}: {
  peaks: number[];
  progress?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 600;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const bars = peaks.length > 0 ? peaks : Array.from({ length: 48 }, () => 0.12);
    const barGap = 3;
    const barWidth = Math.max(2, (width - barGap * (bars.length - 1)) / bars.length);
    const midY = height / 2;

    bars.forEach((amp, i) => {
      const normalized = Math.max(0.08, Math.min(1, amp));
      const barHeight = normalized * (height * 0.82);
      const x = i * (barWidth + barGap);
      const y = midY - barHeight / 2;
      const ratio = i / Math.max(1, bars.length - 1);

      ctx.fillStyle = ratio <= progress ? '#06B6D4' : '#1E2D47';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    });
  }, [peaks, progress, height]);

  return <canvas ref={canvasRef} className="w-full block" style={{ height: `${height}px` }} />;
}

export function SpectrogramCanvas({
  matrix,
  spectrumPreview,
  height = 176,
}: {
  matrix?: number[][];
  spectrumPreview?: number[];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 640;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#060B14';
    ctx.fillRect(0, 0, width, height);

    if (matrix && matrix.length > 0) {
      const cols = matrix.length;
      const rows = matrix[0].length;
      const cellW = width / cols;
      const cellH = height / rows;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const val = Math.max(0, Math.min(1, matrix[c][r]));
          const y = (rows - 1 - r) * cellH;
          const x = c * cellW;
          const rCol = Math.round(8 + val * 30);
          const gCol = Math.round(28 + val * 180);
          const bCol = Math.round(58 + val * 195);
          ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${0.25 + val * 0.75})`;
          ctx.fillRect(x, y, Math.ceil(cellW + 0.5), Math.ceil(cellH + 0.5));
        }
      }
      return;
    }

    const bins =
      spectrumPreview && spectrumPreview.length > 0
        ? spectrumPreview
        : Array.from({ length: 24 }, (_, i) => Math.max(0.1, 1 - i * 0.04));
    const cols = 40;
    const rows = bins.length;
    const cellW = width / cols;
    const cellH = height / rows;

    for (let c = 0; c < cols; c++) {
      const waveMod = 0.85 + 0.15 * Math.sin(c * 0.45);
      for (let r = 0; r < rows; r++) {
        const val = Math.max(0, Math.min(1, bins[r] * waveMod));
        const y = (rows - 1 - r) * cellH;
        const x = c * cellW;
        const rCol = Math.round(8 + val * 30);
        const gCol = Math.round(28 + val * 170);
        const bCol = Math.round(58 + val * 195);
        ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${0.22 + val * 0.78})`;
        ctx.fillRect(x, y, Math.ceil(cellW + 0.5), Math.ceil(cellH + 0.5));
      }
    }
  }, [matrix, spectrumPreview, height]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#060B14]">
      <canvas ref={canvasRef} className="w-full block" style={{ height: `${height}px` }} />
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono text-slate-400 border-t border-slate-800/90 bg-[#09101E]">
        <span>0 Hz</span>
        <span>Time-Frequency Spectral Density</span>
        <span>Nyquist</span>
      </div>
    </div>
  );
}

export function RiskScoreGauge({
  score,
  riskLevel,
  label = 'Risk Score',
}: {
  score: number;
  riskLevel: RiskLevel;
  label?: string;
}) {
  const radius = 60;
  const stroke = 9;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    riskLevel === 'Critical Risk' || riskLevel === 'High Risk'
      ? '#EF4444'
      : riskLevel === 'Medium Risk'
        ? '#F59E0B'
        : '#10B981';

  const textColor =
    riskLevel === 'Critical Risk' || riskLevel === 'High Risk'
      ? 'text-red-400'
      : riskLevel === 'Medium Risk'
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <div className="relative inline-flex items-center justify-center w-40 h-40 shrink-0">
      <svg className="w-40 h-40 -rotate-90" viewBox="0 0 150 150" aria-label={`${label} ${clamped} out of 100`}>
        <circle cx="75" cy="75" r={radius} fill="none" stroke="#1E293B" strokeWidth={stroke} />
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`font-mono text-3xl font-bold tabular-nums ${textColor}`}>{clamped}</span>
        <span className="text-[11px] font-mono text-slate-400 mt-0.5">/ 100</span>
        <span className="text-[10px] text-slate-500 mt-0.5">{label}</span>
      </div>
    </div>
  );
}
