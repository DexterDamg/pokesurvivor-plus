/* PokéSurvivor+ — Living World AI · environment queries
 * Cheap, cached questions about the world: where is the nearest water / tree / rock / grass,
 * which liquid is this biome made of, what is the weather, which tiles were evaporated…
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const BLOCK = 8; // tiles per cache block side
  const liquidBlocks = new Map();
  const propCells = new Map();
  const dried = new Map(); // "tx,ty" → expiry time (Groudon's Drought)
  const SWIMMABLE = new Set(['water', 'swamp']);
  const fakeCam = { _x: 0, _y: 0, w: 0, h: 0, left() { return this._x; }, top() { return this._y; }, sees(x, y) { return x >= this._x && x <= this._x + this.w && y >= this._y && y <= this._y + this.h; } };

  function TS() { return AI.R.World.TS; }

  function liquidBlock(bx, by) {
    const key = bx + ',' + by;
    let b = liquidBlocks.get(key);
    if (b) return b;
    const W = AI.R.World;
    const ts = TS();
    b = [];
    for (let j = 0; j < BLOCK; j++)
      for (let i = 0; i < BLOCK; i++) {
        const tx = bx * BLOCK + i, ty = by * BLOCK + j;
        const x = tx * ts + ts / 2, y = ty * ts + ts / 2;
        if (W.kindAt(x, y) === 'liquid') b.push(x, y, tx, ty);
      }
    if (liquidBlocks.size > 900) liquidBlocks.delete(liquidBlocks.keys().next().value);
    liquidBlocks.set(key, b);
    return b;
  }

  function isDried(tx, ty) {
    const t = dried.get(tx + ',' + ty);
    if (t == null) return false;
    if (t < AI.time) { dried.delete(tx + ',' + ty); return false; }
    return true;
  }

  // nearest liquid tile center within maxR (px); swimOnly → only swimmable liquids that aren't evaporated
  function nearestLiquid(x, y, maxR = 420, swimOnly = false) {
    if (swimOnly && !SWIMMABLE.has(liquidKind())) return null;
    const span = TS() * BLOCK;
    const cbx = Math.floor(x / span), cby = Math.floor(y / span);
    const rings = Math.ceil(maxR / span);
    let best = null, bd = maxR * maxR;
    for (let ring = 0; ring <= rings; ring++) {
      for (let by = cby - ring; by <= cby + ring; by++)
        for (let bx = cbx - ring; bx <= cbx + ring; bx++) {
          if (Math.max(Math.abs(bx - cbx), Math.abs(by - cby)) !== ring) continue;
          const b = liquidBlock(bx, by);
          for (let k = 0; k < b.length; k += 4) {
            const d = U.dist2(x, y, b[k], b[k + 1]);
            if (d < bd && !(swimOnly && isDried(b[k + 2], b[k + 3]))) { bd = d; best = { x: b[k], y: b[k + 1], tx: b[k + 2], ty: b[k + 3], d: Math.sqrt(d) }; }
          }
        }
      if (best && best.d < ring * span) break; // nothing closer can exist in outer rings
    }
    return best;
  }

  function liquidTilesIn(x, y, r) {
    const out = [];
    const span = TS() * BLOCK;
    for (let by = Math.floor((y - r) / span); by <= Math.floor((y + r) / span); by++)
      for (let bx = Math.floor((x - r) / span); bx <= Math.floor((x + r) / span); bx++) {
        const b = liquidBlock(bx, by);
        for (let k = 0; k < b.length; k += 4) if (U.dist2(x, y, b[k], b[k + 1]) <= r * r) out.push({ x: b[k], y: b[k + 1], tx: b[k + 2], ty: b[k + 3] });
      }
    return out;
  }

  function props(x, y, r) {
    const cell = 192;
    const key = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.round(r / 64);
    let c = propCells.get(key);
    if (c && AI.time - c.t < 4) return c.list;
    fakeCam._x = Math.floor(x / cell) * cell + cell / 2 - r;
    fakeCam._y = Math.floor(y / cell) * cell + cell / 2 - r;
    fakeCam.w = fakeCam.h = r * 2;
    let list = [];
    try { list = AI.R.World.visibleProps(fakeCam).filter((p) => !(p.hp <= 0)); } catch (e) { AI.warn('props', e); }
    if (propCells.size > 300) propCells.delete(propCells.keys().next().value);
    propCells.set(key, { t: AI.time, list });
    return list;
  }

  // the trees within r of (x, y) (World.propsInCircle only returns destructible props: trees only once they can be broken, 64-breakables.js)
  const treeCam = { _x: 0, _y: 0, w: 0, h: 0, left() { return this._x; }, top() { return this._y; }, sees(x, y, m) { m = m || 0; return x >= this._x - m && x <= this._x + this.w + m && y >= this._y - m && y <= this._y + this.h + m; } };
  function treesIn(x, y, r) {
    treeCam._x = x - r; treeCam._y = y - r; treeCam.w = treeCam.h = r * 2;
    let list = [];
    try { list = AI.R.World.visibleProps(treeCam); } catch (e) { return []; }
    const out = [];
    for (const p of list) if (p.type === 'tree' && (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) <= r * r) out.push(p);
    return out;
  }
  function nearestProp(x, y, r, type, filter) {
    let best = null, bd = r * r;
    for (const p of props(x, y, r)) {
      if (p.type !== type || (filter && !filter(p))) continue;
      const d = U.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function liquidKind() { try { return AI.R.World.liquidKind(); } catch (e) { return 'water'; } }

  function weather() {
    const W = AI.R.Weather;
    if (!W) return null;
    const w = typeof W.current === 'function' ? W.current() : W.current;
    if (!w) return null;
    return typeof w === 'string' ? w : w.id || w.kind || w.key || null;
  }

  AI.define('Env', {
    treesIn,
    SWIMMABLE,
    TS,
    liquidKind,
    weather,
    biome() { const W = AI.R.World; return typeof W.biome === 'number' ? W.biome : 0; },
    isLiquid(x, y) { return AI.R.World.isLiquid(x, y); },
    isWater(x, y) {
      const W = AI.R.World;
      if (!W.isLiquid(x, y) || !SWIMMABLE.has(liquidKind())) return false;
      const ts = TS();
      return !isDried(Math.floor(x / ts), Math.floor(y / ts));
    },
    hurtsIn(types) { const f = AI.R.World.liquidEffect(types); return !!(f && f.dmg); },
    nearestLiquid,
    nearestWater: (x, y, r) => nearestLiquid(x, y, r, true),
    liquidTilesIn,
    props,
    nearestProp,
    canopy(x, y) { try { return AI.R.World.underCanopy(x, y); } catch (e) { return false; } },
    free(x, y, r = 12) { return AI.R.World.isFree(x, y, r); },
    dry(tx, ty, dur) { dried.set(tx + ',' + ty, AI.time + dur); },
    isDried,
    driedTiles: dried,
    reset() { liquidBlocks.clear(); propCells.clear(); dried.clear(); },
  });
})();
