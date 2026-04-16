require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');

// ---------------------------------------------------------------------------
// Material settings — idempotent via INSERT OR IGNORE on (material, operation, power, speed)
// ---------------------------------------------------------------------------

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO material_settings
    (material, operation, power, speed, lines_per_inch, passes, focus_offset_mm, notes, starred, role, source)
  VALUES
    (@material, @operation, @power, @speed, @lines_per_inch, @passes, @focus_offset_mm, @notes, @starred, @role, 'personal')
`);

const settings = [
  // Engraving — Wood
  // role: 'confirmed' = validated best setting for that material+operation
  //        'candidate' = tested but not yet confirmed as go-to
  { material: 'Walnut',   operation: 'engrave', power: 80, speed: 300, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Crisp, but a bit light',                        starred: 0, role: 'candidate'  },
  { material: 'Walnut',   operation: 'engrave', power: 70, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Some burn flaring, deep cuts',                   starred: 0, role: 'candidate'  },
  { material: 'Walnut',   operation: 'engrave', power: 25, speed: 200, lines_per_inch: 300, passes: 1, focus_offset_mm: 0, notes: 'Cleanest, best overall',                         starred: 1, role: 'confirmed'  },
  { material: 'Cherry',   operation: 'engrave', power: 30, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Clearest, but a bit light',                      starred: 0, role: 'candidate'  },
  { material: 'Cherry',   operation: 'engrave', power: 40, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Clear, slightly light',                          starred: 0, role: 'candidate'  },
  { material: 'Cherry',   operation: 'engrave', power: 80, speed: 300, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Good, slight burn flaring',                      starred: 0, role: 'candidate'  },
  { material: 'Cherry',   operation: 'engrave', power: 55, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Strong, some difficulty with fine lines',        starred: 0, role: 'candidate'  },
  { material: 'Red Oak',  operation: 'engrave', power: 55, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Slightly light, good clarity',                   starred: 0, role: 'candidate'  },
  { material: 'Red Oak',  operation: 'engrave', power: 80, speed: 300, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Clearer, very slightly lighter',                 starred: 0, role: 'candidate'  },
  { material: 'Red Oak',  operation: 'engrave', power: 60, speed: 300, lines_per_inch: 300, passes: 1, focus_offset_mm: 0, notes: 'Possibly best overall',                          starred: 1, role: 'confirmed'  },
  { material: 'Oak',      operation: 'engrave', power: 40, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Clearest, a bit light',                          starred: 0, role: 'candidate'  },
  { material: 'Oak',      operation: 'engrave', power: 90, speed: 340, lines_per_inch: 260, passes: 1, focus_offset_mm: 0, notes: 'Dark, some lack of separation in fine lines',    starred: 0, role: 'candidate'  },
  { material: 'Oak',      operation: 'engrave', power: 60, speed: 200, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Good, very slight burn flaring',                 starred: 0, role: 'candidate'  },
  // Engraving — Glass
  { material: 'Glass',    operation: 'engrave', power: 70, speed: 140, lines_per_inch: 200, passes: 1, focus_offset_mm: 0, notes: 'Speed range 80-200; power range 70-80. 200 LPI.',starred: 0, role: 'candidate'  },
  // Cutting
  { material: 'Baltic Birch 3/16"', operation: 'cut', power: 100, speed: 9,  lines_per_inch: null, passes: 2, focus_offset_mm: -2, notes: 'Lower laser focus by 2mm', starred: 0, role: 'confirmed' },
  { material: 'Black Acrylic 1/8"', operation: 'cut', power: 100, speed: 10, lines_per_inch: null, passes: 3, focus_offset_mm: 0,  notes: '',                         starred: 0, role: 'candidate' },
];

const seedSettings = db.transaction(() => {
  let count = 0;
  for (const row of settings) {
    const info = insertSetting.run(row);
    if (info.changes) count++;
  }
  // Backfill source = 'personal' on any existing rows that predate the column
  const backfill = db.prepare(`UPDATE material_settings SET source = 'personal' WHERE source IS NULL`).run();
  console.log(`Material settings: ${count} inserted (${settings.length - count} already existed)${backfill.changes ? `, ${backfill.changes} backfilled with source='personal'` : ''}`);
});
seedSettings();

// ---------------------------------------------------------------------------
// Docs sections — idempotent via INSERT OR IGNORE on (section, title)
// ---------------------------------------------------------------------------

const insertDoc = db.prepare(`
  INSERT OR IGNORE INTO docs_sections (section, title, body, tags)
  VALUES (@section, @title, @body, @tags)
