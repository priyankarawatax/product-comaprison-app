import { useId } from "react";

type Day = { day: string; opens: number; cart: number };
export function ComparisonActivityChart({ days }: { days: Day[] }) {
  const id = useId();
  const max = Math.max(1, ...days.flatMap((day) => [day.opens, day.cart]));
  const x = (index: number) => 48 + index / Math.max(1, days.length - 1) * 704;
  const y = (count: number) => 188 - count / max * 152;
  const points = (key: "opens" | "cart") => days.map((day, index) => `${x(index)},${y(day[key])}`).join(" ");
  return <s-stack gap="base">
    <s-paragraph>Blue solid line: comparison opens. Green dashed line: Add to Cart clicks. Dates use UTC.</s-paragraph>
    <svg viewBox="0 0 800 225" width="100%" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Daily comparison activity</title>
      <desc id={`${id}-description`}>{days.map((day) => `${day.day}: ${day.opens} opens, ${day.cart} Add to Cart clicks`).join("; ")}</desc>
      {[0, 0.5, 1].map((ratio) => <g key={ratio}>
        <line x1="48" x2="752" y1={y(max * ratio)} y2={y(max * ratio)} stroke="#dedede" />
        <text x="40" y={y(max * ratio) + 4} textAnchor="end" fontSize="12" fill="currentColor">{(max * ratio).toLocaleString(undefined, { maximumFractionDigits: 1 })}</text>
      </g>)}
      <polyline points={points("opens")} fill="none" stroke="#005bd3" strokeWidth="2.5" />
      <polyline points={points("cart")} fill="none" stroke="#008060" strokeWidth="2.5" strokeDasharray="6 4" />
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((index) => <text key={index} x={x(index)} y="215" textAnchor="middle" fontSize="12" fill="currentColor">{days[index]?.day.slice(5)}</text>)}
    </svg>
  </s-stack>;
}
