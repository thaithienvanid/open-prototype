// Contrast, computed from colors as the standards give it. WCAG's ratio is the floor; APCA's lightness contrast (a
// candidate method, used as an aid) measures the comfort bands.

export type Rgb = readonly [number, number, number];

export function hex(color: string): Rgb {
  const found = /^#([0-9a-f]{6})$/i.exec(color);
  if (!found) throw new Error(`not a solid six-digit color: ${color}`);
  const value = parseInt(found[1]!, 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function ratio(a: Rgb, b: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c: Rgb) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** APCA lightness contrast of text on a background, as a positive number (0.0.98G-4g constants). */
export function apca(text: Rgb, background: Rgb): number {
  const y = (c: Rgb) => 0.2126729 * (c[0] / 255) ** 2.4 + 0.7151522 * (c[1] / 255) ** 2.4 + 0.072175 * (c[2] / 255) ** 2.4;
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: 1.414 is the APCA soft clamp's own exponent, not the square root of two.
  const clamp = (v: number) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const t = clamp(y(text)),
    b = clamp(y(background));
  if (Math.abs(b - t) < 0.0005) return 0;
  const raw = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14;
  return Math.abs(raw) < 0.1 ? 0 : (Math.abs(raw) - 0.027) * 100;
}
