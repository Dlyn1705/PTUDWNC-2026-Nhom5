import type { CSSProperties } from "react";

export type MascotMood = "idle" | "email" | "password" | "peek" | "success" | "error";

export function LoginMascot({
  mood,
  emailProgress,
}: {
  mood: MascotMood;
  emailProgress: number;
}) {
  return (
    <div
      className={`login-mascot login-mascot-${mood}`}
      style={{ "--email-progress": emailProgress } as CSSProperties}
      role="img"
      aria-label="Chú gấu đầu bếp đang đồng hành cùng bạn đăng nhập"
    >
      <svg viewBox="0 0 180 130" aria-hidden="true" className="h-32 w-44">
        <ellipse cx="90" cy="119" rx="54" ry="7" fill="#661a06" opacity=".12" />
        <g className="mascot-body">
          <path d="M50 115c1-26 15-39 40-39s39 13 40 39" fill="#bc6e45" />
          <path d="M71 115c2-12 8-18 19-18s17 6 19 18" fill="#f5d9bd" />
          <circle cx="54" cy="38" r="17" fill="#bc6e45" />
          <circle cx="126" cy="38" r="17" fill="#bc6e45" />
          <circle cx="54" cy="38" r="8" fill="#f5d9bd" />
          <circle cx="126" cy="38" r="8" fill="#f5d9bd" />
          <path d="M47 62c0-27 17-43 43-43s43 16 43 43-17 39-43 39S47 89 47 62" fill="#d99164" />
          <ellipse cx="90" cy="70" rx="24" ry="19" fill="#f5d9bd" />
          <g className="mascot-eyes">
            <ellipse className="mascot-eye" cx="76" cy="57" rx="3.5" ry="5" fill="#30211d" />
            <ellipse className="mascot-eye" cx="104" cy="57" rx="3.5" ry="5" fill="#30211d" />
            <path className="mascot-eye-closed" d="M71 58q5 5 10 0m18 0q5 5 10 0" fill="none" stroke="#30211d" strokeWidth="3" strokeLinecap="round" />
          </g>
          <path d="M85 68q5-5 10 0-5 6-10 0" fill="#661a06" />
          <path className="mascot-mouth" d="M84 78q6 7 12 0" fill="none" stroke="#661a06" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M69 28q21-17 42 0l-4-15H73z" fill="#fff7ee" />
          <path d="M68 29h44" stroke="#661a06" strokeWidth="4" strokeLinecap="round" />
          <g className="mascot-hands" fill="#d99164" stroke="#a95d3b" strokeWidth="1.5">
            <path d="M47 94q-8-15 1-26 5-5 9 1l4 12q7-10 11-5 4 4-3 13l-8 13z" />
            <path d="M133 94q8-15-1-26-5-5-9 1l-4 12q-7-10-11-5-4 4 3 13l8 13z" />
          </g>
          <path className="mascot-wave" d="M128 88q19-5 15-24" fill="none" stroke="#d99164" strokeWidth="9" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
