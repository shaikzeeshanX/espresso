/* eslint-disable */
// Cookie Breeze — Originkit

"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import { animate } from "framer-motion"
import type { AnimationPlaybackControls, Transition, ValueAnimationTransition } from "framer-motion"

// Next.js adaptation: the original targets Framer/Originkit (`framer` package).
// Stub the two Framer-only APIs so the component runs standalone on the web.
const RenderTarget = {
    canvas: "canvas",
    current: () => "web",
}

/**
 * CookieBreeze — a photographic background of bakery cookies drifting
 * through a soft studio, tumbling slowly, at many depths: a few huge and
 * out of focus close to the lens, a band of crisp ones at the focus plane,
 * and a field of small soft ones far behind. Cookies morph from one flavour
 * to the next (classic, double chocolate, red velvet, matcha by default) —
 * on a loop that sweeps, ripples or scatters across the frame, and on a tap
 * that ripples out from the finger. The morph is a Bloom (the new dough
 * spreads from a point in tendrils behind a raised, glowing caramel front,
 * sugar sizzling along it and a wet sheen in its wake), a Marble (the two
 * doughs swirl through each other and settle) or a Flip (the cookie
 * somersaults and lands as the new flavour).
 *
 * Built from a written brief; nothing is shipped as data. How it is drawn:
 * - Shape: each cookie is a real 3-D mesh — a domed top that rolls over
 *   into a rounded rim, on a flat base — so it shows its thickness and
 *   silhouette as it turns. Six cookie variants are generated once on the
 *   GPU into a small atlas: an irregular outline; the crust broken into
 *   plates parted by fissures (more and finer toward the rim, where the
 *   dough stretched); dough heaped against chocolate chunks with broken
 *   facets and against glossy melted pools; flakes of sea salt; fine grain
 *   and bubbles; occlusion in every crack; browning that deepens toward the
 *   rim and along the crust's lips while the fissures show paler crumb.
 * - Colour is not baked. The atlas holds what the surface *is* (browning,
 *   crack, chip, salt, gloss) and the dough and chip colours are applied
 *   per pixel, so a flavour change is free and any colour works.
 * - Light: a warm key softbox, a cool fill, a top-back rim and a bounce
 *   tinted by the Background; wrapped diffuse for the dough's softness,
 *   GGX highlights and a softbox reflection on the chocolate, and sugar
 *   crystals that glint as a cookie turns.
 * - Depth of field: cookies are sorted by how blurred they should be into
 *   octave layers. Each layer is drawn at the resolution its blur can hide
 *   and Gaussian-blurred there; the layers are stacked back to front around
 *   the crisp layer, which is drawn at full resolution with multisampling.
 *   A cookie between two octaves is drawn into both and cross-faded, so
 *   blur changes smoothly (it racks into focus on entrance).
 *
 * Interaction: the pointer brushes cookies aside (they tip as they go and
 * wobble back), the depth layers slide against each other with the pointer
 * (parallax), and a tap morphs the cookie under it, then its neighbours.
 */

// ── Reference frame ────────────────────────────────────────────────────────
// A scene, not an object: a narrower frame sees more of the field rather
// than a shrunken one, and a wider one sees more to the sides.
const REF_W = 1200
const REF_H = 800
const REF_ASPECT = REF_W / REF_H

// ── Camera ─────────────────────────────────────────────────────────────────
/** Distance to the focus plane, in scene units. */
const FOCUS_Z = 16
/** Half the frame height at the focus plane, in scene units, for the unit S. */
const HALF_H = 4
const Z_NEAR = 1
const Z_FAR = 240

// ── Cookies ────────────────────────────────────────────────────────────────
const MAX_COOKIES = 80
/** Each cookie can appear in two blur layers while it cross-fades. */
const MAX_ENTRIES = MAX_COOKIES * 2
const VARIANTS = 6
const ATLAS_COLS = 3
const ATLAS_ROWS = 2
/** A tile spans ±EXT cookie radii, so the outline never reaches its edge. */
const EXT = 1.1
/** Largest height the atlas stores, in cookie radii. */
const HMAX = 0.4
const MAX_CHIPS = 16
const MAX_SALT = 8
/** Disparity (focus distance / depth) bands for the three layers. */
const NEAR_D: [number, number] = [1.25, 1.85]
const FOCUS_D: [number, number] = [0.93, 1.07]
const FAR_D: [number, number] = [0.3, 0.8]
/** Most cookies stand within this of facing the camera; the wobble adds to it. */
const BASE_TILT: [number, number] = [8, 48]
/** Free fall at Speed 4, in scene units per second (one frame height ≈ 12 s). */
const FLOW_SPEED = 0.62
/** Delay before each cookie enters, spread over this many seconds. */
const ENTER_SPREAD = 1.2

// ── Depth of field ─────────────────────────────────────────────────────────
/**
 * Blur of the first soft layer, in device px; each layer after it doubles.
 * Finer blur than this draws in the crisp, multisampled pass: a layer is
 * drawn at half resolution or less, and below ~3 px its blur would not hide
 * the stair-steps of that.
 */
const BLUR_C0 = 3
const MAX_LEVEL = 7
/** Layers at or above this draw the coarse mesh: their blur hides facets. */
const LO_MESH_LEVEL = 3

// ── Budget ─────────────────────────────────────────────────────────────────
const PIXEL_BUDGET = 4_200_000
const PIXEL_BUDGET_SOFT = 1_200_000
const QUALITY_FLOOR = 0.6
const FLOATS = 28 // per instance

// ── Types ─────────────────────────────────────────────────────────────────
export interface CookieBreezeFlavor {
    dough: string
    chips: string
}

export interface CookieBreezePlacement {
    x: number
    y: number
    angle: number
    tilt: number
}

export interface CookieBreezePointer {
    reach: number
    push: number
    parallax: number
}

export type CookieBreezeMorphTrigger = "both" | "loop" | "tap" | "off"
export type CookieBreezeMorphStyle = "bloom" | "marble" | "flip"

export interface CookieBreezeMorph {
    trigger: CookieBreezeMorphTrigger
    style: CookieBreezeMorphStyle
    order: "next" | "random"
    spread: "sweep" | "ripple" | "scatter"
    tapReach: number
    glow: number
    swell: number
    every: number
    sweep: number
}

export interface CookieBreezeAdvanced {
    seed: number
    salt: number
    nearShare: number
    farShare: number
    maxBlur: number
    lightAngle: number
    exposure: number
    gloss: number
    sparkle: number
    haze: number
    backdrop: number
}

export type CookieBreezeDirection = "fall" | "float" | "rise"

export interface CookieBreezeProps {
    /** One row per flavour: the cookie's dough colour and its chips. Cookies cycle through them in order. */
    flavors?: Partial<CookieBreezeFlavor>[]
    background?: string
    cookies?: number
    cookieSize?: number
    chips?: number
    bake?: number
    placement?: Partial<CookieBreezePlacement>
    pointer?: Partial<CookieBreezePointer>
    speed?: number
    direction?: CookieBreezeDirection
    spin?: number
    /** When and how cookies morph from one flavour to the next. */
    morph?: Partial<CookieBreezeMorph>
    /**
     * Curve framer-motion plays two things on: each cookie's entrance (it
     * fades in and racks into focus) and each colour morph (the bloom, swirl
     * or flip, with its swell). The drift and tumble are their own scales
     * (Speed, Spin).
     */
    transition?: Transition
    advanced?: Partial<CookieBreezeAdvanced>
    style?: React.CSSProperties
}

const DEFAULT_FLAVORS: CookieBreezeFlavor[] = [
    { dough: "#C68E52", chips: "#3B2318" },
    { dough: "#5B3A2A", chips: "#F1E8D8" },
    { dough: "#A6393A", chips: "#F4EEE3" },
    { dough: "#96A862", chips: "#F2ECDD" },
]

const DEFAULTS = {
    background: "#000000",
    cookies: 36,
    cookieSize: 170,
    chips: 5,
    bake: 8.1,
    speed: 4,
    direction: "fall",
    spin: 4,
}

const DEFAULT_PLACEMENT: CookieBreezePlacement = { x: 0, y: 0, angle: 0, tilt: 0 }

const DEFAULT_POINTER: CookieBreezePointer = { reach: 5, push: 5, parallax: 4 }

const DEFAULT_MORPH: CookieBreezeMorph = {
    trigger: "both",
    style: "bloom",
    order: "next",
    spread: "sweep",
    tapReach: 3,
    glow: 5,
    swell: 4,
    every: 6,
    sweep: 1.6,
}

const DEFAULT_ADVANCED: CookieBreezeAdvanced = {
    seed: 0,
    salt: 30,
    nearShare: 12,
    farShare: 50,
    maxBlur: 14,
    lightAngle: -35,
    exposure: 100,
    gloss: 60,
    sparkle: 100,
    haze: 18,
    backdrop: 100,
}

const DEFAULT_TRANSITION: Transition = { type: "spring", stiffness: 45, damping: 14, mass: 1 }

// ── Small helpers ─────────────────────────────────────────────────────────
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const num = (v: unknown, fallback: number) => (typeof v === "number" && isFinite(v) ? v : fallback)

/** Stable 0–1 random from three integers: a cookie keeps its looks as the count changes. */
function hash01(a: number, b: number, c: number): number {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x5bd1e995, 0x165667b1) ^ Math.imul((c | 0) + 0x68e31da4, 0x9e3779b1)
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/**
 * Parses any colour Framer hands over — hex, rgb(a), a named colour or a
 * `var(--token, fallback)` — into linear RGB. Cached per string, so the loop
 * parses nothing once the panel is still.
 */
const colourCache = new Map<string, [number, number, number]>()
let colourCtx: CanvasRenderingContext2D | null | undefined
function linearColour(input: string | undefined, fallback: string): [number, number, number] {
    const key = input && input.trim() ? input : fallback
    const hit = colourCache.get(key)
    if (hit) return hit
    let s = key.trim()
    const tok = /^var\(\s*--[^,]+,\s*(.+)\)\s*$/.exec(s)
    if (tok) s = tok[1].trim()
    let rgb: [number, number, number] | null = null
    const hex = /^#([0-9a-f]{3,8})$/i.exec(s)
    if (hex) {
        let h = hex[1]
        if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("")
        if (h.length >= 6) rgb = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
    }
    if (!rgb) {
        const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s)
        if (m) rgb = [+m[1] / 255, +m[2] / 255, +m[3] / 255]
    }
    if (!rgb && typeof document !== "undefined") {
        // Named colours and anything else the browser understands.
        if (colourCtx === undefined) colourCtx = document.createElement("canvas").getContext("2d")
        if (colourCtx) {
            colourCtx.fillStyle = "#000"
            colourCtx.fillStyle = s
            const n = String(colourCtx.fillStyle)
            if (n !== s) return linearColour(n, fallback)
        }
    }
    if (!rgb) rgb = s === fallback ? [0.5, 0.5, 0.5] : linearColour(fallback, "#808080")
    const out: [number, number, number] = [srgbToLinear(clamp(rgb[0], 0, 1)), srgbToLinear(clamp(rgb[1], 0, 1)), srgbToLinear(clamp(rgb[2], 0, 1))]
    if (colourCache.size > 128) colourCache.clear()
    colourCache.set(key, out)
    return out
}

// ── Quaternions (w, x, y, z), in place ─────────────────────────────────────
function qAxis(o: Float64Array, ax: number, ay: number, az: number, a: number) {
    const s = Math.sin(a / 2)
    o[0] = Math.cos(a / 2)
    o[1] = ax * s
    o[2] = ay * s
    o[3] = az * s
}
function qMul(o: Float64Array, a: Float64Array, b: Float64Array) {
    const w = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3]
    const x = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2]
    const y = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1]
    const z = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    o[0] = w
    o[1] = x
    o[2] = y
    o[3] = z
}
/** Rotation vector (axis × angle) to quaternion. */
function qRotvec(o: Float64Array, x: number, y: number, z: number) {
    const a = Math.sqrt(x * x + y * y + z * z)
    if (a < 1e-9) {
        o[0] = 1
        o[1] = o[2] = o[3] = 0
        return
    }
    qAxis(o, x / a, y / a, z / a, a)
}

/** Median of the first m values of src, sorted through tmp: no allocation. */
function medianOf(src: Float64Array, m: number, tmp: Float64Array): number {
    for (let i = 0; i < m; i++) {
        const v = src[i]
        let j = i - 1
        while (j >= 0 && tmp[j] > v) {
            tmp[j + 1] = tmp[j]
            j--
        }
        tmp[j + 1] = v
    }
    return tmp[m >> 1]
}

// ── Mesh ───────────────────────────────────────────────────────────────────
/**
 * One cookie mesh, shared by every cookie: (radius share, angle, face) per
 * vertex. The vertex shader turns it into the variant's outline and dome.
 * Rings crowd toward the rim, where the dome rolls over into the side.
 */
function buildCookieMesh(rings: number, segs: number) {
    const v: number[] = []
    const idx: number[] = []
    const TAU = Math.PI * 2
    // top: centre + rings
    v.push(0, 0, 0)
    for (let j = 1; j <= rings; j++) {
        const rho = 1 - Math.pow(1 - j / rings, 1.6)
        for (let i = 0; i < segs; i++) v.push(rho, (i / segs) * TAU, 0)
    }
    const top = (j: number, i: number) => 1 + (j - 1) * segs + (i % segs)
    for (let i = 0; i < segs; i++) idx.push(0, top(1, i), top(1, i + 1))
    for (let j = 1; j < rings; j++)
        for (let i = 0; i < segs; i++) {
            const a = top(j, i),
                b = top(j, i + 1),
                c = top(j + 1, i + 1),
                d = top(j + 1, i)
            idx.push(a, d, c, a, c, b)
        }
    // bottom: a flat disc meeting the top's last ring exactly
    const b0 = v.length / 3
    v.push(0, 0, 1)
    for (let i = 0; i < segs; i++) v.push(1, (i / segs) * TAU, 1)
    for (let i = 0; i < segs; i++) idx.push(b0, b0 + 1 + ((i + 1) % segs), b0 + 1 + i)
    return { vtx: new Float32Array(v), idx: new Uint16Array(idx) }
}

// ── GLSL ───────────────────────────────────────────────────────────────────
const GLSL_COMMON = /* glsl */ `
const float EXT = ${EXT.toFixed(3)};
const float HMAX = ${HMAX.toFixed(3)};
// The cookie's outline: a circle with a few slow lobes, per variant.
float outlineR(float th, float sd) {
    vec4 ph = fract(vec4(0.137, 0.379, 0.713, 0.531) * (sd * 17.0 + 3.1)) * 6.2831853;
    return 1.0 + 0.020 * sin(2.0 * th + ph.x) + 0.013 * sin(3.0 * th + ph.y)
               + 0.009 * sin(5.0 * th + ph.z) + 0.006 * sin(8.0 * th + ph.w)
               + 0.004 * sin(11.0 * th + ph.x * 1.7 + ph.y) + 0.0025 * sin(17.0 * th + ph.z * 2.3);
}
// Dome profile: full at the centre, rolling over to a vertical rim at r = 1.
float dome(float r) {
    return pow(max(1.0 - pow(min(r, 1.0), 2.4), 0.0), 0.55);
}
vec2 tileUV(vec2 xy, float v) {
    float ty = floor(v / ${ATLAS_COLS}.0 + 0.01);
    float tx = v - ty * ${ATLAS_COLS}.0;
    return (vec2(tx, ty) + clamp(xy / EXT * 0.5 + 0.5, 0.0, 1.0)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
}
`

