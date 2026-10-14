import { useEffect, useId, useRef } from 'react';
import { useChimeAnimationSession } from './chimeAnimationSession';
import { getCuckooAnimation } from './cuckooAnimation';
import type { ChimeAnimation } from './clockMode';

const birdhouseWidthTransform = 'translate(200 0) scale(1.2 1) translate(-200 0)';

type CuckooClockProps = {
  time: Date;
  chimeAnimation: ChimeAnimation | null;
};

export function CuckooClock({ time, chimeAnimation }: CuckooClockProps) {
  const identifier = useId();
  const leftDoorRef = useRef<SVGGElement>(null);
  const rightDoorRef = useRef<SVGGElement>(null);
  const birdRef = useRef<SVGGElement>(null);
  const dancersRef = useRef<SVGGElement>(null);
  const sequenceRef = useChimeAnimationSession(chimeAnimation);
  const seconds = time.getSeconds();
  const minutes = time.getMinutes() + seconds / 60;
  const hours = time.getHours() % 12 + minutes / 60;

  useEffect(() => {
    let animationFrame = 0;
    function draw() {
      const sequence = sequenceRef.current;
      const state = getCuckooAnimation(
        sequence ? performance.now() - sequence.startedAtMilliseconds : 0,
        sequence?.strikes ?? 0,
        sequence?.strikeOffsetsMilliseconds,
      );
      const opening = Math.sin(state.doorRotation);
      const width = Math.cos(state.doorRotation) - opening * 0.5;
      leftDoorRef.current?.setAttribute('transform', `translate(172 127) matrix(${width} ${opening * 0.18} 0 1 0 0)`);
      rightDoorRef.current?.setAttribute('transform', `translate(228 127) matrix(${width} ${-opening * 0.18} 0 1 0 0)`);
      birdRef.current?.setAttribute('opacity', String(state.birdOffset));
      dancersRef.current?.setAttribute('data-dancing', String(state.active));
      birdRef.current?.setAttribute('transform', `translate(200 ${150 + state.birdOffset * 12}) scale(${0.65 + state.birdOffset * 0.35})`);
      if (state.active) animationFrame = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [chimeAnimation, sequenceRef]);

  return (
    <svg
      data-testid="cuckoo-clock"
      role="img"
      aria-label={`Cuckoo clock showing ${time.toLocaleTimeString()}`}
      viewBox="0 0 400 582"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id={`${identifier}-wood`} x1="0" y1="0" x2="1" y2="0.25">
          <stop stopColor="#54301a" />
          <stop offset="0.28" stopColor="#97562b" />
          <stop offset="0.6" stopColor="#824420" />
          <stop offset="1" stopColor="#4b2918" />
        </linearGradient>
        <linearGradient id={`${identifier}-trim`} x1="0" y1="0" x2="0.3" y2="1">
          <stop stopColor="#b57742" />
          <stop offset="0.45" stopColor="#8d4e26" />
          <stop offset="0.8" stopColor="#693719" />
          <stop offset="1" stopColor="#a66b37" />
        </linearGradient>
        <linearGradient id={`${identifier}-door`} x2="1" y2="0">
          <stop stopColor="#6a381c" />
          <stop offset="0.35" stopColor="#a96c38" />
          <stop offset="1" stopColor="#80502a" />
        </linearGradient>
        <radialGradient id={`${identifier}-dial`}>
          <stop stopColor="#343330" />
          <stop offset="1" stopColor="#111211" />
        </radialGradient>
        <pattern id={`${identifier}-boards`} width="220" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 1 H220" stroke="#2f190f" strokeOpacity="0.6" />
          <path d="M0 3 H220 M12 9 Q57 5 101 9 T211 9" fill="none" stroke="#e1ac70" strokeOpacity="0.16" />
          <path d="M0 12 Q43 8 96 12 T220 12" fill="none" stroke="#29180f" strokeOpacity="0.25" />
        </pattern>
        <pattern id={`${identifier}-grain`} width="17" height="120" patternUnits="userSpaceOnUse">
          <path d="M3 0 Q9 28 3 60 T3 120 M12 0 Q6 42 12 75 T12 120" fill="none" stroke="#21140e" strokeOpacity="0.28" />
          <path d="M5 0 Q11 28 5 60 T5 120" fill="none" stroke="#e1ac70" strokeOpacity="0.15" />
        </pattern>
        <filter id={`${identifier}-shadow`} x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity="0.22" />
        </filter>
      </defs>

      <g filter={`url(#${identifier}-shadow)`}>
        <g transform={birdhouseWidthTransform}>
          <path d="M105 210 L200 65 L295 210 V347 H105 Z" fill={`url(#${identifier}-wood)`} stroke="#482616" strokeWidth="3" />
          <path d="M105 210 L200 65 L295 210 V347 H105 Z" fill={`url(#${identifier}-boards)`} />
          <path d="M91 214 L200 51 L309 214 L293 234 Q282 237 279 218 Q265 228 260 205 Q245 211 241 189 Q228 194 224 173 Q211 176 200 149 Q189 176 176 173 Q172 194 159 189 Q155 211 140 205 Q135 228 121 218 Q118 237 107 234 Z" fill="#4b2816" />
          <path d="M91 214 L200 51 L309 214 L293 234 Q282 237 279 218 Q265 228 260 205 Q245 211 241 189 Q228 194 224 173 Q211 176 200 149 Q189 176 176 173 Q172 194 159 189 Q155 211 140 205 Q135 228 121 218 Q118 237 107 234 Z" fill={`url(#${identifier}-grain)`} />

          <path d="M48 222 L200 24 L352 222 L336 234 Q325 240 317 222 Q300 224 297 203 Q279 205 277 182 Q258 185 257 161 Q238 166 236 143 Q216 147 214 120 Q202 122 200 104 Q198 122 186 120 Q184 147 164 143 Q162 166 143 161 Q142 185 123 182 Q121 205 103 203 Q100 224 83 222 Q75 240 64 234 Z" fill={`url(#${identifier}-trim)`} stroke="#65371d" strokeWidth="2" />
          <path d="M62 220 L200 41 L338 220 M73 216 Q92 210 98 190 T123 158 M131 149 Q150 139 155 119 T180 86 M220 86 Q245 109 245 119 T269 149 M277 158 Q301 183 302 190 T327 216" fill="none" stroke="#d39b5f" strokeWidth="2" strokeOpacity="0.65" />
          <path d="M75 225 Q96 213 103 192 M134 156 Q153 143 161 122 M225 88 Q242 99 254 123 M282 166 Q304 184 312 207" fill="none" stroke="#442513" strokeWidth="3" strokeLinecap="round" />
        </g>

        <path d="M164 185 V135 Q164 112 200 111 Q236 112 236 135 V185 Z" fill="#472619" stroke="#aa703e" strokeWidth="2" />
        <path d="M172 181 V133 Q172 120 200 119 Q228 120 228 133 V181 Z" fill="#17120f" />
        <path d="M162 184 H238 V191 H162 Z" fill={`url(#${identifier}-trim)`} stroke="#402315" />

        <circle cx="200" cy="265" r="62" fill="#251b15" stroke="#3c2315" strokeWidth="4" />
        <circle cx="200" cy="265" r="59" fill={`url(#${identifier}-dial)`} stroke="#efece2" strokeWidth="2" />
        <circle cx="200" cy="265" r="36" fill="none" stroke="#bfbeb5" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index + 1) * Math.PI / 6;
          return <text key={index} x={200 + Math.sin(angle) * 47} y={265 - Math.cos(angle) * 47} dy="0.34em" fill="#f9f7ed" fontFamily="'Atkinson Hyperlegible Next', sans-serif" fontSize="20" fontWeight="600" textAnchor="middle">{index + 1}</text>;
        })}
        <g fill="#f7f4e9" stroke="#f7f4e9" strokeLinejoin="round">
          <path data-testid="cuckoo-hour-hand" d="M198 272 L197 253 Q190 246 196 242 L200 235 L204 242 Q210 246 203 253 L202 272 Z" transform={`rotate(${hours * 30} 200 265)`} />
          <path data-testid="cuckoo-minute-hand" d="M199 274 L197 239 Q191 234 198 229 L200 218 L202 229 Q209 234 203 239 L201 274 Z" transform={`rotate(${minutes * 6} 200 265)`} />
          <path data-testid="cuckoo-second-hand" d="M200 276 V223" fill="none" stroke="#ef6a59" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${seconds * 6} 200 265)`} />
          <circle cx="200" cy="265" r="4" />
        </g>

        <path transform={birdhouseWidthTransform} d="M105 326 H295 V407 H105 Z" fill={`url(#${identifier}-wood)`} stroke="#482616" strokeWidth="2" />
        <path transform={birdhouseWidthTransform} d="M126 395 V350 Q126 333 157 333 Q188 333 188 350 V395 Z M212 395 V350 Q212 333 243 333 Q274 333 274 350 V395 Z" fill="#281b14" stroke="#a97545" strokeWidth="2" />
        <g ref={dancersRef} data-testid="cuckoo-dancers" data-dancing="false">
          {[148, 252].map((position, index) => (
            <g key={position} transform={`translate(${position} 391)`}>
              <ellipse cy="1" rx="18" ry="4" fill="#181a15" stroke="#8e7e50" />
              <g className="cuckoo-dancer" style={{ animationDelay: `${index * -0.6}s` }}>
                <path d="M-8 -9 L-9 0 H-2 L-1 -9 M3 -9 L4 0 H11 L9 -9" fill="#493526" />
                {index === 0 ? (
                  <>
                    <path d="M-6 -32 Q-11 -22 -16 -7 Q0 -1 16 -7 L7 -32 Z" fill="#c5ad77" stroke="#6b583c" />
                    <path d="M-3 -28 L-7 -7 H10 L4 -28 Z" fill="#f0dfb7" />
                    <path d="M-7 -37 H7 L9 -23 H-9 Z" fill="#6c8b89" stroke="#e8d4a8" />
                  </>
                ) : (
                  <>
                    <path d="M-9 -23 L-10 -7 H-1 L0 -18 L3 -7 H12 L9 -23 Z" fill="#675540" />
                    <path d="M-8 -37 H8 L11 -20 H-11 Z" fill="#9f593f" stroke="#47362a" />
                    <path d="M-3 -36 H3 V-22 H-3 Z" fill="#eee2c4" />
                  </>
                )}
                <path d="M-8 -33 Q-19 -27 -9 -24 L3 -31 M8 -33 Q18 -27 8 -24 L-3 -31" fill="none" stroke="#e3c299" strokeWidth="4" strokeLinecap="round" />
                <path d="M-3 -37 V-41 H3 V-37" stroke="#d6ad80" strokeWidth="4" />
                <ellipse cy="-45" rx="7" ry="9" fill="#e3c299" stroke="#a5784e" />
                <path d="M-7 -46 Q-9 -58 3 -55 Q11 -53 7 -45 L4 -51 L-3 -50 Z" fill={index === 0 ? '#b79453' : '#745238'} />
                {index === 0 && <path d="M-7 -49 Q-12 -40 -7 -34" fill="none" stroke="#b79453" strokeWidth="4" />}
                <path d="M-3 -44 H-2 M3 -44 H4" stroke="#493a2c" strokeWidth="1.5" />
                <path d="M-2 -40 Q0 -39 2 -40" fill="none" stroke="#ad795b" />
              </g>
            </g>
          ))}
        </g>
        <g transform={birdhouseWidthTransform}>
          <path d="M113 392 H287 V405 H113 Z" fill={`url(#${identifier}-trim)`} stroke="#50301d" strokeWidth="2" />
          {[125, 150, 175, 200, 225, 250, 275].map(position => <path key={position} d={`M${position} 394 V405`} stroke="#dfb278" strokeWidth="5" />)}
        </g>
        <g transform="translate(0 62)">
          <g transform={birdhouseWidthTransform}>
            <path d="M104 347 L82 367 L121 380 L125 390 L200 380 L275 390 L279 380 L318 367 L296 347 Z" fill={`url(#${identifier}-wood)`} stroke="#3d2417" strokeWidth="3" />
            <path d="M97 356 Q135 347 165 357 T220 357 T303 356 M121 376 L200 369 L279 376" fill="none" stroke="#b97d45" strokeOpacity="0.5" strokeWidth="2" />
            <path d="M77 341 Q94 334 106 343 H294 Q306 334 323 341 L330 356 L323 368 Q310 373 295 363 H105 Q89 373 77 368 L70 356 Z" fill={`url(#${identifier}-trim)`} stroke="#573019" strokeWidth="2" />
            <path d="M92 346 Q138 341 181 347 T304 346 M105 360 Q150 353 194 360 T295 359" fill="none" stroke="#d39960" strokeWidth="2" strokeOpacity="0.55" />
            {[99, 137, 263, 301].map((position) => <path key={position} d={`M${position - 5} 339 L${position} 335 L${position + 6} 341 V366 L${position} 371 L${position - 5} 367 Z`} fill={`url(#${identifier}-trim)`} stroke="#5c3019" strokeWidth="2" />)}
          </g>
          <g className="cuckoo-pendulum">
            <path d="M200 382 V443" stroke="#4c2b18" strokeWidth="8" />
            <path d="M181 431 H219 V448 L228 497 L200 512 L172 497 L181 448 Z" fill={`url(#${identifier}-wood)`} stroke="#4b2916" strokeWidth="2" />
            <path d="M181 448 L172 497 L200 512 L228 497 L219 448 Z" fill={`url(#${identifier}-grain)`} />
            <path d="M173 442 H227 V455 H173 Z" fill={`url(#${identifier}-trim)`} stroke="#482717" strokeWidth="2" />
          </g>
        </g>
      </g>

      <g ref={birdRef} data-testid="cuckoo-bird" opacity="0" transform="translate(200 150) scale(0.65)">
        <path d="M-6 15 L-9 27 L0 23 L9 27 L6 15 Z" fill="#8d7350" stroke="#59452e" />
        <ellipse cy="5" rx="11" ry="17" fill="#ead9ac" stroke="#b69b6c" />
        <path d="M-7 -4 Q-18 1 -14 17 Q-6 15 -4 3 M7 -4 Q18 1 14 17 Q6 15 4 3" fill="#b39a68" stroke="#79633f" />
        <path d="M-12 3 L-11 12 M12 3 L11 12" stroke="#dfc991" strokeWidth="2" />
        <ellipse cy="-13" rx="8" ry="11" fill="#f1e1b8" stroke="#c6ac78" />
        <path d="M-3 -12 L0 -6 L3 -12 Z" fill="#725435" />
        <circle cx="-4" cy="-15" r="1.3" fill="#29221a" />
        <circle cx="4" cy="-15" r="1.3" fill="#29221a" />
        <path d="M-3 21 V27 M4 21 V27" stroke="#aa8b58" strokeWidth="2" />
        <path d="M-12 28 H13" stroke="#a27342" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g ref={leftDoorRef} data-testid="cuckoo-left-door" transform="translate(172 127)">
        <path d="M0 53 V5 L8 0 H28 V53 Z" fill={`url(#${identifier}-door)`} stroke="#ce9b65" strokeWidth="1.5" />
        <path d="M4 49 V8 L10 4 H24 V49 Z M4 18 H24 M4 32 H24 M15 4 V49" fill="none" stroke="#50301c" />
        <path d="M5 19 H23 M5 33 H23" stroke="#c28a51" />
        <path d="M0 14 H4 M0 42 H4" stroke="#cfb180" strokeWidth="2" />
        <circle cx="23" cy="28" r="1.6" fill="#cfc2a6" />
      </g>
      <g ref={rightDoorRef} data-testid="cuckoo-right-door" transform="translate(228 127)">
        <path d="M0 53 V5 L-8 0 H-28 V53 Z" fill={`url(#${identifier}-door)`} stroke="#ce9b65" strokeWidth="1.5" />
        <path d="M-4 49 V8 L-10 4 H-24 V49 Z M-4 18 H-24 M-4 32 H-24 M-15 4 V49" fill="none" stroke="#50301c" />
        <path d="M-5 19 H-23 M-5 33 H-23" stroke="#c28a51" />
        <path d="M0 14 H-4 M0 42 H-4" stroke="#cfb180" strokeWidth="2" />
        <circle cx="-23" cy="28" r="1.6" fill="#cfc2a6" />
      </g>
    </svg>
  );
}
