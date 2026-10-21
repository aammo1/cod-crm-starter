"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type RobotMood = "cheerful" | "grumpy" | "thinking";

/** A small original chrome endoskeleton; SVG keeps it crisp at every size. */
export function AssistantRobot({ mood = "cheerful", className }: {
  mood?: RobotMood;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={cn("z800-robot inline-flex shrink-0", className)} data-mood={mood} aria-hidden="true">
      <svg viewBox="0 0 160 172" fill="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id={`${id}-chrome`} x1="37" y1="28" x2="127" y2="135" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f1f5f9" /><stop offset=".3" stopColor="#94a3b8" /><stop offset=".5" stopColor="#e2e8f0" /><stop offset="1" stopColor="#475569" />
          </linearGradient>
          <linearGradient id={`${id}-body`} x1="80" y1="128" x2="80" y2="169" gradientUnits="userSpaceOnUse">
            <stop stopColor="#64748b" /><stop offset="1" stopColor="#1e293b" />
          </linearGradient>
          <radialGradient id={`${id}-eye`}><stop stopColor="#fff1f2" /><stop offset=".35" stopColor="#f87171" /><stop offset="1" stopColor="#dc2626" /></radialGradient>
        </defs>
        <ellipse cx="80" cy="164" rx="53" ry="6" fill="currentColor" opacity=".08" />
        <g className="z800-robot-body">
          <path d="M24 158v-13l27-15h58l27 15v13l-22 6H46l-22-6Z" fill={`url(#${id}-body)`} stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" />
          <path d="m37 143 16-8 13 19H42l-5-11Zm86 0-16-8-13 19h24l5-11Z" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
          <path d="M67 121h26v22H67z" fill="#475569" stroke="#0f172a" strokeWidth="3" />
          <path d="M68 129h24m-24 7h24" stroke="#cbd5e1" strokeWidth="3" />
          <rect x="70" y="149" width="20" height="7" rx="2" fill="#0f172a" />
          <path d="M75 152.5h10" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="z800-robot-head">
          <path d="M78 22v-8" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
          <circle cx="78" cy="12" r="5" fill="#f87171" stroke="#7f1d1d" strokeWidth="2" className="z800-robot-beacon" />
          <rect x="23" y="58" width="15" height="35" rx="6" fill="#475569" stroke="#0f172a" strokeWidth="3" />
          <rect x="122" y="58" width="15" height="35" rx="6" fill="#475569" stroke="#0f172a" strokeWidth="3" />
          <path d="m48 26-15 15v54l17 27 30 9 30-9 17-27V41l-15-15H48Z" fill={`url(#${id}-chrome)`} stroke="#0f172a" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="m48 34-7 10v11m54-20h15l9 10v10" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
          <path d="M65 35h28m-24 6h20" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <path d="m43 60 29-4 8 9 8-9 29 4-4 27-24 2-9-11-9 11-24-2-4-27Z" fill="#0f172a" stroke="#475569" strokeWidth="2" />
          <g className="z800-robot-eyes">
            <circle cx="59" cy="73" r="11" fill="#450a0a" />
            <circle cx="59" cy="73" r="7" fill={`url(#${id}-eye)`} className="z800-robot-eye" />
            <circle cx="101" cy="73" r="11" fill="#450a0a" />
            <circle cx="101" cy="73" r="7" fill={`url(#${id}-eye)`} className="z800-robot-eye" />
            <circle cx="57" cy="71" r="2" fill="#fff" /><circle cx="99" cy="71" r="2" fill="#fff" />
          </g>
          <path className="z800-robot-brow-left" d="m47 56 22-2" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <path className="z800-robot-brow-right" d="m91 54 22 2" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <path d="m78 81-5 13h14l-5-13" fill="#64748b" stroke="#334155" strokeWidth="2" strokeLinejoin="round" />
          <path d="m43 96 10 7-5 7m69-14-10 7 5 7" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <path className="z800-robot-mouth" d={mood === "grumpy" ? "M58 112q22-12 44 0v6H58v-6Z" : "M56 103q24 5 48 0l-5 13q-19 10-38 0l-5-13Z"} fill="#0f172a" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
          <path d={mood === "grumpy" ? "M65 108v9m10-11v11m10-11v11m10-9v9" : "m65 106 2 11m8-10 1 13m9-13-1 13m11-14-2 11"} stroke="#cbd5e1" strokeWidth="4" />
          <circle cx="42" cy="46" r="3" fill="#334155" /><circle cx="118" cy="46" r="3" fill="#334155" />
          <circle cx="55" cy="119" r="2" fill="#334155" /><circle cx="105" cy="119" r="2" fill="#334155" />
        </g>
      </svg>
    </span>
  );
}
