import { useId } from "react";

type Day = { day: string; clicks: number };

export function ProductFinderActivityChart({ days }: { days: Day[] }) {
  const id = useId();
  const max = Math.max(1, ...days.map((day) => day.clicks));
  const x = (index: number) => 48 + index / Math.max(1, days.length - 1) * 704;
  const y = (count: number) => 188 - count / max * 152;
  const points = days.map((day, index) => `${x(index)},${y(day.clicks)}`).join(" ");
  const areaPoints = days.length ? `48,188 ${points} 752,188` : "";

  return <s-stack gap="base">
    <s-paragraph>Purple line: daily Find my product button clicks. Dates use UTC.</s-paragraph>
    <svg viewBox="0 0 800 225" width="100%" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Daily Product Finder button clicks</title>
      <desc id={`${id}-description`}>{days.map((day) => `${day.day}: ${day.clicks} clicks`).join("; ")}</desc>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((ratio) => <g key={ratio}>
        <line x1="48" x2="752" y1={y(max * ratio)} y2={y(max * ratio)} stroke="#dedede" />
        <text x="40" y={y(max * ratio) + 4} textAnchor="end" fontSize="12" fill="currentColor">{(max * ratio).toLocaleString(undefined, { maximumFractionDigits: 1 })}</text>
      </g>)}
      <polygon points={areaPoints} fill={`url(#${id}-fill)`} />
      <polyline points={points} fill="none" stroke="#7c3aed" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" />
      {days.map((day, index) => day.clicks > 0 ? <circle key={day.day} cx={x(index)} cy={y(day.clicks)} r="3.5" fill="#7c3aed"><title>{day.day}: {day.clicks} clicks</title></circle> : null)}
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((index, labelIndex) => <text key={labelIndex} x={x(index)} y="215" textAnchor="middle" fontSize="12" fill="currentColor">{days[index]?.day.slice(5)}</text>)}
    </svg>
  </s-stack>;
}