`);

const docs = [
  {
    section: 'Overview',
    title: 'Key Features',
    tags: 'overview,autofocus,software',
    body: `The xTool S1 20W diode laser engraver supports engraving, scoring, and cutting operations. Key features include auto-focus that adjusts laser height to material thickness, a red cross alignment aid, and compatibility with both xTool Creative Space (XCS) and LightBurn software.`,
  },
  {
    section: 'Modes',
    title: 'Cutting',
    tags: 'cutting,operation',
    body: `Cutting uses vector paths at high power and slow speed with multiple passes to sever material completely. Typical settings use 100% power, low speed (e.g. 9–10 mm/sec), and 2–3 passes depending on material thickness. Baltic Birch 3/16" requires lowering focus by 2mm from auto-focus baseline.`,
  },
  {
    section: 'Modes',
    title: 'Scoring',
    tags: 'scoring,operation',
    body: `Scoring traces a vector path once at moderate power, producing fine lines on the surface without cutting through. It is faster than engraving and ideal for outlines, details, and decorative line work.`,
  },
  {
    section: 'Modes',
    title: 'Engraving',
    tags: 'engraving,operation',
    body: `Engraving uses a raster scan: the laser moves back-and-forth across an area, filling it row by row. It is the slowest operation mode. LPI (lines per inch) controls scan density — higher LPI produces finer results but takes longer.`,
  },
  {
    section: 'Modes',
    title: 'Choosing Between Scoring and Engraving',
    tags: 'scoring,engraving',
    body: `Use scoring for fine lines, outlines, and paths. Use engraving to fill an area with tone or texture. Scoring is significantly faster. If your design is vector line art, scoring is usually the better choice. For photographs or filled designs, engraving is required.`,
  },
  {
    section: 'Operating Params',
    title: 'EasySet & Material Testing',
    tags: 'settings,testing,xcs',
    body: `XCS includes a Material Test Array feature that runs a grid of power/speed combinations on a small piece of material, letting you find optimal settings empirically. Use this when working with a new material. Record the best result in the Settings database for future reference.`,
  },
  {
    section: 'Safety',
    title: 'Safety Considerations',
    tags: 'safety,ventilation',
    body: `Always ensure adequate ventilation when operating the laser. Never laser PVC, vinyl, or any chlorine-containing material — these release toxic chlorine gas. Check material composition before engraving unknown items. Keep a fire extinguisher nearby and never leave the machine unattended during operation.`,
  },
  {
    section: 'Techniques',
    title: 'Inlay Painting',
    tags: 'painting,finishing,technique',
    body: `After engraving, apply acrylic paint into the recessed areas, let dry, then sand flush with the surface. Multiple colours are possible by masking. Finish with a clear coat to protect the inlay. This technique works especially well on wood with deep, clean engrave lines.`,
  },
  {
    section: 'Techniques',
    title: 'AI to Laser-Ready Vector',
    tags: 'ai,gimp,inkscape,workflow',
    body: `Workflow: 1) Generate or source an image using AI tools. 2) Open in GIMP — adjust contrast, convert to greyscale, clean up noise. Export as PNG. 3) Import PNG into Inkscape — use Path > Trace Bitmap to vectorize. Simplify paths. Export as SVG. 4) Import SVG into XCS or LightBurn for scoring/cutting. File naming: ProjectName_Stage_Version_Date.ext.`,
  },
  {
    section: 'File Management',
    title: 'File Naming Convention',
    tags: 'files,organization',
    body: `Use the convention: ProjectName_Stage_Version_Date.ext. Example: FlowerDesign_Vector_V2_230424.svg. Stages: Concept, GIMP, Vector, Laser. This makes it easy to trace a design back through its production history and identify the latest laser-ready file.`,
  },
];

const seedDocs = db.transaction(() => {
  let count = 0;
  for (const row of docs) {
    const info = insertDoc.run(row);
    if (info.changes) count++;
  }
  console.log(`Docs sections: ${count} inserted (${docs.length - count} already existed)`);
});
seedDocs();

console.log('Seed complete.');