const TRI_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }
`

/**
 * Bake, pass 1: one variant's surface at tile resolution. Height (16-bit,
 * in two channels), chip and crack masks; browning, salt, chip gloss and
 * dough mottling.
 */
const BAKE1_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uNoise;
uniform float uSeed;
uniform float uHc;
uniform float uRes;
uniform vec4 uChip[${MAX_CHIPS}];
uniform vec4 uChipB[${MAX_CHIPS}];
uniform vec4 uSalt[${MAX_SALT}];
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
${GLSL_COMMON}
vec4 rnd(ivec2 i) { return texelFetch(uNoise, (i + 4096) & 255, 0); }
// Value noise with exact (not 8-bit filtered) weights, so normals stay smooth.
float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    ivec2 k = ivec2(i);
    float a = rnd(k).r, b = rnd(k + ivec2(1, 0)).r, c = rnd(k + ivec2(0, 1)).r, d = rnd(k + ivec2(1, 1)).r;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vn(p);
        p = p * 2.07 + vec2(13.1, 7.7);
        a *= 0.5;
    }
    return s / 0.9375;
}
// Distance to the nearest cell border (exact, after Quilez), the cell's
// randoms and its centre.
float vor(vec2 x, ivec2 so, out vec4 cr, out vec2 cc) {
    vec2 n = floor(x), f = fract(x);
    vec2 mg = vec2(0.0), mr = vec2(0.0);
    float md = 8.0;
    cr = vec4(0.0);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec4 h = rnd(ivec2(n + g) + so);
        vec2 r = g + 0.12 + 0.76 * h.xy - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; mg = g; cr = h; }
    }
    float bd = 8.0;
    for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
        vec2 g = mg + vec2(float(i), float(j));
        vec4 h = rnd(ivec2(n + g) + so);
        vec2 r = g + 0.12 + 0.76 * h.xy - f;
        vec2 dd = r - mr;
        if (dot(dd, dd) > 1e-6) bd = min(bd, dot(0.5 * (mr + r), normalize(dd)));
    }
    cc = n + mg + 0.12 + 0.76 * cr.xy;
    return bd;
}
void main() {
    vec2 p = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * EXT;
    float L = length(p);
    float R = outlineR(atan(p.y, p.x), uSeed);
    float r = L / R;
    if (r >= 1.0) { o0 = vec4(0.0); o1 = vec4(0.0); return; }
    vec2 sp = vec2(uSeed * 17.31 + 3.0, uSeed * 9.73 + 5.0);
    ivec2 so = ivec2(int(uSeed) * 41 + 7, int(uSeed) * 73 + 3);
    float dm = dome(r);
    float edgeFade = 1.0 - smoothstep(0.86, 0.985, r); // the rim roll stays whole

    // ── dough: mounds and dips where it slumped round the chocolate ──
    float lumps = ((fbm(p * 1.6 + sp + 30.0) - 0.5) * 0.15 + (fbm(p * 3.4 + sp + 40.0) - 0.5) * 0.06) * smoothstep(0.0, 0.45, dm);

    // ── crust: plates parted by a few ragged fissures, finer toward the rim ──
    vec2 w = vec2(fbm(p * 2.3 + sp), fbm(p * 2.3 + sp + 4.7)) - 0.5;
    float sc = 2.2 * (1.0 + 0.55 * r * r);
    vec4 cr;
    vec2 cc;
    float bd = vor(p * sc + w * 0.9, so, cr, cc) / sc;
    // only part of the network has opened, and the openings vary from
    // hairlines to wide gaps with ragged edges
    float open = smoothstep(0.42, 0.6, vn(p * 3.2 + sp + 11.0));
    float cw = max((0.003 + 0.03 * pow(vn(p * 4.5 + sp + 2.0), 2.2)) * open * (0.45 + 0.55 * smoothstep(0.15, 0.7, r)), 1e-4);
    float bdr = bd + (vn(p * 55.0 + sp + 3.0) - 0.5) * 0.007;
    float inC = (1.0 - smoothstep(0.0, cw, bdr)) * edgeFade * step(0.0015, cw);
    float lip = (1.0 - smoothstep(cw, cw * 3.0 + 0.025, bdr)) * edgeFade * open;
    vec4 cr2 = rnd(ivec2(cc * 7.0) + so + 913);
    vec2 pc = (cc - w * 0.9) / sc;
    float plate = ((cr.z - 0.5) * 0.02 + dot(p - pc, cr2.xy - 0.5) * 0.07) * edgeFade * dm * smoothstep(0.0, 0.03 + 2.0 * cw, bd);
    float pillow = -0.02 * lip * lip * dm;
    float fiss = -(0.012 + 0.9 * cw) * pow(inC, 1.3) * smoothstep(0.0, 0.3, dm);
    float grain = (fbm(p * 15.0 + sp + 1.3) - 0.5) * 0.012 + (vn(p * 44.0 + sp) - 0.5) * 0.005 + (vn(p * 110.0 + sp + 9.0) - 0.5) * 0.002;
    float pit = -0.005 * smoothstep(0.6, 0.82, vn(p * 24.0 + sp + 8.0));
    float hD = uHc * dm + lumps + plate + pillow + fiss + (grain + pit) * (0.35 + 0.65 * dm);

    // ── chocolate: broken chunks and melted pools, dough heaped against them ──
    float hC = -1.0;
    float gloss = 0.0;
    for (int k = 0; k < ${MAX_CHIPS}; k++) {
        vec4 c = uChip[k];
        if (c.w < 0.5) continue;
        vec4 b = uChipB[k];
        vec2 q = p - c.xy;
        float ql = length(q);
        if (ql > c.z * 1.8) continue;
        vec2 u = q / max(ql, 1e-4);
        // elongated, lumpy outline
        float cs0 = cos(b.w), sn0 = sin(b.w);
        vec2 qe = vec2(cs0 * q.x - sn0 * q.y, (sn0 * q.x + cs0 * q.y) * (1.0 + 0.35 * b.z));
        float rr = c.z * (1.0 + 0.34 * (vn(u * 1.3 + b.z * 37.0) - 0.5) + 0.16 * (vn(u * 3.1 + b.z * 53.0) - 0.5));
        float dn = length(qe) / rr;
        // dough heaped against it, unevenly
        hD += b.x * (0.25 + 0.3 * vn(u * 2.0 + b.z * 19.0)) * exp(-pow((dn - 1.0) / 0.35, 2.0)) * edgeFade;
        if (dn >= 1.0) continue;
        float top;
        vec2 fq = qe / c.z;
        if (c.w < 1.5) {
            // a chunk: domed, with a few broken planes across its top
            float fa = max(max(dot(fq, vec2(cos(b.w), sin(b.w))), dot(fq, vec2(cos(b.w + 2.1), sin(b.w + 2.1)))), dot(fq, vec2(cos(b.w + 4.2), sin(b.w + 4.2))));
            top = b.x * pow(1.0 - dn * dn, 0.55) * (1.0 - 0.22 * max(fa, 0.0)) + (vn(fq * 3.0 + b.z * 11.0) - 0.5) * 0.008;
        } else {
            // a melted pool: low and glassy, slumped toward one side
            top = b.x * pow(1.0 - dn * dn, 0.3) * (1.0 + 0.3 * fq.x) + (vn(fq * 5.0 + b.z * 7.0) - 0.5) * 0.003;
        }
        // dough lapping over part of its edge
        top -= b.x * 0.9 * smoothstep(0.72, 1.0, dn + 0.35 * (vn(u * 2.4 + b.z * 71.0) - 0.5));
        float h = uHc * dome(length(c.xy)) - b.y + top;
        if (h > hC) { hC = h; gloss = c.w < 1.5 ? 0.35 + 0.35 * b.z : 1.0; }
    }
    float kf = 0.006;
    float hm = clamp(0.5 + 0.5 * (hC - hD) / kf, 0.0, 1.0);
    float hh = mix(hD, hC, hm) + kf * hm * (1.0 - hm);
    float chipK = smoothstep(-0.002, 0.003, hC - hD);

    // ── sea salt: flat crystals lying on the top ──
    float salt = 0.0;
    for (int k = 0; k < ${MAX_SALT}; k++) {
        vec4 s = uSalt[k];
        if (s.z <= 0.0) continue;
        vec2 q = p - s.xy;
        float cs = cos(s.w), sn = sin(s.w);
        q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) / s.z;
        float d = max(max(abs(q.x), abs(q.y) * 1.25), abs(q.x * 0.7 + q.y * 0.7) * 1.1);
        salt = max(salt, 1.0 - smoothstep(0.82, 1.0, d));
    }
    hh += salt * 0.007;

    float rim = pow(smoothstep(0.5, 1.0, r), 1.5);
    float speck = smoothstep(0.72, 0.9, vn(p * 70.0 + sp + 31.0));
    float brown = 0.04 + 0.95 * rim + 0.4 * lip * (1.0 - inC) - 0.75 * inC + 0.45 * (fbm(p * 3.0 + sp + 6.0) - 0.5) + 0.25 * speck + 3.0 * max(lumps, 0.0);
    float mott = fbm(p * 8.0 + sp + 19.0);
    float hn = floor(clamp(hh / HMAX, 0.0, 1.0) * 65535.0 + 0.5);
    float hi = floor(hn / 256.0);
    o0 = vec4(hi / 255.0, (hn - hi * 256.0) / 255.0, chipK, inC * (1.0 - chipK));
    o1 = vec4(clamp(brown, 0.0, 1.0), salt, gloss * chipK, mott);
}
`

/**
 * Bake, pass 2: normals, occlusion and the smooth detail height the mesh
 * rides on, written into the variant's atlas tile.
 * M0 = normal xy, occlusion, detail height; M1 = browning, chip, crack,
 * salt; M2 = mottling, gloss, inside, –.
 */
const BAKE2_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform float uRes;
uniform float uHc;
uniform float uSeed;
uniform vec2 uOrg;
layout(location = 0) out vec4 m0;
layout(location = 1) out vec4 m1;
layout(location = 2) out vec4 m2;
${GLSL_COMMON}
float H(ivec2 i) {
    i = clamp(i, ivec2(0), ivec2(int(uRes) - 1));
    vec4 t = texelFetch(uT0, i, 0);
    return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0 * HMAX;
}
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy - uOrg);
    float ts = 2.0 * EXT / uRes;
    vec2 p = ((vec2(c) + 0.5) / uRes * 2.0 - 1.0) * EXT;
    float L = length(p);
    float r = L / outlineR(atan(p.y, p.x), uSeed);
    float h0 = H(c);
    vec3 n;
    if (r < 1.0) {
        float hx = (H(c + ivec2(1, 0)) - H(c - ivec2(1, 0))) / (2.0 * ts);
        float hy = (H(c + ivec2(0, 1)) - H(c - ivec2(0, 1))) / (2.0 * ts);
        n = normalize(vec3(-hx, -hy, 1.0));
    } else {
        // Outside, carry the rim's outward normal so filtered taps near the
        // edge stay steep instead of averaging toward flat.
        n = normalize(vec3(p / max(L, 1e-4), 0.08));
    }
    float occ = 0.0;
    for (int d = 0; d < 8; d++) {
        float a = float(d) * 0.7853982 + 0.39;
        vec2 dir = vec2(cos(a), sin(a));
        occ += max(0.0, (H(c + ivec2(dir * 2.5)) - h0) / (2.5 * ts) - 0.08);
        occ += max(0.0, (H(c + ivec2(dir * 7.0)) - h0) / (7.0 * ts) - 0.08) * 0.8;
        occ += max(0.0, (H(c + ivec2(dir * 16.0)) - h0) / (16.0 * ts) - 0.08) * 0.6;
        occ += max(0.0, (H(c + ivec2(dir * 38.0)) - h0) / (38.0 * ts) - 0.05) * 0.5;
    }
    float ao = clamp(1.0 - occ * 0.1, 0.0, 1.0);
    vec4 t0 = texelFetch(uT0, c, 0);
    vec4 t1 = texelFetch(uT1, c, 0);
    float det = r < 1.0 ? h0 - uHc * dome(r) : 0.0;
    m0 = vec4(n.xy * 0.5 + 0.5, ao, clamp((det + 0.08) / 0.2, 0.0, 1.0));
    m1 = vec4(t1.r, t0.b, t0.a, t1.g);
    m2 = vec4(t1.a, t1.b, r < 1.0 ? 1.0 : 0.0, 0.0);
}
`

const COOKIE_VERT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec3 aG;
layout(location = 1) in vec4 iPos;
layout(location = 2) in vec4 iQ;
layout(location = 3) in vec4 iDA;
layout(location = 4) in vec4 iCA;
layout(location = 5) in vec4 iDB;
layout(location = 6) in vec4 iCB;
layout(location = 7) in vec4 iX;
uniform vec4 uP;
uniform vec2 uZ;
uniform sampler2D uM0;
out vec3 vL;
out vec3 vV;
out float vFace;
flat out vec4 vQ;
flat out vec4 vDA;
flat out vec4 vCA;
flat out vec4 vDB;
flat out vec4 vCB;
flat out vec4 vX;
${GLSL_COMMON}
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.yzw, cross(q.yzw, v) + q.x * v); }
void main() {
    float rho = aG.x, th = aG.y;
    vec2 xy = rho * outlineR(th, iDA.w) * vec2(cos(th), sin(th));
    float z = 0.0;
    if (aG.z < 0.5) {
        // The dome exactly; the plates and chips from the atlas, smoothed by
        // its mip chain so the mesh never chases fine cracks.
        float det = textureLod(uM0, tileUV(xy, iDA.w), 1.5).a * 0.2 - 0.08;
        z = iX.z * dome(rho) + det * (1.0 - smoothstep(0.8, 0.95, rho));
    }
    vL = vec3(xy, z);
    vec3 V = iPos.xyz + qrot(iQ, vec3(xy, z - iX.z * 0.45) * iPos.w);
    vV = V;
    vFace = aG.z;
    vQ = iQ;
    vDA = iDA;
    vCA = iCA;
    vDB = iDB;
    vCB = iCB;
    vX = iX;
    gl_Position = vec4(V.x * uP.x - uP.z * V.z, V.y * uP.y - uP.w * V.z, uZ.x * V.z + uZ.y, -V.z);
}
`

