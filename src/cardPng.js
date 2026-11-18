import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { cardFont } from './cardFont.js';

// The WASM module starts once per Worker instance; every render after that reuses it.
let ready;
export async function svgToPng(svg) {
  ready ??= initWasm(wasm);
  await ready;
  const options = { font: { fontBuffers: [cardFont()], defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false } };
  return new Resvg(svg, options).render().asPng();
}
