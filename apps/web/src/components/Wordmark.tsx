// The reX wordmark: live type for the "re", one drawn glyph for the "X".
//
// Why it is built this way and not shipped as an image. The "re" is set in Work Sans 700 — the
// same font file the app already downloads for everything else — so it stays real text: it takes
// its colour from the ink token, it survives any zoom level, it is selectable, and it adds nothing
// to the payload. Only the "X" is drawn, because the "X" is the one shape Work Sans does not have.
//
// What the X borrows. Its grammar comes from HTX's mark rather than its geometry: the arms are
// wedges, narrowest where they cross and widest at the tips, and two opposing terminals are cut
// with a concave arc so those tips flick outward. Deliberately not taken: the eight-ray burst, the
// doubled rays, the open core, the gradient, and the standalone-symbol format. This is a letter
// inside a word, not a mark.
//
// Why two subpaths. The path below is two crossing bars — the "\" arm plain, the "/" arm carrying
// both concave terminals — and not four arms radiating from a centre. That distinction is the
// whole design: four separately-cut arms read as a sparkle at small sizes, while two strokes read
// as a letter. Cutting only one of the two bars is what keeps the remaining gesture quiet.
//
// Two numbers worth knowing if you ever re-cut it. The stroke width was chosen by measuring ink
// coverage against Work Sans 700's own "X" so the glyph carries exactly the same visual weight as
// the letters beside it. And the `viewBox` is the path's exact bounding box, so setting the SVG's
// height to Work Sans's cap-height ratio (0.66em) makes this X a true capital, level with the "re".
const X_PATH =
  'M-15.69,13.49L15.69,-13.49L54.29,40.29L101.69,86.51L70.31,113.49L31.71,59.71Z' +
  'M15.69,113.49Q3.78,95.61 -15.69,86.51L31.71,40.29L70.31,-13.49Q82.22,4.39 101.69,13.49L54.29,59.71Z';

export default function Wordmark() {
  return (
    // `items-baseline` sits the X on the same baseline as the "re": an SVG's baseline is its bottom
    // edge, and the viewBox is cropped to the ink, so the two line up without a magic offset.
    <span className="inline-flex items-baseline gap-px text-[2.375rem] font-bold leading-none tracking-[-0.02em] text-text">
      re
      <svg
        viewBox="-15.69 -13.49 117.38 126.98"
        className="h-[0.66em] w-auto text-accent"
        fill="currentColor"
        // The link that wraps this carries the accessible name, so the glyph itself is decorative
        // to assistive tech. `focusable="false"` is for older IE/Edge, which otherwise put inline
        // SVGs in the tab order — harmless to keep, and it costs nothing.
        aria-hidden="true"
        focusable="false"
      >
        <path d={X_PATH} />
      </svg>
    </span>
  );
}
