// @ts-nocheck
/* eslint-disable */
/**
 * Starblast asteroid map generator.
 * Algorithm extracted from the public Starblast source (ripped by Bhpsngum).
 * Pure math — no DOM, no network, no side effects.
 */

// Exact permutation table from the game source (must match for identical maps).
const T = [670,243,963,607,432,29,624,809,254,752,691,904,275,984,586,94,1014,614,252,178,488,954,55,836,186,858,719,562,685,898,167,844,639,505,85,386,520,988,561,889,91,329,900,847,334,531,168,57,789,529,259,323,313,72,153,606,694,442,547,922,242,983,965,876,39,728,383,109,343,810,815,144,457,434,221,279,328,136,674,556,502,896,582,250,665,370,926,912,118,543,365,467,311,700,15,297,609,731,476,634,715,777,62,1007,525,942,310,627,630,448,437,822,300,339,924,583,92,800,698,312,542,740,271,778,895,447,175,957,17,481,347,283,366,277,843,966,927,535,503,234,746,712,1010,544,671,295,978,729,997,287,621,782,160,433,537,121,413,304,98,657,498,946,319,595,191,341,554,523,274,209,435,644,947,979,397,261,681,786,1006,565,472,180,318,126,874,693,526,276,340,808,884,409,486,962,960,772,901,690,359,837,129,363,509,616,88,382,730,513,623,999,504,48,4,384,281,560,417,99,773,956,943,496,558,218,170,471,536,138,19,266,6,868,845,16,985,866,601,445,458,894,950,349,1017,125,495,723,446,647,834,880,272,475,483,227,357,750,851,139,406,336,158,284,482,324,991,632,587,663,74,256,541,120,801,831,46,522,589,1,571,368,137,761,885,968,982,948,785,391,840,932,829,117,641,466,367,688,733,229,735,14,205,31,316,333,183,521,795,58,1021,282,794,939,40,394,793,1002,763,212,484,133,260,465,396,769,518,955,497,377,145,508,514,224,196,454,176,975,865,1005,1023,986,596,426,893,551,90,130,873,22,709,686,436,236,661,579,764,362,141,112,970,987,12,317,369,26,344,66,803,493,716,9,637,945,225,703,78,346,751,123,1009,1016,27,52,864,902,921,292,314,599,799,263,626,338,953,491,892,353,692,917,540,882,677,744,633,821,327,60,1020,928,788,360,414,430,462,824,820,727,398,342,273,726,981,84,82,206,388,720,806,652,550,238,159,134,732,897,500,881,805,814,701,717,566,7,211,604,816,56,658,107,61,374,320,501,13,642,863,791,438,348,97,214,86,305,875,656,24,364,767,156,879,590,734,920,655,577,83,584,660,38,100,299,580,990,636,944,463,766,996,714,8,515,87,198,280,444,131,404,108,278,487,223,598,410,395,199,268,989,75,195,760,916,977,421,11,1000,813,216,817,823,164,668,739,572,30,707,798,291,564,77,456,478,68,643,615,172,841,672,919,1012,613,385,980,711,771,682,232,765,143,620,631,861,468,622,201,325,424,189,608,403,775,646,673,1013,400,859,838,345,210,860,65,63,34,755,161,479,235,783,460,826,507,854,839,666,802,441,114,443,738,770,929,857,907,741,935,949,322,995,217,667,269,184,650,1018,506,290,787,459,721,828,567,222,494,142,743,405,76,722,588,147,899,270,695,597,337,155,569,679,853,450,21,517,197,371,257,380,244,553,952,381,827,524,877,702,306,600,1011,431,781,594,387,1019,411,533,659,177,725,930,933,832,41,2,687,1008,439,307,891,871,415,651,308,298,811,0,194,592,241,918,18,973,110,654,967,490,683,914,128,992,964,122,230,149,289,392,416,852,936,262,102,938,511,255,510,165,105,419,958,294,379,49,699,330,593,539,710,106,79,440,200,704,961,326,321,759,193,890,44,549,913,776,909,552,972,132,429,748,532,115,888,635,842,649,747,807,887,856,784,148,530,116,157,372,754,28,581,67,187,202,818,181,45,959,146,124,994,872,675,706,253,247,625,570,152,423,185,361,849,971,546,412,830,1022,188,850,140,220,451,219,768,1015,455,780,976,449,969,848,293,249,59,390,512,538,578,906,819,862,974,33,911,135,908,248,401,951,527,169,676,640,1003,591,103,37,285,684,104,163,753,1004,934,645,470,774,20,489,228,461,492,469,998,296,233,869,605,315,36,5,425,878,617,886,23,355,993,93,473,555,474,464,937,925,1001,611,35,812,174,53,286,680,267,428,335,883,653,69,718,585,749,150,408,393,915,576,664,629,756,402,638,602,245,43,545,213,303,192,70,453,910,407,742,111,548,835,452,575,903,619,376,154,302,151,804,867,574,563,239,648,179,855,378,618,264,669,427,354,399,265,50,796,166,923,825,697,534,54,173,870,792,162,713,246,89,51,350,705,251,557,237,240,736,689,203,519,73,81,628,288,331,204,528,480,389,32,418,573,757,358,215,226,42,779,231,171,190,612,301,762,708,420,846,208,485,351,790,737,10,258,309,797,127,516,559,499,352,71,758,25,568,113,3,610,101,375,96,603,745,64,80,477,332,833,940,373,905,422,182,356,941,47,119,662,931,696,95,724,678,207]

