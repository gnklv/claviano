// Read the printed details exercised by the three closing showcase bars. This is a fixture
// check: it can inspect a beam or a dot without reconstructing all voices in the measure.
export function inspectShowcaseBar(geometry, measure, { roundDotCenter, strips, timeOf }) {
  const [upper, lower] = measure.staves;
  const space = upper.space;
  const inside = point => point.x >= measure.left && point.x < measure.right
    && point.y > lower.bottom - 3 * space && point.y < upper.bottom + 7 * space;
  const glyphs = geometry.glyphs.filter(inside);
  const staffAt = y => y > (upper.bottom + lower.bottom + 4 * space) / 2 ? 1 : 2;
  const heads = glyphs.filter(glyph => glyph.text === '\ue0a4');
  const stems = geometry.segments.filter(line => Math.abs(line.x1 - line.x2) < 0.03 * space
    && Math.abs(line.y1 - line.y2) > space * 2 && inside({ x: line.x1, y: line.y1 }));
  const beams = strips(geometry.fills, space)
    .filter(beam => inside({ x: beam.left, y: beam.yAt(beam.left) }))
    .sort((a, b) => a.left - b.left);
  const groups = beams.map(beam => heads.filter(head => stems.some(stem => {
    if (stem.x1 < beam.left - 0.1 * space || stem.x1 > beam.right + 0.1 * space
        || stem.x1 < head.x - 0.1 * space || stem.x1 > head.x + 1.4 * space) return false;
    const beamY = beam.yAt(stem.x1);
    return [[stem.y1, stem.y2], [stem.y2, stem.y1]].some(([tip, base]) =>
      Math.abs(tip - beamY) < space * 0.35 && Math.abs(base - head.y) < space * 0.3);
  })).sort((a, b) => a.x - b.x).map(head => staffAt(head.y)));

  // In this engraving augmentation dots are filled circles instead of font glyphs.
  const dots = geometry.curvedFills.map(contour => roundDotCenter(contour, space)).filter(dot => dot && inside(dot));
  const dotted = glyphs.filter(g => ['\ue0a3', '\ue4e6'].includes(g.text)).flatMap(g => {
    const nearby = dots.filter(p => p.x > g.x && p.x < g.x + 3 * space && Math.abs(p.y - g.y) < 0.6 * space);
    if (nearby.length !== 2 || Math.abs(nearby[0].y - nearby[1].y) > 0.05 * space) return [];
    return [{ staff: staffAt(g.y), kind: g.text === '\ue0a3' ? 'half note' : 'eighth rest' }];
  });
  const meters = measure.staves.map((staff, i) => {
    const time = timeOf(glyphs.filter(g => staffAt(g.y) === i + 1), staff);
    return time && time.numerator + '/' + time.denominator;
  });
  return { meters, groups, doubleDotted: dotted };
}

// Ground truth comes from the written voices, before repeat navigation or performance timing.
export function expectedShowcaseBar(notation, bar) {
  const measure = notation.bars[bar];
  const signature = notation.timeSignatures.find(mark => mark.beat === measure.start);
  const meter = signature ? signature.numerator + '/' + signature.denominator : null;
  const notes = notation.notes.filter(note => note.bar === bar);
  const groups = [];
  for (const note of notes) {
    if (note.beams[0] === 'begin') groups.push([]);
    if (note.beams[0]) groups.at(-1).push(note.staff);
  }
  const rests = notation.rests.filter(rest => rest.beat >= measure.start && rest.beat < measure.start + measure.length);
  const doubleDotted = [...notes, ...rests].filter(event => event.duration.dots === 2)
    .map(event => ({ staff: event.staff, kind: event.duration.value + ('pitch' in event ? ' note' : ' rest') }));
  return { bar, meters: [meter, meter], groups, doubleDotted };
}