const COOKIE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uM0;
uniform sampler2D uM1;
uniform sampler2D uM2;
uniform sampler2D uNoise;
uniform vec3 uBg;
uniform vec3 uKey;
uniform vec4 uLook; // bake, chip gloss, sparkle, exposure
uniform vec4 uMorph; // style (0 bloom, 1 marble, 2 flip, 3 fade), glow, ridge, –
in vec3 vL;
in vec3 vV;
in float vFace;
flat in vec4 vQ;
flat in vec4 vDA;
flat in vec4 vCA;
flat in vec4 vDB;
flat in vec4 vCB;
flat in vec4 vX;
out vec4 o;
${GLSL_COMMON}
const vec3 KEY_C = vec3(1.0, 0.95, 0.88) * 1.1;
const vec3 FILL_C = vec3(0.80, 0.86, 1.0) * 0.3;
const vec3 RIM_C = vec3(1.0, 0.97, 0.92) * 0.9;
const vec3 FILL_D = vec3(0.7593, -0.1898, 0.6227);
const vec3 RIM_D = vec3(0.1504, 0.8521, -0.5013);
// How far browning darkens each channel at full bake.
const vec3 BROWN = vec3(0.50, 0.34, 0.21);
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.yzw, cross(q.yzw, v) + q.x * v); }
float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    ivec2 k = ivec2(i) + 4096;
    float a = texelFetch(uNoise, k & 255, 0).r, b = texelFetch(uNoise, (k + ivec2(1, 0)) & 255, 0).r;
    float c = texelFetch(uNoise, (k + ivec2(0, 1)) & 255, 0).r, d = texelFetch(uNoise, (k + ivec2(1, 1)) & 255, 0).r;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 lightOne(vec3 N, vec3 V, vec3 L, vec3 lc, vec3 alb, float rough, float f0, float wrap) {
    float nl = dot(N, L);
    float d = clamp((nl + wrap) / (1.0 + wrap), 0.0, 1.0);
    // the wrapped part (light that crept through the crumb) runs warmer
    vec3 diff = alb * lc * (max(nl, 0.0) + (d - max(nl, 0.0)) * sqrt(alb) * 1.4);
    float nlc = max(nl, 0.0);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float nv = max(dot(N, V), 1e-3);
    float a = rough * rough;
    float a2 = a * a;
    float dd = nh * nh * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * dd * dd);
    float k = (rough + 1.0) * (rough + 1.0) / 8.0;
    float G = 1.0 / ((nv * (1.0 - k) + k) * (nlc * (1.0 - k) + k) + 1e-4);
    float F = f0 + (1.0 - f0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    return diff + lc * (D * G * F * 0.25 * nlc);
}
vec3 tone(vec3 x) {
    vec3 s = 0.62 + 0.38 * (1.0 - exp(-(x - 0.62) / 0.38));
    return mix(x, s, step(0.62, x));
}
vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
    vec2 uv = tileUV(vL.xy, vDA.w);
    vec4 m0 = texture(uM0, uv);
    vec4 m1 = texture(uM1, uv);
    vec4 m2 = texture(uM2, uv);
    // derivatives in uniform control flow, before any branch
    vec2 g = vL.xy * 72.0;
    vec2 gw = fwidth(g);
    bool top = vFace < 0.5;

    // ── colour morph, in the cookie's own frame (vX.xy is where it starts) ──
    // The progress is one value per cookie, so these branches never split
    // a cookie's pixels.
    float p = vCA.w;
    float mB = 0.0;
    float front = 0.0;
    float wet = 0.0;
    vec2 tiltN = vec2(0.0);
    if (p >= 0.999) mB = 1.0;
    else if (p > 0.001) {
        vec2 q = vL.xy - vX.xy;
        float d = length(q);
        float sd = vDA.w * 7.13;
        float n = vn(vL.xy * 2.7 + sd) * 0.62 + vn(vL.xy * 6.5 + sd + 17.0) * 0.38;
        float life = smoothstep(0.0, 0.06, p) * (1.0 - smoothstep(0.82, 1.0, p));
        if (uMorph.x < 0.5) {
            // bloom: the new dough runs out in tendrils behind a raised,
            // glowing front, leaving a wet sheen that dries behind it
            // reaches the far rim at the end, wherever it started
            float R = p * (1.4 + length(vX.xy));
            float x = d + (n - 0.5) * 0.55 * smoothstep(0.0, 0.25, R) - R;
            mB = 1.0 - smoothstep(-0.03, 0.03, x);
            float bump = exp(-x * x / 0.006) * life;
            front = bump;
            wet = (1.0 - smoothstep(0.0, 0.35, -x)) * mB * life;
            // the ridge's slope tips the normal outward ahead of it, inward behind
            tiltN = (q / max(d, 1e-3)) * (x / 0.003) * 0.025 * uMorph.z * bump;
        } else if (uMorph.x < 1.5) {
            // marble: the two doughs swirl through each other, then settle
            float a = atan(q.y, q.x);
            // (the swirl fades in away from the start, so it never pinches there)
            float sw = mix(0.5, 0.5 + 0.5 * sin(a * 3.0 + d * 6.0 - p * 7.0 + n * 5.0), smoothstep(0.05, 0.5, d));
            float x = mix(sw, clamp(d / 2.2, 0.0, 1.0), 0.5) - (p * 1.4 - 0.2);
            mB = 1.0 - smoothstep(-0.05, 0.05, x);
            front = exp(-x * x / 0.002) * life * 0.7;
            wet = (1.0 - smoothstep(0.0, 0.3, -x)) * mB * life * 0.6;
        } else if (uMorph.x < 2.5) {
            // flip: the colour turns while the cookie is edge-on
            mB = step(0.75, p);
        } else {
            mB = p;
        }
    }

    vec3 nO = vec3(m0.xy * 2.0 - 1.0, 0.0);
    nO.z = sqrt(max(0.0, 1.0 - dot(nO.xy, nO.xy)));
    if (top) nO = normalize(nO + vec3(tiltN, 0.0));
    // the underside: flat, with the crumb's porous texture pressed into it
    else nO = normalize(vec3((m0.xy * 2.0 - 1.0) * 0.3, -1.0));
    vec3 N = normalize(qrot(vQ, nO));
    vec3 V = normalize(-vV);
    float nv = dot(N, V);
    if (nv < 0.05) {
        N = normalize(N + V * (0.05 - nv));
        nv = dot(N, V);
    }

    vec3 dough = mix(vDA.rgb, vDB.rgb, mB);
    vec3 chipC = mix(vCA.rgb, vCB.rgb, mB);

    float mott = m2.r;
    float crack = top ? m1.b : 0.0;
    float chipK = top ? m1.g : m1.g * 0.3;
    float salt = top ? m1.a : 0.0;
    vec3 base = dough * (0.88 + 0.24 * (mott - 0.5));
    // the underside is toasted from the tray: browner, mottled, with darker spots
    // (behind an if: D3D runs both sides of a ?:)
    float spots = 0.0;
    if (!top) spots = smoothstep(0.55, 0.75, vn(vL.xy * 9.0 + vDA.w * 3.1)) * 0.35;
    float br = top ? clamp(m1.r * uLook.x, 0.0, 1.0) : clamp(0.45 + 0.35 * uLook.x + 0.8 * (mott - 0.5) + spots, 0.0, 1.0);
    vec3 alb = base * mix(vec3(1.0), BROWN, br);
    vec3 crumb = min(base * vec3(1.16, 1.14, 1.10) + 0.02, vec3(1.0));
    alb = mix(alb, crumb, crack * 0.85);
    // chips held under clipping so white chocolate keeps its shading
    alb = mix(alb, min(chipC, vec3(0.62)) * (0.9 + 0.2 * mott), chipK);
    alb = mix(alb, vec3(0.88, 0.87, 0.85), salt);
    float rough = mix(0.56, 0.8, crack);
    rough = mix(rough, mix(0.5, 0.22, m2.g * uLook.y), chipK);
    rough = mix(rough, 0.14, salt);
    if (!top) rough = 0.75;
    rough *= 1.0 - 0.5 * wet;
    float f0 = mix(0.035, 0.05, max(chipK, salt));
    float ao = top ? m0.b : mix(1.0, m0.b, 0.6);

    vec3 col = lightOne(N, V, uKey, KEY_C, alb, rough, f0, 0.35);
    col += lightOne(N, V, FILL_D, FILL_C, alb, rough, f0, 0.35);
    col += lightOne(N, V, RIM_D, RIM_C, alb, rough, f0, 0.1) * mix(1.0, ao, 0.6);
    col *= mix(0.55, 1.0, ao);
    // bounce from the studio: sky above, the Background's colour below
    vec3 sky = mix(vec3(0.92, 0.94, 1.0), uBg, 0.35) * 0.32;
    vec3 gnd = uBg * 0.28 + 0.01;
    col += alb * mix(gnd, sky, N.y * 0.5 + 0.5) * ao;
    // softbox reflection: what reads chocolate as glossy
    vec3 Rf = reflect(-V, N);
    float fres = f0 + (1.0 - f0) * pow(1.0 - max(nv, 0.0), 5.0);
    float wdt = 0.03 + 0.6 * rough * rough;
    float box = smoothstep(0.86 - wdt, 0.93, dot(Rf, uKey));
    vec3 env = mix(gnd, sky * 1.6, smoothstep(-0.3, 0.7, Rf.y)) + KEY_C * 0.9 * box / (1.0 + 6.0 * wdt);
    col += env * fres * ao * ao * (1.0 - 0.6 * rough);

    // sugar crystals glinting as the cookie turns; faded where they fall
    // below a pixel, so far cookies never shimmer
    vec2 gi = floor(g);
    vec2 gf = fract(g) - 0.5;
    vec4 h = texelFetch(uNoise, (ivec2(gi) + ivec2(int(vDA.w) * 61, int(vDA.w) * 17) + 4096) & 255, 0);
    float has = step(h.r, 0.12) * (1.0 - chipK) * (1.0 - crack) * (top ? 1.0 : 0.3);
    float spot = 1.0 - smoothstep(0.06, 0.2, length(gf - (h.gb - 0.5) * 0.5));
    vec3 nc = normalize(N + qrot(vQ, vec3((h.ba - 0.5) * 1.4, 0.0)));
    float glint = pow(max(dot(nc, normalize(uKey + V)), 0.0), 180.0);
    float fade = 1.0 - smoothstep(0.3, 0.8, max(gw.x, gw.y));
    col += KEY_C * glint * has * spot * fade * uLook.z * 1.6 * (1.0 + 7.0 * front * uMorph.y);
    // the morph's front glows like caramel catching the light
    vec3 glowC = mix(vDB.rgb * 1.4 + 0.1, vec3(1.0, 0.7, 0.36), 0.55);
    col += glowC * front * uMorph.y * 0.9 * (top ? 1.0 : 0.3);

    col *= uLook.w;
    col = mix(col, uBg, vCB.w);
    float a = vDB.w;
    o = vec4(toSrgb(tone(col)) * a, a);
}
`

/**
 * The blur runs only over a rectangle round each cookie of the layer (one
 * instanced quad apiece), not over the layer's whole extent: far cookies
 * are scattered across the frame, and blurring the space between them was
 * most of the frame's cost. Overlapping rectangles write the same values.
 */
const RECT_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aC;
layout(location = 1) in vec4 iR; // x0, y0, x1, y1 in drawing-buffer px
uniform float uRS;
uniform vec2 uGrow;
uniform vec2 uTS;
void main() {
    vec2 a = floor(iR.xy * uRS - uGrow);
    vec2 b = ceil(iR.zw * uRS + uGrow);
    gl_Position = vec4(mix(a, b, aC) / uTS * 2.0 - 1.0, 0.0, 1.0);
}
`

/**
 * Separable Gaussian on premultiplied colour, clamped to the drawn sub-rect;
 * neighbouring taps are paired into one filtered fetch (7 fetches, 13 taps).
 */
const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSig;
uniform vec4 uClamp;
out vec4 o;
void main() {
    vec2 ts = 1.0 / vec2(textureSize(uTex, 0));
    vec2 fc = gl_FragCoord.xy;
    float k = -0.5 / (uSig * uSig);
    vec4 s = texture(uTex, clamp(fc * ts, uClamp.xy, uClamp.zw));
    float ws = 1.0;
    for (int i = 1; i <= 5; i += 2) {
        float x1 = float(i);
        float x2 = x1 + 1.0;
        float w1 = exp(x1 * x1 * k);
        float w2 = exp(x2 * x2 * k);
        float w = w1 + w2;
        float d = (x1 * w1 + x2 * w2) / w;
        s += (texture(uTex, clamp((fc + uDir * d) * ts, uClamp.xy, uClamp.zw)) + texture(uTex, clamp((fc - uDir * d) * ts, uClamp.xy, uClamp.zw))) * w;
        ws += 2.0 * w;
    }
    o = s / ws;
}
`

/** Copies a layer into a coarser or finer target; blending does the stacking. */
const COMP_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uMap;
uniform vec4 uClamp;
out vec4 o;
void main() {
    o = texture(uTex, clamp(gl_FragCoord.xy * uMap, uClamp.xy, uClamp.zw));
}
`

type Prog = { p: WebGLProgram; vs: WebGLShader; fs: WebGLShader; u: Record<string, WebGLUniformLocation | null> }

function makeProgram(g: WebGL2RenderingContext, vs: string, fs: string): Prog | null {
    const sh = (type: number, src: string) => {
        const s = g.createShader(type)
        if (!s) return null
        g.shaderSource(s, src)
        g.compileShader(s)
        return s
    }
    const v = sh(g.VERTEX_SHADER, vs)
    const f = sh(g.FRAGMENT_SHADER, fs)
    const p = g.createProgram()
    if (!v || !f || !p) return null
    g.attachShader(p, v)
    g.attachShader(p, f)
    g.linkProgram(p)
    // Link status is read later, once the driver says it is done, so a slow
    // compile never blocks the page.
    return { p, vs: v, fs: f, u: {} }
}

function finishProgram(g: WebGL2RenderingContext, pr: Prog, names: readonly string[]): boolean {
    const ok = !!g.getProgramParameter(pr.p, g.LINK_STATUS)
    g.deleteShader(pr.vs)
    g.deleteShader(pr.fs)
    if (!ok) return false
    for (const n of names) pr.u[n] = g.getUniformLocation(pr.p, n)
    return true
}

const BAKE1_U = ["uNoise", "uSeed", "uHc", "uRes", "uChip", "uChipB", "uSalt"] as const
const BAKE2_U = ["uT0", "uT1", "uRes", "uHc", "uSeed", "uOrg"] as const
const COOKIE_U = ["uP", "uZ", "uM0", "uM1", "uM2", "uNoise", "uBg", "uKey", "uLook", "uMorph"] as const
const BLUR_U = ["uTex", "uDir", "uSig", "uClamp", "uRS", "uGrow", "uTS"] as const
const COMP_U = ["uTex", "uMap", "uClamp"] as const

/** Per-cookie state: its fixed looks and path, its springs, and this frame's pose. */
type Cookie = {
    nx: number
    ny: number
    d: number
    size: number
    variant: number
    rate: number
    swA: number
    swW: number
    swP: number
    bobA: number
    bobW: number
    bobP: number
    spW: number
    spP: number
    t0: number
    wA: number
    wW: number
    wP: number
    ax0: number
    prW: number
    // pointer push (S units) and its spin kick (rotation vector)
    ox: number
    oy: number
    vx: number
    vy: number
    kx: number
    ky: number
    kz: number
    wx: number
    wy: number
    wz: number
    // flavour
    flavA: number
    flavB: number
    blend: number
    // a morph in flight: when its curve starts (ms, performance.now clock)
    morphing: boolean
    mStart: number
    queued: boolean
    // where the morph starts, on the cookie's own top (radii)
    mox: number
    moy: number
    enter: number
    enterStart: number
    // this frame
    cx: number
    cy: number
    cz: number
    rw: number
    q: Float64Array
    u: number
    v: number
    bu: number
    bv: number
    rS: number
    bx: number
    by: number
    rb: number
    level: number
    near: boolean
    alpha: number
}