// Double the table (the game does this for wraparound indexing)
const PERM = [...T, ...T]

const MASK = 1023
const NORM = 1 / 1023
const COS3 = Math.cos(0.3)
const SIN3 = Math.sin(0.3)

// Smoothstep interpolation (exactly as in game source)
function smooth(a, b, t) { const s = (-2*t+3)*t*t; return a*(1-s)+b*s }

// 2D Perlin noise sample using permutation table with seed offsets
function sample2d(i1, i2, x, y) {
  const xi = Math.floor(x) & MASK
  const yi = Math.floor(y) & MASK
  const fx = x - Math.floor(x)
  const fy = y - Math.floor(y)
  const ll = PERM[i1 + PERM[xi +   PERM[yi   + i2]]]
  const lr = PERM[i1 + PERM[xi+1 + PERM[yi   + i2]]]
  const ul = PERM[i1 + PERM[xi +   PERM[yi+1 + i2]]]
  const ur = PERM[i1 + PERM[xi+1 + PERM[yi+1 + i2]]]
  return smooth(smooth(ll, lr, fx), smooth(ul, ur, fx), fy) * NORM
}

// Fractal Brownian Motion with rotation (as in game source)
function fbm2d(i1, i2, x, y, octaves, persist, lacunarity) {
  let val = 0, amp = 1, total = 0
  for (let k = 0; k < octaves; k++) {
    val += sample2d(i1, i2, x, y) * amp
    total += amp
    amp *= persist
    const nx = lacunarity * (x*COS3 + y*SIN3)
    const ny = lacunarity * (y*COS3 - x*SIN3)
    x = nx; y = ny
  }
  return val / total
}

// Periodic tiled fBm (bilinear across tile corners)
function periodicFbm2d(i1, i2, x, y, period, octaves) {
  const px = Math.floor(x / period)
  const py = Math.floor(y / period)
  const rx = x / period - px
  const ry = y / period - py
  const p = period, oct = octaves, per = 0.5, lac = 1.9
  const c00 = fbm2d(i1,i2, rx*p,     ry*p,     oct,per,lac)
  const c10 = fbm2d(i1,i2, rx*p+p,   ry*p,     oct,per,lac)
  const c01 = fbm2d(i1,i2, rx*p,     ry*p+p,   oct,per,lac)
  const c11 = fbm2d(i1,i2, rx*p+p,   ry*p+p,   oct,per,lac)
  return smooth(smooth(c00, c10, 1-rx), smooth(c01, c11, 1-rx), 1-ry)
}

// Linear congruential generator (same constants as game source)
function lcg(state, a, c, mask) { return (state*a + c) & mask }

