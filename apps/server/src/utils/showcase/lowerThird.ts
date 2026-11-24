// Adapted from HeyGen HyperFrames · Lower Third — Kicker Name.
// Source: assets/video-blocks/registry-blocks/lt-kicker-name/lt-kicker-name.html
// https://github.com/heygen-com/hyperframes/tree/main/registry/blocks/lt-kicker-name
export const lowerThird = { seconds: 4.8, width: 1920, height: 1080, fps: 30 };

export const lowerThirdEffectIds = ["lt-kicker-name", "lt-bold-block"] as const;
export type LowerThirdEffectId = typeof lowerThirdEffectIds[number];

// Bold Block adapts assets/video-blocks/registry-blocks/lt-bold-block/lt-bold-block.html (HeyGen HyperFrames).
export function lowerThirdHtml({ kicker, name }: { kicker: string; name: string }, effectId: LowerThirdEffectId) {
  const bold = effectId === "lt-bold-block";
  // Caller values are only assigned as text. Escaping '<' also protects the inline script boundary.
  const text = JSON.stringify([kicker, name]).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="source" content="https://github.com/heygen-com/hyperframes/tree/main/registry/blocks/${effectId}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: transparent; overflow: hidden; }
    #stage { position: relative; width: ${lowerThird.width}px; height: ${lowerThird.height}px; }
    #lowerThird {
      position: absolute; left: 130px; bottom: 122px; max-width: calc(100% - 260px);
      display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
      text-transform: uppercase; white-space: nowrap;
    }
    .kickerWrap { overflow: hidden; max-width: 100%; }
    #kicker {
      display: block; padding: 6px 14px; background: #46e5b7; color: #141518;
      font: 700 22px "Space Mono", monospace; letter-spacing: .1em;
    }
    #name {
      max-width: 100%; overflow: hidden; text-overflow: ellipsis; color: #fff;
      font: 900 70px/.98 "Archivo Black", system-ui, sans-serif;
      letter-spacing: -.015em; text-shadow: 0 2px 22px rgba(0, 0, 0, .5);
    }
    #baseline { width: 100%; height: 5px; background: #46e5b7; border-radius: 3px; transform-origin: left; }
    .bold #lowerThird { left: 120px; bottom: 116px; background: #141518; padding: 18px 34px 22px 30px; gap: 12px; }
    .bold #name { order: -1; font-size: 58px; text-shadow: none; }
    .bold #kicker { background: #ffd23f; font-size: 24px; padding: 7px 16px; }
    .bold #baseline { display: none; }
  </style>
</head>
<body${bold ? ' class="bold"' : ""}>
  <div id="stage"><div id="lowerThird">
    <div class="kickerWrap"><span id="kicker" dir="auto"></span></div>
    <div id="name" dir="auto"></div>
    <div id="baseline"></div>
  </div></div>
  <script>
    const wrap = document.getElementById("lowerThird");
    const kicker = document.getElementById("kicker");
    const name = document.getElementById("name");
    const baseline = document.getElementById("baseline");
    [kicker.textContent, name.textContent] = ${text};

    const progress = (time, start, duration) => Math.max(0, Math.min(1, (time - start) / duration));
    const backOut = (p, overshoot) => 1 + (overshoot + 1) * (p - 1) ** 3 + overshoot * (p - 1) ** 2;
    window.renderFrame = (time) => {
      if (${bold}) {
        const blockIn = 1 - (1 - progress(time, .1, .5)) ** 5;
        const blockOut = progress(time, 4.3, .4) ** 3;
        wrap.style.clipPath = "inset(0 " + (100 * (1 - blockIn)) + "% 0 " + (100 * blockOut) + "%)";
        const nameIn = progress(time, .26, .42);
        name.style.transform = "translateY(" + (30 * (1 - backOut(nameIn, 1.6))) + "px)";
        name.style.opacity = nameIn;
        kicker.style.transform = "translateY(" + (40 * (1 - backOut(progress(time, .5, .45), 2))) + "px)";
        wrap.style.visibility = time < 4.75 ? "visible" : "hidden";
        return;
      }
      const kickerIn = backOut(progress(time, .1, .42), 2);
      const kickerOut = progress(time, 4.32, .3) ** 3;
      const nameIn = backOut(progress(time, .32, .45), 1.5);
      const nameOut = progress(time, 4.3, .32) ** 3;
      const lineIn = 1 - (1 - progress(time, .5, .5)) ** 5;
      const lineOut = progress(time, 4.25, .3) ** 3;

      kicker.style.transform = "translateY(" + (-40 * (1 - kickerIn + kickerOut)) + "px)";
      name.style.transform = "translateY(" + (34 * (1 - nameIn) - 16 * nameOut) + "px)";
      name.style.opacity = Math.min(1, nameIn) * (1 - nameOut);
      baseline.style.transform = "scaleX(" + lineIn * (1 - lineOut) + ")";
      wrap.style.visibility = time >= 0 && time < 4.75 ? "visible" : "hidden";
    };
    window.renderFrame(0);
  </script>
</body>
</html>`;
}