function newCookie(): Cookie {
    return {
        nx: 0, ny: 0, d: 1, size: 1, variant: 0, rate: 1, swA: 0, swW: 0, swP: 0, bobA: 0, bobW: 0, bobP: 0,
        spW: 0, spP: 0, t0: 0, wA: 0, wW: 0, wP: 0, ax0: 0, prW: 0,
        ox: 0, oy: 0, vx: 0, vy: 0, kx: 0, ky: 0, kz: 0, wx: 0, wy: 0, wz: 0,
        flavA: 0, flavB: 0, blend: 0, morphing: false, mStart: 0, queued: false, mox: 1, moy: 0, enter: 0, enterStart: 0,
        cx: 0, cy: 0, cz: -FOCUS_Z, rw: 1, q: new Float64Array([1, 0, 0, 0]), u: 0, v: 0, bu: 0, bv: 0, rS: 0,
        bx: 0, by: 0, rb: 0, level: 0, near: false, alpha: 0,
    }
}

/** Gives cookie i its looks, depth and path for this seed. */
function seedCookie(ck: Cookie, i: number, seed: number, nearShare: number, farShare: number) {
    const R = (k: number) => hash01(i, seed, k)
    const u = R(1)
    if (u < nearShare) ck.d = NEAR_D[0] + (NEAR_D[1] - NEAR_D[0]) * R(2)
    else if (u < nearShare + farShare) ck.d = Math.exp(Math.log(FAR_D[0]) + (Math.log(FAR_D[1]) - Math.log(FAR_D[0])) * R(2))
    else ck.d = FOCUS_D[0] + (FOCUS_D[1] - FOCUS_D[0]) * R(2)
    // Low-discrepancy start, so any count spreads evenly over the frame.
    ck.nx = (0.5 + i * 0.7548776662 + R(3) * 0.08) % 1
    ck.ny = (0.5 + i * 0.5698402910 + R(4) * 0.08) % 1
    ck.size = 0.85 + 0.3 * R(5)
    ck.variant = Math.min(VARIANTS - 1, Math.floor(R(6) * VARIANTS))
    ck.rate = 0.75 + 0.5 * R(7)
    ck.swA = 0.15 + 0.3 * R(8)
    ck.swW = 0.25 + 0.3 * R(9)
    ck.swP = R(10) * Math.PI * 2
    ck.bobA = 0.25 + 0.35 * R(11)
    ck.bobW = 0.3 + 0.3 * R(12)
    ck.bobP = R(13) * Math.PI * 2
    ck.spW = (0.06 + 0.08 * R(14)) * (R(15) < 0.5 ? -1 : 1)
    ck.spP = R(16) * Math.PI * 2
    ck.t0 = ((BASE_TILT[0] + (BASE_TILT[1] - BASE_TILT[0]) * R(17)) * Math.PI) / 180
    ck.wA = ((8 + 14 * R(18)) * Math.PI) / 180
    ck.wW = 0.12 + 0.12 * R(19)
    ck.wP = R(20) * Math.PI * 2
    ck.ax0 = R(21) * Math.PI * 2
    ck.prW = (0.03 + 0.04 * R(22)) * (R(23) < 0.5 ? -1 : 1)
    ck.flavA = Math.floor(R(24) * 1024)
    ck.flavB = ck.flavA
}

