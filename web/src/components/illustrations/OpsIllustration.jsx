/**
 * Aluka Ops DevOps & Cloud Gateway 矢量插画组件
 * 专为登录页与品牌展示定制，具备自适应暗色/明亮模式与精美科技拓扑细节
 */
export function OpsIllustration({ className = "w-full max-w-lg" }) {
  return (
    <svg
      viewBox="0 0 640 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Aluka Ops 架构拓扑插画"
    >
      <defs>
        {/* 背景光晕渐变 */}
        <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(199, 89%, 48%)" stopOpacity="0.25" />
          <stop offset="60%" stopColor="hsl(199, 89%, 48%)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="hsl(199, 89%, 48%)" stopOpacity="0" />
        </radialGradient>

        {/* 主体渐变 */}
        <linearGradient id="serverGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222, 47%, 18%)" />
          <stop offset="100%" stopColor="hsl(222, 47%, 11%)" />
        </linearGradient>

        <linearGradient id="primaryGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(199, 89%, 48%)" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" />
        </linearGradient>

        <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(142, 76%, 45%)" />
          <stop offset="100%" stopColor="hsl(160, 84%, 39%)" />
        </linearGradient>

        <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(222, 47%, 16%)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(222, 47%, 10%)" stopOpacity="0.85" />
        </linearGradient>

        {/* 阴影滤镜 */}
        <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(0, 0, 0, 0.35)" />
        </filter>

        <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* 1. 背景光晕与网格装饰点 */}
      <circle cx="320" cy="240" r="220" fill="url(#bgGlow)" />
      
      <g opacity="0.18">
        <circle cx="120" cy="80" r="2" fill="currentColor" />
        <circle cx="200" cy="60" r="1.5" fill="currentColor" />
        <circle cx="480" cy="70" r="2" fill="currentColor" />
        <circle cx="560" cy="110" r="1.5" fill="currentColor" />
        <circle cx="80" cy="220" r="1.5" fill="currentColor" />
        <circle cx="580" cy="260" r="2" fill="currentColor" />
        <circle cx="140" cy="400" r="1.5" fill="currentColor" />
        <circle cx="520" cy="410" r="2" fill="currentColor" />
      </g>

      {/* 2. 节点拓扑连接光路 (线条与发光路径) */}
      <g stroke="hsl(199, 89%, 48%)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4">
        {/* 左上 -> 中心 */}
        <path d="M190 120 L270 180" />
        {/* 右上 -> 中心 */}
        <path d="M470 110 L370 180" />
        {/* 左下 -> 中心 */}
        <path d="M170 330 L260 270" />
        {/* 右下 -> 中心 */}
        <path d="M480 340 L380 270" />
      </g>

      {/* 3. 中央核心主服务器机架 (Core Gateway & Process Manager) */}
      <g filter="url(#dropShadow)">
        {/* 底座与立架 */}
        <rect x="250" y="150" width="140" height="190" rx="16" fill="url(#serverGrad)" stroke="hsl(222, 30%, 28%)" strokeWidth="1.5" />
        
        {/* 服务器槽位 1 */}
        <rect x="264" y="168" width="112" height="34" rx="8" fill="hsl(222, 47%, 14%)" stroke="hsl(222, 30%, 26%)" strokeWidth="1" />
        <circle cx="280" cy="185" r="4" fill="hsl(142, 76%, 45%)" filter="url(#neonGlow)" />
        <circle cx="294" cy="185" r="3" fill="hsl(199, 89%, 48%)" />
        <rect x="310" y="181" width="52" height="3" rx="1.5" fill="hsl(215, 20%, 40%)" />
        <rect x="310" y="187" width="36" height="3" rx="1.5" fill="hsl(215, 20%, 30%)" />

        {/* 服务器槽位 2 (活跃数据流槽位) */}
        <rect x="264" y="210" width="112" height="34" rx="8" fill="hsl(222, 47%, 14%)" stroke="hsl(199, 89%, 48%)" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx="280" cy="227" r="4" fill="hsl(199, 89%, 48%)" filter="url(#neonGlow)" />
        <circle cx="294" cy="227" r="3" fill="hsl(142, 76%, 45%)" />
        {/* 动态脉冲条 */}
        <rect x="310" y="223" width="56" height="4" rx="2" fill="hsl(199, 89%, 48%)" fillOpacity="0.7" />
        <rect x="310" y="230" width="40" height="3" rx="1.5" fill="hsl(215, 20%, 35%)" />

        {/* 服务器槽位 3 */}
        <rect x="264" y="252" width="112" height="34" rx="8" fill="hsl(222, 47%, 14%)" stroke="hsl(222, 30%, 26%)" strokeWidth="1" />
        <circle cx="280" cy="269" r="4" fill="hsl(142, 76%, 45%)" filter="url(#neonGlow)" />
        <circle cx="294" cy="269" r="3" fill="hsl(38, 92%, 50%)" />
        <rect x="310" y="265" width="48" height="3" rx="1.5" fill="hsl(215, 20%, 40%)" />
        <rect x="310" y="271" width="30" height="3" rx="1.5" fill="hsl(215, 20%, 30%)" />

        {/* 底部散热网孔 */}
        <g fill="hsl(215, 20%, 30%)">
          <circle cx="284" cy="312" r="2" />
          <circle cx="296" cy="312" r="2" />
          <circle cx="308" cy="312" r="2" />
          <circle cx="320" cy="312" r="2" />
          <circle cx="332" cy="312" r="2" />
          <circle cx="344" cy="312" r="2" />
          <circle cx="356" cy="312" r="2" />
          <circle cx="290" cy="320" r="2" />
          <circle cx="302" cy="320" r="2" />
          <circle cx="314" cy="320" r="2" />
          <circle cx="326" cy="320" r="2" />
          <circle cx="338" cy="320" r="2" />
          <circle cx="350" cy="320" r="2" />
        </g>
      </g>

      {/* 4. 左上浮动卡片：Web 终端控制台 (Terminal Console) */}
      <g filter="url(#dropShadow)">
        <rect x="70" y="60" width="165" height="105" rx="12" fill="url(#cardGrad)" stroke="hsl(222, 30%, 32%)" strokeWidth="1.2" />
        {/* 终端顶栏红黄绿圆点 */}
        <circle cx="86" cy="74" r="3.5" fill="#ef4444" fillOpacity="0.8" />
        <circle cx="98" cy="74" r="3.5" fill="#f59e0b" fillOpacity="0.8" />
        <circle cx="110" cy="74" r="3.5" fill="#10b981" fillOpacity="0.8" />
        <line x1="70" y1="84" x2="235" y2="84" stroke="hsl(222, 30%, 25%)" strokeWidth="1" />
        {/* 终端代码行 */}
        <text x="84" y="103" fill="hsl(199, 89%, 60%)" fontSize="9" fontFamily="monospace" fontWeight="600">$ aluka start</text>
        <text x="84" y="118" fill="hsl(142, 76%, 55%)" fontSize="8.5" fontFamily="monospace">✓ cluster: ready</text>
        <text x="84" y="132" fill="hsl(215, 20%, 65%)" fontSize="8.5" fontFamily="monospace">⚡ tunnel port :18090</text>
        <rect x="84" y="142" width="6" height="9" fill="hsl(199, 89%, 48%)" opacity="0.8" />
      </g>

      {/* 5. 右上浮动卡片：微服务 / 多运行时管理 (JAR / Node / Python) */}
      <g filter="url(#dropShadow)">
        <rect x="420" y="55" width="155" height="100" rx="12" fill="url(#cardGrad)" stroke="hsl(199, 89%, 48%)" strokeOpacity="0.4" strokeWidth="1.2" />
        <g transform="translate(435, 70)">
          {/* 图标与标题 */}
          <rect x="0" y="0" width="22" height="22" rx="6" fill="url(#primaryGrad)" />
          <path d="M6 11 L11 16 L16 7" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="28" y="15" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="sans-serif">Services (8/8)</text>
          
          {/* 服务条目 1 */}
          <g transform="translate(0, 32)">
            <circle cx="4" cy="4" r="3" fill="hsl(142, 76%, 45%)" />
            <text x="12" y="7" fill="hsl(215, 20%, 80%)" fontSize="9.5" fontFamily="sans-serif">gateway-api</text>
            <text x="95" y="7" fill="hsl(199, 89%, 60%)" fontSize="8.5" fontFamily="monospace">PID 4820</text>
          </g>
          
          {/* 服务条目 2 */}
          <g transform="translate(0, 50)">
            <circle cx="4" cy="4" r="3" fill="hsl(142, 76%, 45%)" />
            <text x="12" y="7" fill="hsl(215, 20%, 80%)" fontSize="9.5" fontFamily="sans-serif">auth-service</text>
            <text x="95" y="7" fill="hsl(199, 89%, 60%)" fontSize="8.5" fontFamily="monospace">PID 6102</text>
          </g>
        </g>
      </g>

      {/* 6. 左下浮动卡片：反向 TCP 流量隧道 (Reverse Tunnel Mesh) */}
      <g filter="url(#dropShadow)">
        <rect x="65" y="280" width="165" height="95" rx="12" fill="url(#cardGrad)" stroke="hsl(222, 30%, 32%)" strokeWidth="1.2" />
        <g transform="translate(80, 295)">
          <rect x="0" y="0" width="22" height="22" rx="6" fill="hsl(222, 47%, 22%)" />
          <path d="M5 8 L11 8 M11 8 L9 6 M11 8 L9 10 M17 14 L11 14 M11 14 L13 12 M11 14 L13 16" stroke="hsl(199, 89%, 60%)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <text x="28" y="15" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="sans-serif">TCP Tunnel</text>
          
          <rect x="0" y="30" width="135" height="18" rx="5" fill="hsl(222, 47%, 12%)" />
          <text x="6" y="42" fill="hsl(215, 20%, 75%)" fontSize="8.5" fontFamily="monospace">:19090 ➔ agent-office</text>

          <rect x="0" y="52" width="70" height="14" rx="4" fill="hsl(142, 76%, 45%)" fillOpacity="0.15" />
          <text x="6" y="62" fill="hsl(142, 76%, 50%)" fontSize="8" fontWeight="600" fontFamily="sans-serif">● Active Stream</text>
        </g>
      </g>

      {/* 7. 右下浮动卡片：安全鉴权与访问防护 (Security & Shield) */}
      <g filter="url(#dropShadow)">
        <rect x="425" y="285" width="155" height="95" rx="12" fill="url(#cardGrad)" stroke="hsl(142, 76%, 45%)" strokeOpacity="0.4" strokeWidth="1.2" />
        <g transform="translate(440, 300)">
          {/* 安全盾牌 */}
          <rect x="0" y="0" width="22" height="22" rx="6" fill="url(#accentGrad)" />
          <path d="M11 4 L6 6.5 V11 C6 14.5 8.5 17 11 18 C13.5 17 16 14.5 16 11 V6.5 L11 4 Z" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M9 11 L10.5 12.5 L13.5 9.5" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="28" y="15" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="sans-serif">Security Guard</text>

          <text x="0" y="40" fill="hsl(215, 20%, 70%)" fontSize="9" fontFamily="sans-serif">JWT Token 隔离防护</text>
          <text x="0" y="54" fill="hsl(215, 20%, 70%)" fontSize="9" fontFamily="sans-serif">IP 白名单 / 黑名单拦截</text>

          <rect x="0" y="63" width="125" height="4" rx="2" fill="hsl(142, 76%, 45%)" fillOpacity="0.4" />
        </g>
      </g>

      {/* 8. 脉冲信号圆点粒子 */}
      <circle cx="230" cy="150" r="3" fill="hsl(199, 89%, 60%)" filter="url(#neonGlow)" />
      <circle cx="420" cy="145" r="3" fill="hsl(199, 89%, 60%)" filter="url(#neonGlow)" />
      <circle cx="215" cy="300" r="3" fill="hsl(142, 76%, 50%)" filter="url(#neonGlow)" />
      <circle cx="430" cy="310" r="3" fill="hsl(142, 76%, 50%)" filter="url(#neonGlow)" />
    </svg>
  );
}
