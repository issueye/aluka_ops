/**
 * 登录页拓扑插画：中心节点 + 边缘服务 + 隧道。
 * 颜色全部走 CSS 变量，跟随 light / dark，避免深色机柜贴在浅底上。
 */
export function OpsIllustration({ className = "w-full max-w-lg" }) {
  return (
    <svg
      viewBox="0 0 640 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="opsGlow" cx="50%" cy="48%" r="52%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
          <stop offset="70%" stopColor="var(--primary)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="opsCore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--card)" />
          <stop offset="100%" stopColor="var(--muted)" />
        </linearGradient>
        <filter id="opsSoft" x="-12%" y="-12%" width="124%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="var(--foreground)" floodOpacity="0.08" />
        </filter>
      </defs>

      <circle cx="320" cy="200" r="190" fill="url(#opsGlow)" />

      <g stroke="var(--primary)" strokeOpacity="0.28" strokeWidth="1.25">
        <path d="M168 118 L258 168" strokeDasharray="4 5" />
        <path d="M472 112 L382 168" strokeDasharray="4 5" />
        <path d="M156 292 L252 236" strokeDasharray="4 5" />
        <path d="M486 298 L388 236" strokeDasharray="4 5" />
      </g>

      <g filter="url(#opsSoft)">
        <rect
          x="248"
          y="132"
          width="144"
          height="148"
          rx="16"
          fill="url(#opsCore)"
          stroke="var(--border)"
        />
        <rect x="262" y="148" width="116" height="28" rx="7" fill="var(--background)" stroke="var(--border)" />
        <circle cx="276" cy="162" r="3.5" fill="var(--success)" />
        <rect x="288" y="159" width="74" height="6" rx="3" fill="var(--muted-foreground)" fillOpacity="0.22" />

        <rect
          x="262"
          y="186"
          width="116"
          height="28"
          rx="7"
          fill="var(--background)"
          stroke="var(--primary)"
          strokeOpacity="0.45"
        />
        <circle cx="276" cy="200" r="3.5" fill="var(--primary)" />
        <rect x="288" y="197" width="82" height="6" rx="3" fill="var(--primary)" fillOpacity="0.55" />

        <rect x="262" y="224" width="116" height="28" rx="7" fill="var(--background)" stroke="var(--border)" />
        <circle cx="276" cy="238" r="3.5" fill="var(--warning)" />
        <rect x="288" y="235" width="58" height="6" rx="3" fill="var(--muted-foreground)" fillOpacity="0.2" />
      </g>

      <g filter="url(#opsSoft)">
        <rect x="56" y="58" width="168" height="92" rx="14" fill="var(--card)" stroke="var(--border)" />
        <circle cx="74" cy="74" r="3.5" fill="var(--danger)" fillOpacity="0.8" />
        <circle cx="86" cy="74" r="3.5" fill="var(--warning)" fillOpacity="0.8" />
        <circle cx="98" cy="74" r="3.5" fill="var(--success)" fillOpacity="0.8" />
        <line x1="56" y1="86" x2="224" y2="86" stroke="var(--border)" />
        <text x="70" y="108" fill="var(--primary)" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          $ aluka start
        </text>
        <text x="70" y="126" fill="var(--muted-foreground)" fontSize="10" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          cluster ready
        </text>
      </g>

      <g filter="url(#opsSoft)">
        <rect x="416" y="52" width="168" height="92" rx="14" fill="var(--card)" stroke="var(--border)" />
        <rect x="432" y="68" width="20" height="20" rx="6" fill="var(--primary)" />
        <text x="460" y="82" fill="var(--foreground)" fontSize="12" fontWeight="600" fontFamily="system-ui, sans-serif">
          Services
        </text>
        <circle cx="438" cy="106" r="3" fill="var(--success)" />
        <text x="448" y="110" fill="var(--muted-foreground)" fontSize="11" fontFamily="system-ui, sans-serif">
          gateway-api
        </text>
        <circle cx="438" cy="126" r="3" fill="var(--success)" />
        <text x="448" y="130" fill="var(--muted-foreground)" fontSize="11" fontFamily="system-ui, sans-serif">
          auth-service
        </text>
      </g>

      <g filter="url(#opsSoft)">
        <rect x="52" y="250" width="168" height="86" rx="14" fill="var(--card)" stroke="var(--border)" />
        <text x="70" y="276" fill="var(--foreground)" fontSize="12" fontWeight="600" fontFamily="system-ui, sans-serif">
          Reverse tunnel
        </text>
        <text x="70" y="298" fill="var(--muted-foreground)" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          :18090 → office-1
        </text>
        <text x="70" y="318" fill="var(--success)" fontSize="10" fontFamily="system-ui, sans-serif">
          stream active
        </text>
      </g>

      <g filter="url(#opsSoft)">
        <rect x="420" y="254" width="168" height="86" rx="14" fill="var(--card)" stroke="var(--border)" />
        <text x="438" y="280" fill="var(--foreground)" fontSize="12" fontWeight="600" fontFamily="system-ui, sans-serif">
          Access control
        </text>
        <text x="438" y="302" fill="var(--muted-foreground)" fontSize="11" fontFamily="system-ui, sans-serif">
          Token · IP allowlist
        </text>
        <rect x="438" y="314" width="112" height="4" rx="2" fill="var(--success)" fillOpacity="0.45" />
      </g>
    </svg>
  );
}
