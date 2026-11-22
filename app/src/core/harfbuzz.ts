/**
 * The instancer: HarfBuzz's subset build (harfbuzzjs `harfbuzz-subset.wasm`), called through
 * its raw exports. It pins axes to values (a static font) or narrows them (still variable).
 */

type Exports = {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, user: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_keep_everything(input: number): void;
  hb_subset_input_get_flags(input: number): number;
  hb_subset_input_set_flags(input: number, flags: number): void;
  hb_subset_input_pin_all_axes_to_default(input: number, face: number): number;
  hb_subset_input_pin_axis_location(input: number, face: number, tag: number, value: number): number;
  hb_subset_input_set_axis_range(input: number, face: number, tag: number, min: number, max: number, def: number): number;
  hb_subset_or_fail(face: number, input: number): number;
};

const BLOB_WRITABLE = 2;
// Writes OVERLAP_SIMPLE on glyphs as fontTools does; without it rasterizers may draw overlaps
// with dropouts (Phase 1 measurement: 4 of 5 fonts lost the flag).
const SET_OVERLAPS_FLAG = 0x10;

const tagNumber = (t: string) => ((t.charCodeAt(0) << 24) | (t.charCodeAt(1) << 16) | (t.charCodeAt(2) << 8) | t.charCodeAt(3)) >>> 0;

export type Instancer = {
  /** Pins `pins` to values and narrows `ranges`; axes in neither keep their default. */
  instance(font: Uint8Array, pins: Readonly<Record<string, number>>, ranges?: Readonly<Record<string, readonly [number, number]>>): Uint8Array;
};

/** From the wasm file's bytes, or from an instance already made (Vite's `?init` import). */
export async function loadInstancer(wasm: BufferSource | WebAssembly.Instance): Promise<Instancer> {
  const instance = wasm instanceof WebAssembly.Instance ? wasm : (await WebAssembly.instantiate(wasm, {})).instance;
  const hb = instance.exports as unknown as Exports;
  hb._initialize?.();

  return {
    instance(font, pins, ranges = {}) {
      const ptr = hb.malloc(font.length);
      new Uint8Array(hb.memory.buffer).set(font, ptr);
      const blob = hb.hb_blob_create(ptr, font.length, BLOB_WRITABLE, 0, 0);
      const face = hb.hb_face_create(blob, 0);
      hb.hb_blob_destroy(blob);
      const input = hb.hb_subset_input_create_or_fail();
      try {
        if (!input) throw new Error("HarfBuzz could not start a subset");
        hb.hb_subset_input_keep_everything(input);
        hb.hb_subset_input_set_flags(input, hb.hb_subset_input_get_flags(input) | SET_OVERLAPS_FLAG);
        hb.hb_subset_input_pin_all_axes_to_default(input, face);
        for (const [tag, v] of Object.entries(pins)) {
          if (!hb.hb_subset_input_pin_axis_location(input, face, tagNumber(tag), v)) throw new Error(`HarfBuzz refused ${tag} = ${v}`);
        }
        for (const [tag, [lo, hi]] of Object.entries(ranges)) {
          if (!hb.hb_subset_input_set_axis_range(input, face, tagNumber(tag), lo, hi, NaN)) throw new Error(`HarfBuzz refused ${tag} ${lo} to ${hi}`);
        }
        const out = hb.hb_subset_or_fail(face, input);
        if (!out) throw new Error("HarfBuzz could not make the instance");
        const outBlob = hb.hb_face_reference_blob(out);
        const at = hb.hb_blob_get_data(outBlob, 0), length = hb.hb_blob_get_length(outBlob);
        const bytes = new Uint8Array(hb.memory.buffer).slice(at, at + length);
        hb.hb_blob_destroy(outBlob);
        hb.hb_face_destroy(out);
        if (!length) throw new Error("HarfBuzz made an empty font");
        return bytes;
      } finally {
        if (input) hb.hb_subset_input_destroy(input);
        hb.hb_face_destroy(face);
        hb.free(ptr);
      }
    },
  };
}
