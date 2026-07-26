"use client";

import { useId } from "react";

type ChartKind = "bars" | "area" | "line" | "step" | "donut";

export type MetricCardProps = {
  title: string;
  subtitle: string;
  value: string;
  change: string;
  chart: ChartKind;
  data?: number[];
  donutValue?: number;
  centerValue?: string;
  centerLabel?: string;
  className?: string;
};

const ACCENT = "#5548e8";
const ACCENT_DARK = "#332b91";
const ACCENT_SOFT = "#ecebff";
const GRID = "#d9dfea";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function normalize(values: number[], top = 14, bottom = 86) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => ({
    x: values.length === 1 ? 50 : (index / (values.length - 1)) * 100,
    y: bottom - ((value - min) / range) * (bottom - top),
  }));
}

function smoothPath(values: number[]) {
  const points = normalize(values);
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function BarsChart({ data = [35, 78, 56, 34, 86, 35, 51] }: { data?: number[] }) {
  const width = 8;
  const gap = 14;

  return (
    <svg
      viewBox="0 0 100 80"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label="Compact vertical bar chart"
      preserveAspectRatio="none"
    >
      {data.map((value, index) => {
        const x = 4 + index * gap;
        const normalized = clamp(value);
        const fillHeight = Math.max(15, normalized * 0.58);
        const y = 69 - fillHeight;

        return (
          <g key={`${value}-${index}`}>
            <rect x={x} y="10" width={width} height="59" rx="4" fill={ACCENT_SOFT} />
            <rect x={x} y={y} width={width} height={fillHeight} rx="4" fill={ACCENT} opacity="0.92" />
          </g>
        );
      })}
    </svg>
  );
}

function AreaChart({ data = [42, 35, 49, 37, 65, 92, 61, 41, 69, 66, 56, 48] }: { data?: number[] }) {
  const gradientId = useId().replace(/:/g, "");
  const line = smoothPath(data);
  const area = `${line} L 100 100 L 0 100 Z`;

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      role="img"
      aria-label="Compact smooth area chart"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.24" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={ACCENT_DARK} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LineChart({ data = [18, 62, 38, 78, 58, 84] }: { data?: number[] }) {
  const points = normalize(data, 14, 82);
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      viewBox="-3 0 106 100"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label="Compact line chart with points"
      preserveAspectRatio="none"
    >
      {points.map((point, index) => (
        <line
          key={`grid-${index}`}
          x1={point.x}
          x2={point.x}
          y1="10"
          y2="88"
          stroke={GRID}
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />
      ))}
      <polyline
        points={polyline}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, index) => (
        <circle key={`point-${index}`} cx={point.x} cy={point.y} r="3.6" fill={ACCENT} />
      ))}
    </svg>
  );
}

function StepChart({ data = [15, 15, 39, 39, 24, 24, 6, 6, 38, 38, 76, 76] }: { data?: number[] }) {
  const points = normalize(data, 13, 84);
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      role="img"
      aria-label="Compact stepped line chart"
      preserveAspectRatio="none"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke={ACCENT_DARK}
        strokeWidth="2.1"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}

function DonutChart({
  value = 72,
  centerValue = "500",
  centerLabel = "Visitors",
}: {
  value?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const progress = clamp(value);
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      role="img"
      aria-label={`${progress}% circular progress chart`}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke={ACCENT_SOFT} strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={ACCENT_DARK}
        strokeWidth="10"
        strokeLinecap="butt"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="47"
        textAnchor="middle"
        fill="#0c1b36"
        fontFamily="var(--font-app), Georgia, serif"
        fontSize="17"
      >
        {centerValue}
      </text>
      <text
        x="50"
        y="65"
        textAnchor="middle"
        fill="#55627a"
        fontFamily="var(--font-app), Georgia, serif"
        fontSize="11"
      >
        {centerLabel}
      </text>
    </svg>
  );
}

function Chart({
  kind,
  data,
  donutValue,
  centerValue,
  centerLabel,
}: {
  kind: ChartKind;
  data?: number[];
  donutValue?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  switch (kind) {
    case "bars":
      return <BarsChart data={data} />;
    case "area":
      return <AreaChart data={data} />;
    case "line":
      return <LineChart data={data} />;
    case "step":
      return <StepChart data={data} />;
    case "donut":
      return (
        <DonutChart
          value={donutValue}
          centerValue={centerValue}
          centerLabel={centerLabel}
        />
      );
  }
}

export function MetricCard({
  title,
  subtitle,
  value,
  change,
  chart,
  data,
  donutValue,
  centerValue,
  centerLabel,
  className = "",
}: MetricCardProps) {
  const isNegative = change.trim().startsWith("-");

  return (
    <article
      className={[
        "flex min-h-[268px] flex-col rounded-[26px] border border-slate-200/90 bg-white",
        "px-6 pb-5 pt-6 shadow-[0_2px_3px_rgba(15,23,42,0.08),0_10px_26px_rgba(15,23,42,0.08)]",
        "transition-transform duration-200 hover:-translate-y-0.5",
        className,
      ].join(" ")}
    >
      <header>
        <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[#0c1b36]">
          {title}
        </h3>
        <p className="mt-1 font-serif text-[17px] text-slate-500">{subtitle}</p>
      </header>

      <div className={chart === "donut" ? "mx-auto mt-5 h-[105px] w-[105px]" : "mt-5 h-[100px] w-full"}>
        <Chart
          kind={chart}
          data={data}
          donutValue={donutValue}
          centerValue={centerValue}
          centerLabel={centerLabel}
        />
      </div>

      <footer className="mt-auto flex items-end justify-between gap-4 pt-3">
        <span className="font-serif text-[23px] leading-none tracking-[-0.04em] text-[#07162f]">
          {value}
        </span>
        <span
          className={[
            "font-serif text-[16px] leading-none",
            isNegative ? "text-[#5548e8]" : "text-[#6158ff]",
          ].join(" ")}
        >
          {change}
        </span>
      </footer>
    </article>
  );
}