/** The chip, salt and dome layout of one variant, from the panel. */
function variantLayout(v: number, seed: number, chips: number, salt: number, chipU: Float32Array, chipB: Float32Array, saltU: Float32Array) {
    const R = (k: number) => hash01(v + 97, seed, k)
    chipU.fill(0)
    chipB.fill(0)
    saltU.fill(0)
    const want = clamp(Math.round(chips * 1.7 + (v % 3) - 1), 0, MAX_CHIPS)
    let n = 0
    for (let t = 0; t < 400 && n < want; t++) {
        const ang = R(100 + t * 5) * Math.PI * 2
        const rad = 0.83 * Math.sqrt(R(101 + t * 5))
        const x = Math.cos(ang) * rad
        const y = Math.sin(ang) * rad
        const puddle = R(102 + t * 5) < 0.28
        const cr = (puddle ? 0.13 : 0.1) + 0.075 * R(103 + t * 5)
        let ok = true
        for (let k = 0; k < n && ok; k++) {
            const dx = chipU[k * 4] - x
            const dy = chipU[k * 4 + 1] - y
            if (Math.hypot(dx, dy) < chipU[k * 4 + 2] + cr + 0.03) ok = false
        }
        if (!ok) continue
        chipU[n * 4] = x
        chipU[n * 4 + 1] = y
        chipU[n * 4 + 2] = cr
        chipU[n * 4 + 3] = puddle ? 2 : 1
        const r2 = R(104 + t * 5)
        chipB[n * 4] = puddle ? 0.016 + 0.012 * r2 : 0.05 + 0.035 * r2
        chipB[n * 4 + 1] = 0.03 * R(900 + t)
        chipB[n * 4 + 2] = R(901 + t)
        chipB[n * 4 + 3] = R(902 + t) * Math.PI * 2
        n++
    }
    const flakes = clamp(Math.round((salt / 100) * (3 + 3 * R(50))), 0, MAX_SALT)
    for (let k = 0; k < flakes; k++) {
        const ang = R(60 + k * 3) * Math.PI * 2
        const rad = 0.72 * Math.sqrt(R(61 + k * 3))
        saltU[k * 4] = Math.cos(ang) * rad
        saltU[k * 4 + 1] = Math.sin(ang) * rad
        saltU[k * 4 + 2] = 0.022 + 0.022 * R(62 + k * 3)
        saltU[k * 4 + 3] = R(80 + k) * Math.PI
    }
    return 0.21 + 0.06 * R(7)
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
export default function CookieBreeze(props: CookieBreezeProps) {
    const {
        flavors,
        background = DEFAULTS.background,
        cookies = DEFAULTS.cookies,
        cookieSize = DEFAULTS.cookieSize,
        chips = DEFAULTS.chips,
        bake = DEFAULTS.bake,
        speed = DEFAULTS.speed,
        direction = DEFAULTS.direction,
        spin = DEFAULTS.spin,
        transition = {"mass":1,"type":"spring","damping":14,"stiffness":45},
        style,
    } = props
    const place: CookieBreezePlacement = { ...DEFAULT_PLACEMENT, ...(props.placement ?? {}) }
    const pointer: CookieBreezePointer = { ...DEFAULT_POINTER, ...(props.pointer ?? {}) }
    const adv: CookieBreezeAdvanced = { ...DEFAULT_ADVANCED, ...(props.advanced ?? {}) }
    const morph: CookieBreezeMorph = { ...DEFAULT_MORPH, ...(props.morph ?? {}) }
    const flavs: CookieBreezeFlavor[] = (flavors && flavors.length ? flavors : DEFAULT_FLAVORS).map((f) => ({
        dough: f?.dough || DEFAULT_FLAVORS[0].dough,
        chips: f?.chips || DEFAULT_FLAVORS[0].chips,
    }))

    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Merged once per render; the loop only reads it.
    const cfg = useRef({ flavs, background, cookies, cookieSize, chips, bake, place, pointer, speed, direction, spin, morph, transition, adv })
    cfg.current = { flavs, background, cookies, cookieSize, chips, bake, place, pointer, speed, direction, spin, morph, transition, adv }
    const wakeRef = useRef<() => void>(() => {})

    // A prop change wakes a settled loop for a fresh frame.
    useEffect(() => {
        wakeRef.current()
    })

    useEffect(() => {
        const root = rootRef.current
        const canvas = canvasRef.current
        if (!root || !canvas) return
        const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null
        let isCanvas = false
        try {
            isCanvas = RenderTarget.current() === RenderTarget.canvas
        } catch {
            isCanvas = false
        }

        // ── software GL? (SwiftShader, llvmpipe, blocklisted GPUs) ──
        // Probed on a throwaway context, before choosing multisampling and
        // atlas size for the real one.
        let soft = false
        try {
            const pc = document.createElement("canvas").getContext("webgl2")
            if (pc) {
                const dbg = pc.getExtension("WEBGL_debug_renderer_info")
                const name = String(dbg ? pc.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : pc.getParameter(pc.RENDERER))
                soft = /swiftshader|llvmpipe|software|basic render/i.test(name)
                pc.getExtension("WEBGL_lose_context")?.loseContext()
            }
        } catch {
            soft = false
        }
        const TS = soft ? 256 : 512

        // ── cookies ──
        const cks: Cookie[] = []
        for (let i = 0; i < MAX_COOKIES; i++) cks.push(newCookie())
        const seedKey = new Float64Array([NaN, NaN, NaN])
        const syncCookies = () => {
            const a = cfg.current.adv
            const seed = Math.round(num(a.seed, 0))
            const ns = clamp(num(a.nearShare, 12), 0, 100) / 100
            const fs = clamp(num(a.farShare, 50), 0, 100) / 100
            if (seedKey[0] === seed && seedKey[1] === ns && seedKey[2] === fs) return
            const reseat = seedKey[0] !== seed
            seedKey[0] = seed
            seedKey[1] = ns
            seedKey[2] = fs
            for (let i = 0; i < MAX_COOKIES; i++) {
                const ck = cks[i]
                const keep = !reseat
                const nx = ck.nx,
                    ny = ck.ny,
                    fa = ck.flavA,
                    fb = ck.flavB
                seedCookie(ck, i, seed, ns, ns + fs > 1 ? 1 - ns : fs)
                if (keep) {
                    // Only the depth mix changed: keep everyone where they are.
                    ck.nx = nx
                    ck.ny = ny
                    ck.flavA = fa
                    ck.flavB = fb
                }
            }
        }

        // ── GL ──
        let gl: WebGL2RenderingContext | null = null
        let lost = false
        let failed = false
        let ready = false
        let parallelExt: { COMPLETION_STATUS_KHR: number } | null = null
        let pBake1: Prog | null = null
        let pBake2: Prog | null = null
        let pCookie: Prog | null = null
        let pBlur: Prog | null = null
        let pComp: Prog | null = null
        let triVao: WebGLVertexArrayObject | null = null
        let rectVao: WebGLVertexArrayObject | null = null
        let rectBuf: WebGLBuffer | null = null
        const rects = new Float32Array(MAX_ENTRIES * 4)
        let noiseTex: WebGLTexture | null = null
        let t0Tex: WebGLTexture | null = null
        let t1Tex: WebGLTexture | null = null
        let fboBake: WebGLFramebuffer | null = null
        const atlas: (WebGLTexture | null)[] = [null, null, null]
        let fboAtlas: WebGLFramebuffer | null = null
        // layer targets: A (with depth) and B for blurring, F/N accumulate
        // the far and near stacks at half resolution
        const tex: Record<"A" | "B" | "F" | "N", WebGLTexture | null> = { A: null, B: null, F: null, N: null }
        const fbo: Record<"A" | "B" | "F" | "N", WebGLFramebuffer | null> = { A: null, B: null, F: null, N: null }
        let depthRb: WebGLRenderbuffer | null = null
        let halfW = 0
        let halfH = 0
        const meshes: { vao: WebGLVertexArrayObject | null; count: number }[] = [
            { vao: null, count: 0 },
            { vao: null, count: 0 },
        ]
        let instBuf: WebGLBuffer | null = null
        const inst = new Float32Array(MAX_ENTRIES * FLOATS)

        const makeTex = (g: WebGL2RenderingContext, w: number, h: number, levels: number, filter: number) => {
            const t = g.createTexture()
            g.bindTexture(g.TEXTURE_2D, t)
            g.texStorage2D(g.TEXTURE_2D, levels, g.RGBA8, w, h)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, filter)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, filter === g.NEAREST ? g.NEAREST : g.LINEAR)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
            if (levels > 1) g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAX_LEVEL, levels - 1)
            return t
        }

        const initGL = () => {
            gl = null
            ready = false
            const g = canvas.getContext("webgl2", {
                alpha: true,
                premultipliedAlpha: true,
                antialias: !soft,
                depth: true,
                stencil: false,
                powerPreference: "low-power",
                preserveDrawingBuffer: false,
            })
            if (!g) {
                failed = true
                return
            }
            parallelExt = g.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null
            pBake1 = makeProgram(g, TRI_VERT, BAKE1_FRAG)
            pBake2 = makeProgram(g, TRI_VERT, BAKE2_FRAG)
            pCookie = makeProgram(g, COOKIE_VERT, COOKIE_FRAG)
            pBlur = makeProgram(g, RECT_VERT, BLUR_FRAG)
            pComp = makeProgram(g, TRI_VERT, COMP_FRAG)
            if (!pBake1 || !pBake2 || !pCookie || !pBlur || !pComp) {
                failed = true
                return
            }

            triVao = g.createVertexArray()
            g.bindVertexArray(triVao)
            g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer())
            g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW)
            g.enableVertexAttribArray(0)
            g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0)
            rectVao = g.createVertexArray()
            g.bindVertexArray(rectVao)
            g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer())
            g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), g.STATIC_DRAW)
            g.enableVertexAttribArray(0)
            g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0)
            rectBuf = g.createBuffer()
            g.bindBuffer(g.ARRAY_BUFFER, rectBuf)
            g.bufferData(g.ARRAY_BUFFER, rects.byteLength, g.DYNAMIC_DRAW)
            g.enableVertexAttribArray(1)
            g.vertexAttribPointer(1, 4, g.FLOAT, false, 16, 0)
            g.vertexAttribDivisor(1, 1)
            g.bindVertexArray(null)

            // Random lattice for every noise and sparkle: one texel fetch
            // instead of an integer hash (slow to compile on D3D).
            const rnd = new Uint8Array(256 * 256 * 4)
            let s = 0x9e3779b9
            for (let i = 0; i < rnd.length; i++) {
                s ^= s << 13
                s ^= s >>> 17
                s ^= s << 5
                rnd[i] = (s >>> 0) & 255
            }
            noiseTex = makeTex(g, 256, 256, 1, g.NEAREST)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT)
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT)
            g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, 256, 256, g.RGBA, g.UNSIGNED_BYTE, rnd)

            t0Tex = makeTex(g, TS, TS, 1, g.NEAREST)
            t1Tex = makeTex(g, TS, TS, 1, g.NEAREST)
            fboBake = g.createFramebuffer()
            g.bindFramebuffer(g.FRAMEBUFFER, fboBake)
            g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t0Tex, 0)
            g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT1, g.TEXTURE_2D, t1Tex, 0)
            const levels = 6
            for (let k = 0; k < 3; k++) atlas[k] = makeTex(g, TS * ATLAS_COLS, TS * ATLAS_ROWS, levels, g.LINEAR_MIPMAP_LINEAR)
            fboAtlas = g.createFramebuffer()
            g.bindFramebuffer(g.FRAMEBUFFER, fboAtlas)
            for (let k = 0; k < 3; k++) g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0 + k, g.TEXTURE_2D, atlas[k], 0)
            g.bindFramebuffer(g.FRAMEBUFFER, null)

            // meshes: fine for crisp layers, coarse for blurred ones
            instBuf = g.createBuffer()
            g.bindBuffer(g.ARRAY_BUFFER, instBuf)
            g.bufferData(g.ARRAY_BUFFER, inst.byteLength, g.DYNAMIC_DRAW)
            const specs = soft ? [[12, 40], [8, 28]] : [[22, 64], [10, 36]]
            for (let m = 0; m < 2; m++) {
                const mesh = buildCookieMesh(specs[m][0], specs[m][1])
                const vao = g.createVertexArray()
                g.bindVertexArray(vao)
                g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer())
                g.bufferData(g.ARRAY_BUFFER, mesh.vtx, g.STATIC_DRAW)
                g.enableVertexAttribArray(0)
                g.vertexAttribPointer(0, 3, g.FLOAT, false, 0, 0)
                g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, g.createBuffer())
                g.bufferData(g.ELEMENT_ARRAY_BUFFER, mesh.idx, g.STATIC_DRAW)
                g.bindBuffer(g.ARRAY_BUFFER, instBuf)
                for (let k = 0; k < 7; k++) {
                    g.enableVertexAttribArray(1 + k)
                    g.vertexAttribPointer(1 + k, 4, g.FLOAT, false, FLOATS * 4, k * 16)
                    g.vertexAttribDivisor(1 + k, 1)
                }
                g.bindVertexArray(null)
                meshes[m].vao = vao
                meshes[m].count = mesh.idx.length
            }
            halfW = halfH = 0
            depthRb = null
            for (const k of ["A", "B", "F", "N"] as const) {
                tex[k] = null
                fbo[k] = null
            }
            baker.queue.length = 0
            baker.key = NaN
            baker.done = false
            gl = g
        }

        /** Links finished? Then fetch uniforms; a failed link leaves the Background. */
        const checkReady = () => {
            if (ready || !gl || failed) return ready
            const g = gl
            const all = [pBake1, pBake2, pCookie, pBlur, pComp] as Prog[]
            if (parallelExt) for (const pr of all) if (!g.getProgramParameter(pr.p, parallelExt.COMPLETION_STATUS_KHR)) return false
            const ok =
                finishProgram(g, pBake1 as Prog, BAKE1_U) &&
                finishProgram(g, pBake2 as Prog, BAKE2_U) &&
                finishProgram(g, pCookie as Prog, COOKIE_U) &&
                finishProgram(g, pBlur as Prog, BLUR_U) &&
                finishProgram(g, pComp as Prog, COMP_U)
            if (!ok) {
                failed = true
                canvas.style.display = "none"
                return false
            }
            ready = true
            return true
        }

        /** Half-resolution layer targets, reallocated only when the buffer changes size. */
        const syncTargets = (bw: number, bh: number) => {
            if (!gl) return
            const g = gl
            const hw = Math.max(1, Math.ceil(bw / 2))
            const hh = Math.max(1, Math.ceil(bh / 2))
            if (hw === halfW && hh === halfH) return
            halfW = hw
            halfH = hh
            for (const k of ["A", "B", "F", "N"] as const) {
                if (tex[k]) g.deleteTexture(tex[k])
                if (fbo[k]) g.deleteFramebuffer(fbo[k])
                tex[k] = makeTex(g, hw, hh, 1, g.LINEAR)
                fbo[k] = g.createFramebuffer()
                g.bindFramebuffer(g.FRAMEBUFFER, fbo[k])
                g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex[k], 0)
            }
            if (depthRb) g.deleteRenderbuffer(depthRb)
            depthRb = g.createRenderbuffer()
            g.bindRenderbuffer(g.RENDERBUFFER, depthRb)
            g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT16, hw, hh)
            g.bindFramebuffer(g.FRAMEBUFFER, fbo.A)
            g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, depthRb)
            g.bindFramebuffer(g.FRAMEBUFFER, null)
        }

        // ── bake: one variant per frame, so a change never stalls a frame ──
        // keys pack seed, chips and salt into one number: comparing them each
        // frame allocates nothing (a string key did, every frame)
        const baker = { key: NaN, queue: [] as number[], done: false, hc: new Float64Array(VARIANTS), pendingSince: -1, wantKey: NaN }
        const chipU = new Float32Array(MAX_CHIPS * 4)
        const chipBU = new Float32Array(MAX_CHIPS * 4)
        const saltU = new Float32Array(MAX_SALT * 4)
        const syncBake = (now: number) => {
            const c = cfg.current
            const key = Math.round(num(c.adv.seed, 0)) * 1e6 + Math.round(clamp(num(c.chips, 5), 0, 10) * 10) * 1000 + Math.round(clamp(num(c.adv.salt, 30), 0, 100))
            if (key === baker.key && baker.queue.length === 0) return
            if (key !== baker.wantKey) {
                baker.wantKey = key
                baker.pendingSince = now
            }
            // While a slider is dragged, re-bake at most every 120 ms.
            if (key !== baker.key && (now - baker.pendingSince > 120 || !baker.done)) {
                baker.key = key
                baker.queue.length = 0
                for (let v = 0; v < VARIANTS; v++) baker.queue.push(v)
            }
        }
        const bakeStep = () => {
            if (!gl || !baker.queue.length || !pBake1 || !pBake2) return
            const g = gl
            const c = cfg.current
            const v = baker.queue.shift() as number
            const seed = Math.round(num(c.adv.seed, 0))
            const hc = variantLayout(v, seed, clamp(num(c.chips, 5), 0, 10), clamp(num(c.adv.salt, 30), 0, 100), chipU, chipBU, saltU)
            baker.hc[v] = hc
            g.disable(g.DEPTH_TEST)
            g.disable(g.BLEND)
            g.disable(g.SCISSOR_TEST)
            g.disable(g.CULL_FACE)
            g.bindVertexArray(triVao)
            // pass 1
            g.bindFramebuffer(g.FRAMEBUFFER, fboBake)
            g.drawBuffers([g.COLOR_ATTACHMENT0, g.COLOR_ATTACHMENT1])
            g.viewport(0, 0, TS, TS)
            g.useProgram(pBake1.p)
            const u1 = pBake1.u
            g.activeTexture(g.TEXTURE0)
            g.bindTexture(g.TEXTURE_2D, noiseTex)
            g.uniform1i(u1.uNoise, 0)
            g.uniform1f(u1.uSeed, v)
            g.uniform1f(u1.uHc, hc)
            g.uniform1f(u1.uRes, TS)
            g.uniform4fv(u1.uChip, chipU)
            g.uniform4fv(u1.uChipB, chipBU)
            g.uniform4fv(u1.uSalt, saltU)
            g.drawArrays(g.TRIANGLES, 0, 3)
            // pass 2, into the tile
            g.bindFramebuffer(g.FRAMEBUFFER, fboAtlas)
            g.drawBuffers([g.COLOR_ATTACHMENT0, g.COLOR_ATTACHMENT1, g.COLOR_ATTACHMENT2])
            const ox = (v % ATLAS_COLS) * TS
            const oy = Math.floor(v / ATLAS_COLS) * TS
            g.viewport(ox, oy, TS, TS)
            g.useProgram(pBake2.p)
            const u2 = pBake2.u
            g.activeTexture(g.TEXTURE0)
            g.bindTexture(g.TEXTURE_2D, t0Tex)
            g.activeTexture(g.TEXTURE1)
            g.bindTexture(g.TEXTURE_2D, t1Tex)
            g.uniform1i(u2.uT0, 0)
            g.uniform1i(u2.uT1, 1)
            g.uniform1f(u2.uRes, TS)
            g.uniform1f(u2.uHc, hc)
            g.uniform1f(u2.uSeed, v)
            g.uniform2f(u2.uOrg, ox, oy)
            g.drawArrays(g.TRIANGLES, 0, 3)
            g.bindFramebuffer(g.FRAMEBUFFER, null)
            g.bindVertexArray(null)
            for (let k = 0; k < 3; k++) {
                g.bindTexture(g.TEXTURE_2D, atlas[k])
                g.generateMipmap(g.TEXTURE_2D)
            }
            if (!baker.queue.length) baker.done = true
        }

        const onLost = (e: Event) => {
            e.preventDefault()
            lost = true
            gl = null
            ready = false
            stop()
        }
        const onRestored = () => {
            lost = false
            failed = false
            initGL()
            sizeCanvas()
            wake()
        }
        canvas.addEventListener("webglcontextlost", onLost)
        canvas.addEventListener("webglcontextrestored", onRestored)

        // ── size ──
        let W = 0
        let H = 0
        let shown = 1
        let quality = 1
        let wantSize = false
        const sizeCanvas = () => {
            wantSize = true
        }
        /** Applied right before a draw, so a wiped buffer is never shown. */
        const applySize = () => {
            wantSize = false
            if (W <= 0 || H <= 0) return
            const dpr = Math.min(2, window.devicePixelRatio || 1)
            const full = dpr * clamp(shown, 1, 2)
            // The budget and the quality ladder only ever trim the extra
            // (retina) detail: the buffer never has fewer pixels than the
            // layout box.
            let s = Math.min(full, Math.sqrt((soft ? PIXEL_BUDGET_SOFT : PIXEL_BUDGET) / (W * H))) * quality
            s = Math.max(s, Math.min(1, full))
            const bw = Math.max(1, Math.round(W * s))
            const bh = Math.max(1, Math.round(H * s))
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw
                canvas.height = bh
            }
            syncTargets(bw, bh)
        }
        const measureShown = () => {
            const r = root.getBoundingClientRect()
            if (W > 0 && r.width > 0) {
                const s = r.width / W
                if (Math.abs(s - shown) / shown > 0.05) {
                    shown = s
                    return true
                }
            }
            return false
        }
        const ro = new ResizeObserver((entries) => {
            const cr = entries[0].contentRect
            W = cr.width
            H = cr.height
            measureShown()
            sizeCanvas()
            if (gl && ready) {
                // resizing wipes the buffer: redraw now, not next tick
                draw(0)
            }
            wake()
        })
        ro.observe(root)

        // ── pointer (0–1 of the root as displayed) ──
        const ptr = { cx: 0, cy: 0, moved: false, u: 0.5, v: 0.5, inside: false, lastX: NaN, lastY: NaN }
        let scrolled = false
        const readPointer = () => {
            if (!ptr.moved && !scrolled) return
            const r = root.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) {
                ptr.u = (ptr.cx - r.left) / r.width
                ptr.v = (ptr.cy - r.top) / r.height
            }
            ptr.moved = false
            scrolled = false
        }
        const tapS = { id: -1, x: 0, y: 0, t: 0 }
        let tapQueued = false
        let tapCX = 0
        let tapCY = 0
        const onMove = (e: PointerEvent) => {
            // Chrome repeats moves at the same spot after layout: ignore them.
            if (e.clientX === ptr.lastX && e.clientY === ptr.lastY && ptr.inside) return
            ptr.lastX = e.clientX
            ptr.lastY = e.clientY
            ptr.cx = e.clientX
            ptr.cy = e.clientY
            ptr.moved = true
            ptr.inside = true
            wake()
        }
        const onLeave = () => {
            ptr.inside = false
            ptr.lastX = ptr.lastY = NaN
            wake()
        }
        const onDown = (e: PointerEvent) => {
            tapS.id = e.pointerId
            tapS.x = e.clientX
            tapS.y = e.clientY
            tapS.t = performance.now()
            onMove(e)
        }
        const onUp = (e: PointerEvent) => {
            if (e.pointerId === tapS.id && performance.now() - tapS.t < 350 && Math.hypot(e.clientX - tapS.x, e.clientY - tapS.y) < 10) {
                tapQueued = true
                tapCX = e.clientX
                tapCY = e.clientY
            }
            tapS.id = -1
            if (e.pointerType === "touch") onLeave()
            wake()
        }
        const onScroll = () => {
            scrolled = true
        }
        root.addEventListener("pointermove", onMove)
        root.addEventListener("pointerdown", onDown)
        root.addEventListener("pointerup", onUp)
        root.addEventListener("pointerleave", onLeave)
        root.addEventListener("pointercancel", onLeave)
        window.addEventListener("scroll", onScroll, { capture: true, passive: true })

        // ── the Transition: played once by framer-motion, read by every cookie ──
        // framer-motion plays the panel's curve a single time per Transition
        // value and the run is recorded; each cookie's entrance and morph then
        // read their own point on it. A ripple morphs up to 80 cookies at
        // once, and 80 concurrent animations — each with its own per-frame
        // callback and garbage — were what made it stutter.
        const CURVE_N = 4096
        const curve = {
            ref: null as unknown,
            key: "",
            t: new Float64Array(CURVE_N),
            v: new Float64Array(CURVE_N),
            n: 0,
            done: false,
            t0: 0,
            anim: null as AnimationPlaybackControls | null,
        }
        const curvePush = (t: number, v: number) => {
            const n = curve.n
            if (n > 0 && t <= curve.t[n - 1]) {
                curve.v[n - 1] = v
                return
            }
            if (n >= CURVE_N) return
            curve.t[n] = t
            curve.v[n] = v
            curve.n = n + 1
        }
        /** Make sure the current Transition's run is recorded (or recording). */
        const ensureCurve = () => {
            const tr = cfg.current.transition ?? DEFAULT_TRANSITION
            if (tr === curve.ref) return
            curve.ref = tr
            let key = ""
            try {
                key = JSON.stringify(tr)
            } catch {
                key = String(performance.now())
            }
            if (key === curve.key) return
            curve.anim?.stop()
            curve.key = key
            curve.n = 0
            curve.done = false
            curve.t0 = performance.now()
            curvePush(0, 0)
            curve.anim = animate(0, 1, {
                ...(tr as ValueAnimationTransition<number>),
                delay: 0,
                // the animation's own clock, so a hidden tab mid-recording
                // leaves no flat stretch in the curve
                onUpdate: (v: number) => {
                    curvePush(curve.anim ? curve.anim.time * 1000 : performance.now() - curve.t0, v)
                    wake()
                },
                onComplete: () => {
                    curvePush(curve.n ? curve.t[curve.n - 1] + 1 : 1, 1)
                    curve.done = true
                    curve.anim = null
                    wake()
                },
            })
        }
        /** The Transition's value ms after a cookie's own start. */
        const curveAt = (ms: number) => {
            const n = curve.n
            if (ms <= 0 || n === 0) return 0
            if (ms >= curve.t[n - 1]) return curve.done ? 1 : curve.v[n - 1]
            let lo = 0
            let hi = n - 1
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1
                if (curve.t[mid] <= ms) lo = mid
                else hi = mid
            }
            return curve.v[lo] + ((curve.v[hi] - curve.v[lo]) * (ms - curve.t[lo])) / (curve.t[hi] - curve.t[lo])
        }
        const curveOver = (ms: number) => curve.done && ms >= curve.t[curve.n - 1]

        // ── flavour changes ──
        const flavourCount = () => Math.max(1, Math.min(16, cfg.current.flavs.length))
        /** Morph cookie i to its next (or a random other) flavour, starting at (ox, oy) on its top. */
        const startChange = (i: number, delay: number, ox: number, oy: number) => {
            const ck = cks[i]
            const n = flavourCount()
            if (n < 2) return
            if (ck.morphing) {
                // finish the one in flight first, then morph again
                ck.queued = true
                return
            }
            ensureCurve()
            ck.flavB = cfg.current.morph.order === "random" ? ck.flavA + 1 + Math.floor(Math.random() * (n - 1)) : ck.flavA + 1
            ck.mox = ox
            ck.moy = oy
            ck.blend = 0
            ck.morphing = true
            ck.mStart = performance.now() + delay * 1000
            wake()
        }
        let nextWave = -1
        let waveTimer = 0
        /**
         * A camera-space direction (y up) from a cookie's centre, turned into
         * the cookie's own frame: the point at share r of its radius on that
         * side of its top. Written to lp.
         */
        const lp = new Float64Array(2)
        const localPoint = (ck: Cookie, dx: number, dy: number, r: number) => {
            const qw = ck.q[0],
                qx = -ck.q[1],
                qy = -ck.q[2],
                qz = -ck.q[3]
            const tx = -2 * qz * dy
            const ty = 2 * qz * dx
            const tz = 2 * (qx * dy - qy * dx)
            let lx = dx + qw * tx + (qy * tz - qz * ty)
            let ly = dy + qw * ty + (qz * tx - qx * tz)
            const l = Math.sqrt(lx * lx + ly * ly)
            if (l > 1e-4) {
                lx /= l
                ly /= l
            } else {
                lx = 1
                ly = 0
            }
            lp[0] = lx * r
            lp[1] = ly * r
        }

        // ── entrance: each cookie fades in and racks into focus ──
        let entered = false
        let entering = false
        const playEntrance = () => {
            entered = true
            if (isCanvas || mq?.matches) {
                for (const ck of cks) ck.enter = 1
                dirty = true
                return
            }
            ensureCurve()
            const t0 = performance.now()
            for (let i = 0; i < MAX_COOKIES; i++) {
                const ck = cks[i]
                ck.enter = 0
                ck.enterStart = t0 + (0.1 + ENTER_SPREAD * hash01(i, 7, 77)) * 1000
            }
            entering = true
        }

        // ── per-frame scratch (no allocation in the loop) ──
        const qa = new Float64Array(4)
        const qb = new Float64Array(4)
        const qPlace = new Float64Array(4)
        const qTmp = new Float64Array(4)
        const binList: Int16Array[] = []
        const binAlpha: Float32Array[] = []
        const BINS = 2 * MAX_LEVEL + 1
        for (let b = 0; b < BINS; b++) {
            binList.push(new Int16Array(MAX_COOKIES))
            binAlpha.push(new Float32Array(MAX_COOKIES))
        }
        const binLen = new Int16Array(BINS)
        const binStart = new Int16Array(BINS)
        const binBox = new Float64Array(BINS * 4)
        const order = new Int16Array(BINS)
        const flavLin = new Float64Array(16 * 6)
        const scratch = new Float32Array(MAX_COOKIES * FLOATS)
        let flavN = 1

        let motionClock = 0
        let spinClock = 0
        let parX = 0
        let parY = 0
        let dirty = true
        let animating = true

        /** Put cookie i (pose already set) into blur layer lvl with weight al2. */
        const addEntry = (i: number, ck: Cookie, lvl: number, al2: number) => {
            if (al2 <= 0.004) return
            const b = lvl === 0 ? 0 : ck.near ? MAX_LEVEL + lvl : lvl
            const n = binLen[b]
            binList[b][n] = i
            binAlpha[b][n] = al2 * ck.alpha
            binLen[b] = n + 1
            const marg = lvl === 0 ? 2 : BLUR_C0 * Math.pow(2, lvl - 1) * 1.6 + 2
            const o = b * 4
            binBox[o] = Math.min(binBox[o], ck.bx - ck.rb - marg)
            binBox[o + 1] = Math.min(binBox[o + 1], ck.by - ck.rb - marg)
            binBox[o + 2] = Math.max(binBox[o + 2], ck.bx + ck.rb + marg)
            binBox[o + 3] = Math.max(binBox[o + 3], ck.by + ck.rb + marg)
        }

        // ── GPU passes: defined once, so a frame allocates nothing ──
        let frameBW = 1
        let frameBH = 1
        const drawBin = (b: number, lvl: number) => {
            const g = gl as WebGL2RenderingContext
            const n = binLen[b]
            const mesh = meshes[soft || lvl >= LO_MESH_LEVEL ? 1 : 0]
            g.bindVertexArray(mesh.vao)
            g.bindBuffer(g.ARRAY_BUFFER, instBuf)
            const off = binStart[b] * FLOATS * 4
            for (let k = 0; k < 7; k++) g.vertexAttribPointer(1 + k, 4, g.FLOAT, false, FLOATS * 4, off + k * 16)
            g.drawElementsInstanced(g.TRIANGLES, mesh.count, g.UNSIGNED_SHORT, 0, n)
        }
        const stateCookies = () => {
            const g = gl as WebGL2RenderingContext
            g.useProgram((pCookie as Prog).p)
            g.enable(g.DEPTH_TEST)
            g.depthMask(true)
            g.depthFunc(g.LEQUAL)
            g.enable(g.CULL_FACE)
            g.cullFace(g.BACK)
            g.enable(g.BLEND)
            g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA)
        }
        const stateFlat = () => {
            const g = gl as WebGL2RenderingContext
            g.disable(g.DEPTH_TEST)
            g.disable(g.CULL_FACE)
            g.bindVertexArray(triVao)
        }
        /** Draw a soft layer at its own resolution, blur it, stack it onto dst. */
        const softLayer = (b: number, lvl: number, dst: "F" | "N") => {
            const g = gl as WebGL2RenderingContext
            const cDev = BLUR_C0 * Math.pow(2, lvl - 1)
            const sig = cDev / 2
            const rs = clamp(1.6 / sig, 1 / 24, 0.5)
            const aw = Math.max(1, Math.min(halfW, Math.ceil(frameBW * rs)))
            const ah = Math.max(1, Math.min(halfH, Math.ceil(frameBH * rs)))
            const o = b * 4
            const k = 6
            const bx0 = clamp(Math.floor(binBox[o] * rs) - k, 0, aw)
            const by0 = clamp(Math.floor(binBox[o + 1] * rs) - k, 0, ah)
            const bx1 = clamp(Math.ceil(binBox[o + 2] * rs) + k, 0, aw)
            const by1 = clamp(Math.ceil(binBox[o + 3] * rs) + k, 0, ah)
            if (bx1 <= bx0 || by1 <= by0) return
            g.bindFramebuffer(g.FRAMEBUFFER, fbo.A)
            g.viewport(0, 0, aw, ah)
            g.enable(g.SCISSOR_TEST)
            g.scissor(0, 0, aw, ah)
            g.clearColor(0, 0, 0, 0)
            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT)
            g.scissor(bx0, by0, bx1 - bx0, by1 - by0)
            stateCookies()
            drawBin(b, lvl)
            stateFlat()
            g.disable(g.BLEND)
            const st2 = sig * rs
            const cl0 = 0.5 / halfW
            const cl1 = 0.5 / halfH
            const cl2 = (aw - 0.5) / halfW
            const cl3 = (ah - 0.5) / halfH
            const pb = pBlur as Prog
            if (st2 > 0.3) {
                g.useProgram(pb.p)
                g.uniform1i(pb.u.uTex, 4)
                g.uniform1f(pb.u.uSig, st2)
                g.uniform4f(pb.u.uClamp, cl0, cl1, cl2, cl3)
                g.uniform1f(pb.u.uRS, rs)
                g.uniform2f(pb.u.uTS, aw, ah)
                g.activeTexture(g.TEXTURE4)
                g.bindVertexArray(rectVao)
                g.bindBuffer(g.ARRAY_BUFFER, rectBuf)
                g.vertexAttribPointer(1, 4, g.FLOAT, false, 16, binStart[b] * 16)
                g.scissor(0, 0, aw, ah)
                // across: rows above and below too, which the pass down reads
                g.bindFramebuffer(g.FRAMEBUFFER, fbo.B)
                g.bindTexture(g.TEXTURE_2D, tex.A)
                g.uniform2f(pb.u.uDir, 1, 0)
                g.uniform2f(pb.u.uGrow, 1, 7)
                g.drawArraysInstanced(g.TRIANGLES, 0, 6, binLen[b])
                g.bindFramebuffer(g.FRAMEBUFFER, fbo.A)
                g.bindTexture(g.TEXTURE_2D, tex.B)
                g.uniform2f(pb.u.uDir, 0, 1)
                g.uniform2f(pb.u.uGrow, 1, 1)
                g.drawArraysInstanced(g.TRIANGLES, 0, 6, binLen[b])
                g.bindVertexArray(triVao)
            }
            // stack onto the half-res accumulator
            const pcm = pComp as Prog
            g.useProgram(pcm.p)
            g.bindFramebuffer(g.FRAMEBUFFER, fbo[dst])
            g.viewport(0, 0, halfW, halfH)
            const hs = halfW / frameBW
            const dx0 = clamp(Math.floor(((bx0 - 1) / rs) * hs), 0, halfW)
            const dy0 = clamp(Math.floor(((by0 - 1) / rs) * (halfH / frameBH)), 0, halfH)
            const dx1 = clamp(Math.ceil(((bx1 + 1) / rs) * hs), 0, halfW)
            const dy1 = clamp(Math.ceil(((by1 + 1) / rs) * (halfH / frameBH)), 0, halfH)
            if (dx1 <= dx0 || dy1 <= dy0) return
            g.scissor(dx0, dy0, dx1 - dx0, dy1 - dy0)
            g.enable(g.BLEND)
            g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA)
            g.activeTexture(g.TEXTURE4)
            g.bindTexture(g.TEXTURE_2D, tex.A)
            g.uniform1i(pcm.u.uTex, 4)
            g.uniform2f(pcm.u.uMap, (rs * (frameBW / halfW)) / halfW, (rs * (frameBH / halfH)) / halfH)
            g.uniform4f(pcm.u.uClamp, cl0, cl1, cl2, cl3)
            g.drawArrays(g.TRIANGLES, 0, 3)
        }

        const clearTarget = (k: "F" | "N") => {
            const g = gl as WebGL2RenderingContext
            g.bindFramebuffer(g.FRAMEBUFFER, fbo[k])
            g.viewport(0, 0, halfW, halfH)
            g.disable(g.SCISSOR_TEST)
            g.clearColor(0, 0, 0, 0)
            g.clear(g.COLOR_BUFFER_BIT)
        }
        const stack = (k: "F" | "N") => {
            const g = gl as WebGL2RenderingContext
            const pcm = pComp as Prog
            stateFlat()
            g.useProgram(pcm.p)
            g.enable(g.BLEND)
            g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA)
            g.activeTexture(g.TEXTURE4)
            g.bindTexture(g.TEXTURE_2D, tex[k])
            g.uniform1i(pcm.u.uTex, 4)
            g.uniform2f(pcm.u.uMap, (halfW / frameBW) / halfW, (halfH / frameBH) / halfH)
            g.uniform4f(pcm.u.uClamp, 0.5 / halfW, 0.5 / halfH, 1 - 0.5 / halfW, 1 - 0.5 / halfH)
            g.drawArrays(g.TRIANGLES, 0, 3)
        }

        const draw = (dtMs: number) => {
            if (!gl || !ready || W <= 0 || H <= 0) return
            const g = gl
            const c = cfg.current
            const a = c.adv
            const now = performance.now()
            const reduced = !!mq?.matches
            const dt = Math.min(dtMs, 100) / 1000
            if (wantSize) applySize()
            const bw = canvas.width
            const bh = canvas.height
            syncCookies()
            syncBake(now)
            bakeStep()
            if (!baker.done) {
                // first bake still running: nothing to show yet
                g.bindFramebuffer(g.FRAMEBUFFER, null)
                g.viewport(0, 0, bw, bh)
                g.clearColor(0, 0, 0, 0)
                g.clear(g.COLOR_BUFFER_BIT)
                animating = true
                return
            }
            if (!entered && visible) playEntrance()

            // ── panel ──
            const sizeCss = clamp(num(c.cookieSize, DEFAULTS.cookieSize), 20, 600)
            const spd = reduced ? 0 : clamp(num(c.speed, 4), 0, 10) / 4
            const spn = reduced ? 0 : clamp(num(c.spin, 4), 0, 10) / 4
            const dir = c.direction === "rise" ? 1 : c.direction === "float" ? 0 : -1
            const pl = c.place
            const angle = (clamp(num(pl.angle, 0), -180, 180) * Math.PI) / 180
            const tilt = (clamp(num(pl.tilt, 0), -60, 60) * Math.PI) / 180
            const offX = clamp(num(pl.x, 0), -50, 50) / 100
            const offY = clamp(num(pl.y, 0), -50, 50) / 100
            const pt = c.pointer
            const reach = 0.05 + clamp(num(pt.reach, 5), 0, 10) * 0.035
            const pushK = clamp(num(pt.push, 5), 0, 10) * 0.02
            const parK = reduced ? 0 : clamp(num(pt.parallax, 4), 0, 10)
            const mo = c.morph
            const styleIdx = reduced ? 3 : mo.style === "marble" ? 1 : mo.style === "flip" ? 2 : 0
            const swellK = reduced ? 0 : clamp(num(mo.swell, DEFAULT_MORPH.swell), 0, 10) / 4
            const maxBlur = clamp(num(a.maxBlur, 14), 0, 60)
            const hazeK = clamp(num(a.haze, 18), 0, 100) / 100

            flavN = Math.min(16, c.flavs.length || 1)
            for (let k = 0; k < flavN; k++) {
                const d0 = linearColour(c.flavs[k].dough, DEFAULT_FLAVORS[0].dough)
                const c0 = linearColour(c.flavs[k].chips, DEFAULT_FLAVORS[0].chips)
                flavLin[k * 6] = d0[0]
                flavLin[k * 6 + 1] = d0[1]
                flavLin[k * 6 + 2] = d0[2]
                flavLin[k * 6 + 3] = c0[0]
                flavLin[k * 6 + 4] = c0[1]
                flavLin[k * 6 + 5] = c0[2]
            }
            const bg = linearColour(c.background, DEFAULTS.background)

            // ── frame → scene: contain the reference composition ──
            const S = Math.min(H, W / REF_ASPECT)
            // Cookies counts the reference frame; a frame that sees more of
            // the field sees more cookies, at the same density.
            const N = clamp(Math.round(num(c.cookies, DEFAULTS.cookies) * ((W * H) / (S * S) / REF_ASPECT)), 0, MAX_COOKIES)
            const tanY = (HALF_H * (H / S)) / FOCUS_Z
            const tanX = tanY * (W / H)
            const fy = 1 / tanY
            const fx = 1 / tanX
            /** Scene units per S at the focus plane. */
            const unitS = 2 * HALF_H
            const rBase = (sizeCss / 2 / REF_H) * unitS
            const cssToBuf = bw / W
            const blurPx = maxBlur * (S / REF_H) // CSS px at infinity

            // ── parallax: the camera slides, the focus plane stays registered ──
            let tpx = 0
            let tpy = 0
            if (ptr.inside && parK > 0) {
                tpx = (clamp(ptr.u, 0, 1) - 0.5) * parK * 0.18
                tpy = (0.5 - clamp(ptr.v, 0, 1)) * parK * 0.18 * (H / W)
            }
            const pe = 1 - Math.exp(-dt / 0.35)
            parX += (tpx - parX) * pe
            parY += (tpy - parY) * pe
            if (Math.abs(tpx - parX) < 1e-4 && Math.abs(tpy - parY) < 1e-4) {
                parX = tpx
                parY = tpy
            }
            const shX = (fx * parX) / FOCUS_Z
            const shY = (fy * parY) / FOCUS_Z

            motionClock += dt * spd
            spinClock += dt * spn

            // placement: the field rolls by Angle and leans by Tilt about
            // the focus point; camera = Rz(−A)·(P + Rx(−T)·(f − P))
            const ca = Math.cos(angle)
            const sa = Math.sin(angle)
            const ct = Math.cos(tilt)
            const st = Math.sin(tilt)
            qAxis(qa, 0, 0, 1, -angle)
            qAxis(qb, 1, 0, 0, -tilt)
            qMul(qPlace, qa, qb)
            // ray origin of the camera in field space: P − Rx(T)·P
            const ofy = -FOCUS_Z * st
            const ofz = -FOCUS_Z + FOCUS_Z * ct

            // entrance and morphs read the recorded Transition
            if (entering) {
                let any = false
                for (let i = 0; i < MAX_COOKIES; i++) {
                    const ck = cks[i]
                    const ms = now - ck.enterStart
                    if (curveOver(ms)) ck.enter = 1
                    else {
                        ck.enter = curveAt(ms)
                        any = true
                    }
                }
                entering = any
            }
            let busy = spd > 0 || spn > 0 || entering || Math.abs(tpx - parX) > 1e-4 || Math.abs(tpy - parY) > 1e-4
            for (let i = 0; i < MAX_COOKIES; i++) {
                const ck = cks[i]
                if (!ck.morphing) continue
                busy = true
                const ms = now - ck.mStart
                if (curveOver(ms)) {
                    ck.flavA = ck.flavB
                    ck.blend = 0
                    ck.morphing = false
                    if (ck.queued) {
                        ck.queued = false
                        startChange(i, 0, ck.mox, ck.moy)
                    }
                } else ck.blend = curveAt(ms)
            }
            const pU = ptr.u
            const pV = ptr.v
            const aspS = W / S
            const aspH = H / S

            for (let i = 0; i < N; i++) {
                const ck = cks[i]
                const z = FOCUS_Z / ck.d
                const rw = rBase * ck.size
                ck.rw = rw
                // wrap box: where the frame's corner rays meet this cookie's
                // depth plane, in field space, plus room to hide the wrap
                let x0 = Infinity,
                    x1 = -Infinity,
                    y0 = Infinity,
                    y1 = -Infinity
                for (let k = 0; k < 4; k++) {
                    const dx0 = (k & 1 ? 1 : -1) * tanX
                    const dy0 = (k & 2 ? 1 : -1) * tanY
                    // Rz(A)·dir, then Rx(T)
                    const rx = dx0 * ca - dy0 * sa
                    const ry = dx0 * sa + dy0 * ca
                    const dyf = ry * ct + st
                    const dzf = ry * st - ct
                    let tt = dzf < -1e-3 ? (-z - ofz) / dzf : 6 * FOCUS_Z
                    if (!(tt > 0)) tt = 6 * FOCUS_Z
                    tt = Math.min(tt, 6 * FOCUS_Z)
                    const px = rx * tt
                    const py = ofy + dyf * tt
                    if (px < x0) x0 = px
                    if (px > x1) x1 = px
                    if (py < y0) y0 = py
                    if (py > y1) y1 = py
                }
                const m = rw * 1.45 + z * tanY * 0.12
                x0 -= m
                x1 += m
                y0 -= m
                y1 += m
                const bwd = x1 - x0
                const bht = y1 - y0
                // flow
                ck.ny = (((ck.ny + (dir * FLOW_SPEED * ck.rate * dt * spd) / bht) % 1) + 1) % 1
                // offsets slide the field on screen, whatever its angle
                const sxw = offX * 2 * z * tanX
                const syw = -offY * 2 * z * tanY
                const shiftX = (sxw * ca - syw * sa) / bwd
                const shiftY = (sxw * sa + syw * ca) / bht
                const fxp = x0 + ((((ck.nx + shiftX) % 1) + 1) % 1) * bwd + ck.swA * rw * Math.sin(ck.swW * motionClock + ck.swP) * (dir === 0 ? 1.4 : 1)
                const fyp = y0 + ((((ck.ny + shiftY) % 1) + 1) % 1) * bht + (dir === 0 ? ck.bobA * rw * Math.sin(ck.bobW * motionClock + ck.bobP) : 0)
                // field → camera
                const lz = -z + FOCUS_Z
                const ry2 = fyp * ct + lz * st
                const rz2 = -fyp * st + lz * ct
                const cxp = fxp * ca + ry2 * sa
                const cyp = -fxp * sa + ry2 * ca
                const czp = rz2 - FOCUS_Z
                ck.cx = cxp - parX
                ck.cy = cyp - parY
                ck.cz = czp
                const iz = 1 / Math.max(0.5, -czp)
                // base screen position (0–1 of the frame), before the push
                ck.bu = (ck.cx * fx * iz + shX) * 0.5 + 0.5
                ck.bv = 0.5 - (ck.cy * fy * iz + shY) * 0.5
                ck.rS = (rw * fy * iz * 0.5) * aspH // radius as a share of S
            }

            // ── springs: pointer push, neighbours making room, spin kicks ──
            // Targets come from the un-pushed positions, so nothing feeds back.
            const steps = Math.max(1, Math.ceil(dt / 0.004))
            const h = dt / steps
            const W1 = 13
            const Z1 = 0.9
            const W2 = 4.2
            const Z2 = 0.42
            let springBusy = false
            for (let i = 0; i < N; i++) {
                const ck = cks[i]
                let tx = 0
                let ty = 0
                if (ptr.inside && pushK > 0) {
                    const dxS = (ck.bu - pU) * aspS
                    const dyS = (ck.bv - pV) * aspH
                    const dd = Math.sqrt(dxS * dxS + dyS * dyS)
                    const R = reach + ck.rS * 0.6
                    if (dd < R) {
                        const f = (1 - dd / R) * (1 - dd / R)
                        const nxv = dd > 1e-5 ? dxS / dd : 0.7071
                        const nyv = dd > 1e-5 ? dyS / dd : -0.7071
                        tx += nxv * pushK * f * (1 + ck.rS * 3)
                        ty += nyv * pushK * f * (1 + ck.rS * 3)
                    }
                }
                // make room for a neighbour at nearly the same depth, so two
                // cookies never pass through each other
                const ext = ck.rw * 0.95
                for (let j = 0; j < N; j++) {
                    if (j === i) continue
                    const o = cks[j]
                    if (Math.abs(o.cz - ck.cz) > ext + o.rw * 0.95) continue
                    const dxS = (ck.bu - o.bu) * aspS
                    const dyS = (ck.bv - o.bv) * aspH
                    const need = (ck.rS + o.rS) * 1.06
                    const d2 = dxS * dxS + dyS * dyS
                    if (d2 >= need * need) continue
                    const dd = Math.sqrt(d2)
                    const ov = (need - dd) * 0.5
                    if (dd > 1e-5) {
                        tx += (dxS / dd) * ov
                        ty += (dyS / dd) * ov
                    } else {
                        tx += (i < j ? 1 : -1) * ov
                    }
                }
                const pvx = ck.ox
                const pvy = ck.oy
                for (let s = 0; s < steps; s++) {
                    ck.vx += (-2 * Z1 * W1 * ck.vx - W1 * W1 * (ck.ox - tx)) * h
                    ck.vy += (-2 * Z1 * W1 * ck.vy - W1 * W1 * (ck.oy - ty)) * h
                    ck.ox += ck.vx * h
                    ck.oy += ck.vy * h
                    ck.wx += (-2 * Z2 * W2 * ck.wx - W2 * W2 * ck.kx) * h
                    ck.wy += (-2 * Z2 * W2 * ck.wy - W2 * W2 * ck.ky) * h
                    ck.wz += (-2 * Z2 * W2 * ck.wz - W2 * W2 * ck.kz) * h
                    ck.kx += ck.wx * h
                    ck.ky += ck.wy * h
                    ck.kz += ck.wz * h
                }
                if (!reduced) {
                    // a brushed cookie tips away from where it was pushed
                    ck.wx += (ck.oy - pvy) * 14
                    ck.wy += (ck.ox - pvx) * 14
                }
                const moving =
                    Math.abs(ck.vx) + Math.abs(ck.vy) > 1e-4 || Math.abs(ck.ox - tx) + Math.abs(ck.oy - ty) > 1e-4 ||
                    // a wobble under ~0.1° is invisible: let it rest
                    Math.abs(ck.wx) + Math.abs(ck.wy) + Math.abs(ck.wz) > 6e-3 || Math.abs(ck.kx) + Math.abs(ck.ky) + Math.abs(ck.kz) > 2e-3
                if (moving) springBusy = true
                else {
                    ck.ox = tx
                    ck.oy = ty
                    ck.vx = ck.vy = ck.wx = ck.wy = ck.wz = ck.kx = ck.ky = ck.kz = 0
                }
            }
            if (springBusy) busy = true

            // ── final pose, blur level, entries ──
            binLen.fill(0)
            for (let b = 0; b < BINS; b++) {
                binBox[b * 4] = binBox[b * 4 + 1] = Infinity
                binBox[b * 4 + 2] = binBox[b * 4 + 3] = -Infinity
            }
            for (let i = 0; i < N; i++) {
                const ck = cks[i]
                // the push, in scene units at this depth
                const perS = (unitS * -ck.cz) / FOCUS_Z
                ck.cx += ck.ox * perS
                ck.cy -= ck.oy * perS
                const iz = 1 / Math.max(0.5, -ck.cz)
                ck.u = (ck.cx * fx * iz + shX) * 0.5 + 0.5
                ck.v = 0.5 - (ck.cy * fy * iz + shY) * 0.5
                // orientation: kick · placement · wobble · spin
                const th = ck.t0 + ck.wA * Math.sin(ck.wW * spinClock + ck.wP)
                const al = ck.ax0 + ck.prW * spinClock
                qAxis(qa, Math.cos(al), Math.sin(al), 0, th)
                qAxis(qb, 0, 0, 1, ck.spW * spinClock + ck.spP)
                qMul(qTmp, qa, qb)
                qMul(qa, qPlace, qTmp)
                qRotvec(qb, ck.kx, ck.ky, ck.kz)
                qMul(ck.q, qb, qa)
                const mp = ck.morphing ? ck.blend : 0
                if (mp !== 0 && styleIdx === 2) {
                    // flip: a full somersault about the axis across the start point
                    const fl = Math.sqrt(ck.mox * ck.mox + ck.moy * ck.moy) || 1
                    qAxis(qb, -ck.moy / fl, ck.mox / fl, 0, Math.PI * 2 * mp)
                    qMul(ck.q, ck.q, qb)
                }
                const e = clamp(ck.enter, 0, 1.4)
                const ea = clamp(e * 1.6, 0, 1)
                ck.alpha = ea
                if (ea <= 0.003) continue
                // entrance growth, and the morph's swell (a hop on a flip)
                const sw = mp !== 0 ? Math.sin(Math.PI * clamp(mp, 0, 1)) * swellK * (styleIdx === 2 ? 0.07 : 0.045) : 0
                ck.rw *= (0.82 + 0.18 * e) * (1 + sw)
                // screen position and radius in buffer px
                ck.bx = ck.u * bw
                ck.by = (1 - ck.v) * bh
                ck.rb = ck.rw * 1.08 * fy * iz * 0.5 * bh
                if (ck.bx + ck.rb < -bw * 0.1 || ck.bx - ck.rb > bw * 1.1 || ck.by + ck.rb < -bh * 0.1 || ck.by - ck.rb > bh * 1.1) continue
                // depth of field: blur ∝ |1 − focus/depth|; the entrance racks in
                const pull = 1 + 3.5 * (1 - Math.min(1, e)) * (1 - Math.min(1, e))
                const coc = blurPx * cssToBuf * Math.abs(1 - FOCUS_Z * iz) * pull
                ck.near = -ck.cz < FOCUS_Z
                const lv = coc <= BLUR_C0 * 0.5 ? 0 : Math.min(MAX_LEVEL, Math.max(0, Math.log2(coc / BLUR_C0) + 1))
                ck.level = lv
                // into one or two layers
                const k0 = Math.min(Math.floor(lv), MAX_LEVEL)
                const f = k0 >= MAX_LEVEL ? 0 : lv - k0
                if (f <= 0) addEntry(i, ck, k0, 1)
                else if (!ck.near) {
                    // far stack: the blurrier copy goes down first
                    addEntry(i, ck, k0 + 1, Math.min(1, f * 12))
                    addEntry(i, ck, k0, 1 - f)
                } else {
                    addEntry(i, ck, k0, Math.min(1, (1 - f) * 12))
                    addEntry(i, ck, k0 + 1, f)
                }
                // pack the instance once; entries point at it by cookie
                const fa = ((ck.flavA % flavN) + flavN) % flavN
                const fb = ((ck.flavB % flavN) + flavN) % flavN
                const base = i * FLOATS
                scratch[base] = ck.cx
                scratch[base + 1] = ck.cy
                scratch[base + 2] = ck.cz
                scratch[base + 3] = ck.rw
                scratch[base + 4] = ck.q[0]
                scratch[base + 5] = ck.q[1]
                scratch[base + 6] = ck.q[2]
                scratch[base + 7] = ck.q[3]
                scratch[base + 8] = flavLin[fa * 6]
                scratch[base + 9] = flavLin[fa * 6 + 1]
                scratch[base + 10] = flavLin[fa * 6 + 2]
                scratch[base + 11] = ck.variant
                scratch[base + 12] = flavLin[fa * 6 + 3]
                scratch[base + 13] = flavLin[fa * 6 + 4]
                scratch[base + 14] = flavLin[fa * 6 + 5]
                scratch[base + 15] = ck.morphing ? clamp(ck.blend, 0, 1) : 0
                scratch[base + 16] = flavLin[fb * 6]
                scratch[base + 17] = flavLin[fb * 6 + 1]
                scratch[base + 18] = flavLin[fb * 6 + 2]
                scratch[base + 19] = 1
                scratch[base + 20] = flavLin[fb * 6 + 3]
                scratch[base + 21] = flavLin[fb * 6 + 4]
                scratch[base + 22] = flavLin[fb * 6 + 5]
                scratch[base + 23] = hazeK * Math.pow(Math.max(0, 1 - FOCUS_Z * iz), 1.2)
                scratch[base + 24] = ck.mox
                scratch[base + 25] = ck.moy
                scratch[base + 26] = baker.hc[ck.variant]
                scratch[base + 27] = 0
            }

            // ── colour morph: on a tap, and on a loop ──
            const trig = mo.trigger
            if (tapQueued) {
                tapQueued = false
                if ((trig === "tap" || trig === "both") && flavN > 1) {
                    const r = root.getBoundingClientRect()
                    if (r.width > 0 && r.height > 0) {
                        const tu = (tapCX - r.left) / r.width
                        const tv = (tapCY - r.top) / r.height
                        // the cookie under the finger morphs from the very
                        // spot touched; neighbours follow as a ripple
                        let best = -1
                        let bestZ = -Infinity
                        for (let i = 0; i < N; i++) {
                            const ck = cks[i]
                            if (ck.alpha < 0.5) continue
                            const du = (ck.u - tu) * aspS
                            const dv = (ck.v - tv) * aspH
                            const dS = Math.sqrt(du * du + dv * dv)
                            if (dS < ck.rS * 0.95 && ck.cz > bestZ) {
                                best = i
                                bestZ = ck.cz
                            }
                        }
                        const reachS = clamp(num(mo.tapReach, DEFAULT_MORPH.tapReach), 0, 10) * 0.08
                        for (let i = 0; i < N; i++) {
                            const ck = cks[i]
                            if (ck.alpha < 0.5) continue
                            // camera-space direction from the cookie toward the tap
                            const dx = (tu - ck.u) * aspS
                            const dy = -(tv - ck.v) * aspH
                            const dS = Math.sqrt(dx * dx + dy * dy)
                            if (i === best) {
                                localPoint(ck, dx, dy, Math.min(0.95, dS / Math.max(ck.rS, 1e-4)))
                                startChange(i, 0, lp[0], lp[1])
                                if (!reduced) {
                                    ck.wx += -dy * 2.2
                                    ck.wy += dx * 2.2
                                }
                            } else if (reachS > 0) {
                                const gap = dS - ck.rS
                                if (gap < reachS) {
                                    localPoint(ck, dx, dy, 1)
                                    startChange(i, Math.max(0, gap) / 0.35, lp[0], lp[1])
                                }
                            }
                        }
                    }
                }
            }
            if ((trig === "loop" || trig === "both") && flavN > 1 && entered) {
                const period = clamp(num(mo.every, DEFAULT_MORPH.every), 0.5, 60) * 1000
                if (nextWave < 0) nextWave = now + period * 0.6
                if (now >= nextWave) {
                    nextWave = now + period
                    const sweep = clamp(num(mo.sweep, DEFAULT_MORPH.sweep), 0, 10)
                    const half = Math.sqrt(aspS * aspS + aspH * aspH) * 0.5
                    for (let i = 0; i < N; i++) {
                        const ck = cks[i]
                        if (mo.spread === "ripple") {
                            // outward from the middle of the frame
                            const dx = (0.5 - ck.u) * aspS
                            const dy = -(0.5 - ck.v) * aspH
                            localPoint(ck, dx, dy, 1)
                            startChange(i, (sweep * Math.sqrt(dx * dx + dy * dy)) / half, lp[0], lp[1])
                        } else if (mo.spread === "scatter") {
                            // one by one, each from somewhere on its own top
                            const an = Math.random() * Math.PI * 2
                            localPoint(ck, Math.cos(an), Math.sin(an), 0.6 * Math.random())
                            startChange(i, sweep * Math.random(), lp[0], lp[1])
                        } else {
                            // a sweep from the top-left corner
                            localPoint(ck, -0.7071, 0.7071, 1)
                            startChange(i, sweep * clamp((ck.u + ck.v) * 0.5, 0, 1), lp[0], lp[1])
                        }
                    }
                    busy = true
                }
            } else nextWave = -1

            // ── order: far stack (blurriest first), crisp, near stack ──
            let no = 0
            for (let l = MAX_LEVEL; l >= 1; l--) order[no++] = l
            order[no++] = 0
            for (let l = 1; l <= MAX_LEVEL; l++) order[no++] = MAX_LEVEL + l
            let ne = 0
            for (let oi = 0; oi < BINS; oi++) {
                const b = order[oi]
                const n = binLen[b]
                binStart[b] = ne
                if (!n) continue
                // back to front inside the layer
                const L = binList[b]
                const A = binAlpha[b]
                for (let x = 1; x < n; x++) {
                    const li = L[x]
                    const la = A[x]
                    const zz = cks[li].cz
                    let y = x - 1
                    while (y >= 0 && cks[L[y]].cz > zz) {
                        L[y + 1] = L[y]
                        A[y + 1] = A[y]
                        y--
                    }
                    L[y + 1] = li
                    A[y + 1] = la
                }
                // blur reach of this layer, drawing-buffer px
                const marg = b === 0 ? 2 : BLUR_C0 * Math.pow(2, (b > MAX_LEVEL ? b - MAX_LEVEL : b) - 1) * 1.6 + 2
                for (let x = 0; x < n; x++) {
                    const ck = cks[L[x]]
                    const src = L[x] * FLOATS
                    const dst = ne * FLOATS
                    for (let k = 0; k < FLOATS; k++) inst[dst + k] = scratch[src + k]
                    inst[dst + 19] = A[x]
                    rects[ne * 4] = ck.bx - ck.rb - marg
                    rects[ne * 4 + 1] = ck.by - ck.rb - marg
                    rects[ne * 4 + 2] = ck.bx + ck.rb + marg
                    rects[ne * 4 + 3] = ck.by + ck.rb + marg
                    ne++
                }
            }

            // ── GPU ──
            frameBW = bw
            frameBH = bh
            g.bindBuffer(g.ARRAY_BUFFER, instBuf)
            if (ne) {
                g.bufferSubData(g.ARRAY_BUFFER, 0, inst, 0, ne * FLOATS)
                g.bindBuffer(g.ARRAY_BUFFER, rectBuf)
                g.bufferSubData(g.ARRAY_BUFFER, 0, rects, 0, ne * 4)
            }
            const pc = pCookie as Prog
            const uc = pc.u
            g.useProgram(pc.p)
            g.uniform4f(uc.uP, fx, fy, shX, shY)
            g.uniform2f(uc.uZ, (Z_FAR + Z_NEAR) / (Z_NEAR - Z_FAR), (2 * Z_FAR * Z_NEAR) / (Z_NEAR - Z_FAR))
            for (let k = 0; k < 3; k++) {
                g.activeTexture(g.TEXTURE0 + k)
                g.bindTexture(g.TEXTURE_2D, atlas[k])
            }
            g.activeTexture(g.TEXTURE3)
            g.bindTexture(g.TEXTURE_2D, noiseTex)
            g.uniform1i(uc.uM0, 0)
            g.uniform1i(uc.uM1, 1)
            g.uniform1i(uc.uM2, 2)
            g.uniform1i(uc.uNoise, 3)
            g.uniform3f(uc.uBg, bg[0], bg[1], bg[2])
            const la = (clamp(num(a.lightAngle, -35), -180, 180) * Math.PI) / 180
            // key softbox: up and to the side by Light Angle, toward the viewer
            const kx = Math.sin(la) * 0.86
            const ky = Math.cos(la) * 0.86
            const kl = Math.sqrt(kx * kx + ky * ky + 0.25)
            g.uniform3f(uc.uKey, kx / kl, ky / kl, 0.5 / kl)
            const bakeK = 0.25 + (clamp(num(c.bake, 5), 0, 10) / 10) * 1.25
            g.uniform4f(
                uc.uLook,
                bakeK,
                clamp(num(a.gloss, 60), 0, 100) / 60,
                clamp(num(a.sparkle, 100), 0, 300) / 100,
                clamp(num(a.exposure, 100), 10, 300) / 100
            )
            g.uniform4f(uc.uMorph, styleIdx, reduced ? 0 : clamp(num(mo.glow, DEFAULT_MORPH.glow), 0, 10) / 5, swellK, 0)

            let anyFar = false
            let anyNear = false
            for (let l = 1; l <= MAX_LEVEL; l++) {
                if (binLen[l]) anyFar = true
                if (binLen[MAX_LEVEL + l]) anyNear = true
            }
            if (anyFar) {
                clearTarget("F")
                for (let l = MAX_LEVEL; l >= 1; l--) if (binLen[l]) softLayer(l, l, "F")
            }
            if (anyNear) {
                clearTarget("N")
                for (let l = 1; l <= MAX_LEVEL; l++) if (binLen[MAX_LEVEL + l]) softLayer(MAX_LEVEL + l, l, "N")
            }

            // the frame itself
            g.bindFramebuffer(g.FRAMEBUFFER, null)
            g.viewport(0, 0, bw, bh)
            g.disable(g.SCISSOR_TEST)
            g.clearColor(0, 0, 0, 0)
            g.depthMask(true)
            g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT)
            if (anyFar) stack("F")
            if (binLen[0]) {
                stateCookies()
                drawBin(0, 0)
            }
            if (anyNear) stack("N")
            g.bindVertexArray(null)
            g.disable(g.BLEND)

            if (dirty) dirty = false
            animating = busy || baker.queue.length > 0
        }
        // ── loop: vsync-locked ~60 fps while anything moves, idle when settled ──
        let raf = 0
        let running = false
        let visible = true
        let tickPrev = -1
        let lastDraw = -1
        let framesDrawn = 0
        const gaps = new Float64Array(15)
        const gapSort = new Float64Array(15)
        let gapN = 0
        let period = 1000 / 60
        let slowSince = -1
        let goodSince = -1
        let lastChange = -1e9
        let raiseLocked = false
        const lates = new Float64Array(9)
        const lateSort = new Float64Array(9)
        let lateN = 0
        let divisor = 1

        // Quality ladder, judged against an absolute 60 fps target: when the
        // GPU is the bottleneck the browser's frame callbacks slow down with
        // it, so frames measured against that slowed period never look late.
        // The median of recent frames decides; steps are ≥ 2 s apart; a raise
        // that had to be reverted locks further raises. The buffer never
        // drops below the layout size.
        const TARGET_MS = 1000 / 60
        const ladder = (now: number, lateMed: number) => {
            if (now - lastChange < 2000) return
            if (lateMed > Math.min(TARGET_MS * divisor, 33.4) * 1.25) {
                goodSince = -1
                if (slowSince < 0) slowSince = now
                if (now - slowSince > 700 && quality > QUALITY_FLOOR) {
                    if (now - lastChange < 4000) raiseLocked = true
                    quality = Math.max(QUALITY_FLOOR, quality * 0.85)
                    lastChange = now
                    slowSince = -1
                    sizeCanvas()
                }
            } else {
                slowSince = -1
                if (goodSince < 0) goodSince = now
                if (!raiseLocked && quality < 1 && now - goodSince > 3000 && lateMed < TARGET_MS * divisor * 1.08) {
                    quality = Math.min(1, quality / 0.85)
                    goodSince = -1
                    lastChange = now
                    sizeCanvas()
                }
            }
        }

        const tick = (now: number) => {
            raf = 0
            if (!running) return
            raf = requestAnimationFrame(tick)
            if (!ready && !checkReady()) {
                if (failed) stop()
                return
            }
            if (tickPrev >= 0) {
                const gap = now - tickPrev
                if (gap > 0 && gap < 100) {
                    gaps[gapN % 15] = gap
                    gapN++
                    const m = Math.min(gapN, 15)
                    period = medianOf(gaps, m, gapSort)
                }
            }
            tickPrev = now
            // Lock to vsync: draw every Nth tick, ~60 fps on any refresh rate.
            // N changes only when the period leaves a band around it, so a
            // ~165 Hz panel does not flip between 82 and 55 fps.
            const x = 1000 / 60 / period
            if (x < divisor - 0.1 || x >= divisor + 1.1) divisor = Math.max(1, Math.floor(x + 0.1))
            // Count elapsed time, not ticks: one missed vsync must not push
            // the next frame back by a whole extra one.
            if (lastDraw >= 0 && now - lastDraw < (divisor - 0.5) * period) return
            readPointer()
            if (framesDrawn % 30 === 29 && measureShown()) sizeCanvas()
            const dtMs = lastDraw < 0 ? 0 : now - lastDraw
            if (lastDraw >= 0 && framesDrawn > 30) {
                lates[lateN % 9] = dtMs
                lateN++
                const m = Math.min(lateN, 9)
                ladder(now, medianOf(lates, m, lateSort))
            }
            lastDraw = now
            draw(dtMs)
            framesDrawn++
            if (!animating && !dirty) {
                stop()
                scheduleWave()
            }
        }
        /** A settled scene still owes its next colour wave: wake for it. */
        const scheduleWave = () => {
            if (waveTimer) window.clearTimeout(waveTimer)
            waveTimer = 0
            if (nextWave < 0 || !visible) return
            waveTimer = window.setTimeout(() => {
                waveTimer = 0
                wake()
            }, Math.max(16, nextWave - performance.now()))
        }
        function stop() {
            running = false
            if (raf) cancelAnimationFrame(raf)
            raf = 0
        }
        function wake() {
            dirty = true
            if (running || !visible || lost || failed || !gl) return
            running = true
            tickPrev = -1
            lastDraw = -1
            raf = requestAnimationFrame(tick)
        }
        wakeRef.current = wake

        const io = new IntersectionObserver((es) => {
            const e = es[es.length - 1]
            visible = e.isIntersecting && !document.hidden
            if (W > 0 && e.boundingClientRect.width > 0) {
                const s = e.boundingClientRect.width / W
                if (Math.abs(s - shown) / shown > 0.05) {
                    shown = s
                    sizeCanvas()
                }
            }
            if (visible) wake()
            else {
                stop()
                if (waveTimer) window.clearTimeout(waveTimer)
                waveTimer = 0
            }
        })
        io.observe(root)
        const onVis = () => {
            if (document.hidden) {
                stop()
                if (waveTimer) window.clearTimeout(waveTimer)
                waveTimer = 0
            } else {
                visible = true
                wake()
            }
        }
        document.addEventListener("visibilitychange", onVis)
        const onMotionPref = () => wake()
        mq?.addEventListener?.("change", onMotionPref)

        initGL()
        if (!gl || failed) canvas.style.display = "none" // no GPU path: the Background stays
        sizeCanvas()
        wake()

        return () => {
            stop()
            wakeRef.current = () => {}
            if (waveTimer) window.clearTimeout(waveTimer)
            curve.anim?.stop()
            ro.disconnect()
            io.disconnect()
            document.removeEventListener("visibilitychange", onVis)
            mq?.removeEventListener?.("change", onMotionPref)
            canvas.removeEventListener("webglcontextlost", onLost)
            canvas.removeEventListener("webglcontextrestored", onRestored)
            root.removeEventListener("pointermove", onMove)
            root.removeEventListener("pointerdown", onDown)
            root.removeEventListener("pointerup", onUp)
            root.removeEventListener("pointerleave", onLeave)
            root.removeEventListener("pointercancel", onLeave)
            window.removeEventListener("scroll", onScroll, { capture: true })
        }
    }, [])

    // Studio falloff on the Background: lighter where the key light lands,
    // a touch deeper in the far corner. A browser without color-mix() drops
    // the image and keeps the flat colour.
    const fall = clamp(num(adv.backdrop, 100), 0, 200) / 100
    const backdrop =
        fall > 0
            ? `radial-gradient(130% 100% at 32% 18%, color-mix(in srgb, ${background}, white ${(14 * fall).toFixed(1)}%) 0%, ${background} 55%, color-mix(in srgb, ${background}, black ${(12 * fall).toFixed(1)}%) 100%)`
            : undefined

    return (
        <div
            ref={rootRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                aspectRatio: `${REF_W} / ${REF_H}`,
                ...style,
                backgroundColor: background,
                backgroundImage: backdrop,
                overflow: "hidden",
                isolation: "isolate",
                touchAction: "pan-y",
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            />
        </div>
    )
}