// Mode density modifiers
const MODES = {
  team: {
    options: { teams: [1,1] },
    asteroidsDensityModifier(nx, ny) {
      const r = Math.sqrt(nx*nx + ny*ny)
      return Math.abs(r - 0.5*Math.SQRT2) < 0.15 ? 0 : 1
    }
  },
  survival: {
    options: {},
    asteroidsDensityModifier() { return 1 }
  },
  deathmatch: {
    options: {},
    asteroidsDensityModifier() { return 1 }
  },
  invasion: {
    options: {},
    asteroidsDensityModifier() { return 1 }
  }
}

export function getMap(mapID, mapSize, mode) {
  const edge = mapSize / 2

  // --- Init LCG (same as lO1ll class) ---
  const A = 13971, C = 12345, MOD = (1<<30)-1, INV = 1/(1<<30)
  let seed = mapID < 1 ? Math.floor(mapID * (1<<30)) : Math.floor(mapID)
  // advance 3 times (as in game constructor)
  seed = lcg(seed,A,C,MOD); seed = lcg(seed,A,C,MOD); seed = lcg(seed,A,C,MOD)

  // --- Init map generator state (same as llOO1 constructor) ---
  seed = lcg(seed,A,C,MOD); const xmul = 1e5 * (seed*INV)
  seed = lcg(seed,A,C,MOD); const ymul = 1e5 * (seed*INV)
  seed = lcg(seed,A,C,MOD); const octaves = 1 + Math.floor(seed*INV*8)  // 1..8
  seed = lcg(seed,A,C,MOD); const fx = (2 + 8*(seed*INV)) / (2*edge)
  seed = lcg(seed,A,C,MOD); const fy = (2 + 8*(seed*INV)) / (2*edge)
  seed = lcg(seed,A,C,MOD); const noiseSeed = seed*INV

  // --- Init Perlin noise (same as II0I0 constructor) ---
  let ns = noiseSeed < 1 ? Math.floor(noiseSeed * (1<<30)) : Math.floor(noiseSeed)
  const ni1 = ns & MASK
  const ni2 = (ns >> 10) & MASK

  const mapMode = MODES[mode] || MODES.survival
  const mapSz = 2 * edge

  const grid = Array.from({length: mapSize}, () => new Array(mapSize).fill(0))
  const f = {}

  for (let gx = -edge; gx < edge; gx++) {
    for (let gy = -edge; gy < edge; gy++) {
      // Deterministic per-cell RNG (same as llOO1.get)
      let r = (gx * xmul + gy * ymul)
      r = lcg(r,A,C,MOD); r = lcg(r,A,C,MOD); r = lcg(r,A,C,MOD)

      const dist = Math.sqrt((gx*gx + gy*gy) / (edge*edge))
      let density = dist > 1 ? 0.5 : 0.5 * Math.pow(dist, 5)
      density = density*0.5 + 0.5*(periodicFbm2d(ni1, ni2,
        (gx+edge)*fx, (gy+edge)*fy, octaves, 3) - 0.5)
      density = Math.max(4/mapSz, density)

      if (mapMode) {
        density *= mapMode.asteroidsDensityModifier(2*gx/mapSz, 2*gy/mapSz)
      }

      r = lcg(r,A,C,MOD)
      if (r * INV < density) {
        r = lcg(r,A,C,MOD); const sz = 0.1 + 0.5*(r*INV)
        r = lcg(r,A,C,MOD); let lx = r*INV
        r = lcg(r,A,C,MOD); let ly = r*INV
        lx = lx>0.5 ? 0.5*Math.pow(2*(lx-0.5),0.1)+0.5 : 0.5-0.5*Math.pow(2*(0.5-lx),0.1)
        ly = ly>0.5 ? 0.5*Math.pow(2*(ly-0.5),0.1)+0.5 : 0.5-0.5*Math.pow(2*(0.5-ly),0.1)
        const ax = gx + sz + lx*(1-2*sz)
        const ay = gy + sz + ly*(1-2*sz)
        const row = Math.trunc(edge - ay - 0.1)
        const col = Math.trunc(ax + edge)
        if (row >= 0 && row < mapSize && col >= 0 && col < mapSize) {
          grid[row][col] = Math.max(1, Math.min(9, Math.round(sz*100/6)))
        }
      }
    }
  }
  return grid.map(row => row.join('')).join('\n')
}
