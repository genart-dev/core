import type { SkillDefinition } from "../types.js";

// ---------------------------------------------------------------------------
// Process Knowledge Skills (ADR 052)
// ---------------------------------------------------------------------------

export const PROCESS_SKILLS: readonly SkillDefinition[] = [
  {
    id: "layering-strategy",
    name: "Layering Strategy",
    category: "process",
    complexity: "intermediate",
    description:
      "Choose and execute a deliberate building order — dark-to-light, light-to-dark, alla prima, or glazing — to control depth, luminosity, and visual hierarchy.",
    theory: `Every painted image is built in a specific order, and that order profoundly affects the final result. The layering strategy is the plan for how you will construct your image from first mark to final detail.

**Dark-to-light (classical oil)**: Start with the darkest values and build toward highlights. This mirrors traditional oil painting where thin dark under-painting establishes structure, then opaque lights are applied on top. Advantages: strong value structure from the start, luminous highlights over dark ground. In generative art: first layers use dark colors at multiply blend, later layers add progressively lighter, more opaque marks.

**Light-to-dark (watercolor)**: Start with the lightest washes and build darkness through successive transparent layers. Each layer darkens what's below — you can never go lighter. Advantages: luminous transparency, the paper glows through. In generative art: first layers are pale, high-dilution washes; later layers add concentrated pigment. Preserve white by not painting.

**Alla prima (direct painting)**: Apply all values and colors in a single pass, working wet-into-wet. No under-painting, no glazing — each stroke is placed with final intention. Advantages: fresh, spontaneous quality; unified paint surface. In generative art: a single layer with full value range, high bloom for wet-into-wet mixing.

**Glazing (layered transparency)**: Build color and depth through many thin, transparent layers, each tinting the ones below. Advantages: optical color mixing (colors blend in the viewer's eye, not on the surface), extraordinary depth and luminosity. In generative art: many layers at multiply blend with low opacity, each adding a color shift.

**Decision framework**: Choose your strategy BEFORE placing the first mark. The strategy determines blend modes, opacity ranges, layer count, and working order. Switching strategies mid-painting creates inconsistency.`,
    principles: [
      "Decide your layering strategy before the first mark — it determines blend modes, opacity, and order",
      "Dark-to-light: thin darks first (multiply), opaque lights last (normal blend)",
      "Light-to-dark: preserve whites from the start; each layer can only darken",
      "Alla prima: single pass, full value range, wet-into-wet mixing",
      "Glazing: many thin multiply layers, each adding a color tint, never opaque",
      "Consistency: don't mix strategies in one piece unless deliberately transitioning between zones",
    ],
    references: [
      { title: "Alla Prima", author: "Richard Schmid", year: 1998 },
      { title: "Color and Light", author: "James Gurney", year: 2010 },
    ],
  },
  {
    id: "mark-making",
    name: "Mark Making",
    category: "process",
    complexity: "intermediate",
    description:
      "Control gestural energy, calligraphic line, stippling, hatching, and emotional mark qualities to give the work a distinctive voice.",
    theory: `Every mark carries meaning beyond its formal properties. A confident, sweeping stroke communicates energy and decisiveness. A tentative, broken line communicates delicacy or uncertainty. The character of marks is the artist's handwriting — the most personal element of any work.

**Gestural marks**: Fast, whole-arm movements that capture the energy and direction of a form. In generative art: high flow speed, large brush size, loose edge style, following the field direction with momentum. Use for expressive, dynamic passages.

**Calligraphic marks**: Controlled, flowing lines with deliberate thick-thin variation, inspired by East Asian brush painting and Western calligraphy. In generative art: taper on both ends, brush style, consistent field direction, moderate speed. The beauty is in the single stroke.

**Stippling**: Value built through accumulated dots rather than lines. Density controls darkness. In generative art: point-based rendering, no stroke connections, density mapped to value. Creates a distinctive, textured surface quality.

**Hatching**: Parallel lines creating value through spacing and overlap. Cross-hatching layers multiple hatch directions. In generative art: linear fields at controlled angles, line weight and spacing mapped to value. Follow form contours for contour hatching.

**Emotional quality of marks**: Aggressive marks (heavy pressure, sharp angles) create tension. Gentle marks (light pressure, curves) create calm. Rhythmic marks (consistent spacing) create order. Chaotic marks (varying spacing, direction) create energy. The emotional quality should match the subject's mood.`,
    principles: [
      "Every mark communicates: choose mark quality to match emotional intent",
      "Gestural marks: fast, whole-arm energy — use high speed and large brush size",
      "Calligraphic marks: controlled thick-thin variation — use taper and brush style",
      "Stippling: value through dot density, not line — use point-based rendering",
      "Hatching: parallel lines at controlled angles — use linear field, spacing maps to value",
      "Mix mark types deliberately: one dominant type establishes character, secondary types add variety",
      "Consistent mark quality unifies a piece; inconsistent quality creates visual noise",
    ],
    references: [
      { title: "The Natural Way to Draw", author: "Kimon Nicolaïdes", year: 1941 },
      { title: "Drawing on the Right Side of the Brain", author: "Betty Edwards", year: 1979 },
    ],
  },
  {
    id: "material-behavior",
    name: "Material Behavior",
    category: "process",
    complexity: "advanced",
    description:
      "Understand how watercolor pools, charcoal catches tooth, ink bleeds, and oil builds impasto — using medium behavior as an expressive tool.",
    theory: `Each art medium has physical behaviors that create unique visual qualities. Understanding these behaviors lets you choose the right medium for your expressive intent and simulate it convincingly in generative art.

**Watercolor**: A fluid, transparent medium. Water carries pigment across the paper surface. Where the water pools (low spots, edges of wet areas), pigment concentrates — creating characteristic blooms, backruns, and hard-edged cauliflower effects. Granulating pigments settle into paper texture. In generative art: bloom radius, granulation, edge diffusion, and dilution parameters model these behaviors.

**Charcoal**: A dry, powdery medium that deposits on paper tooth (surface texture). It catches on the high points of textured paper and skips the valleys, creating a characteristic broken, grainy quality. Easily smudged for soft blending. In generative art: grain texture interaction, soft edges, value built through pressure rather than layering.

**Ink**: A fluid medium that is permanent once dry. Applied with brush (variable width, expressive) or nib (consistent width, precise). Ink bleeds into wet paper, creating feathered edges. On dry paper, it produces crisp, decisive marks. In generative art: edge style (sharp vs. feathered), line weight variation, irreversible marks.

**Oil paint**: A thick, slow-drying medium that can be applied transparently (glazing) or thickly (impasto). Impasto creates physical texture that catches light. Colors can be blended wet-into-wet on the surface. In generative art: opacity, texture relief, blending zone size, paint thickness parameter.

**Medium as expression**: The medium isn't just a carrier for an image — it IS part of the expression. Watercolor says "fluid, luminous, ephemeral." Charcoal says "raw, immediate, atmospheric." Ink says "decisive, graphic, permanent." Oil says "rich, tactile, enduring."`,
    principles: [
      "Choose medium to match expressive intent, not just visual appearance",
      "Watercolor: embrace pooling, blooms, and granulation — they ARE the medium's voice",
      "Charcoal: use paper tooth interaction for broken, textured marks with soft atmospheric blending",
      "Ink: commit to marks — the irreversibility creates decisiveness and energy",
      "Oil: vary thickness from thin glazes to thick impasto for textural variety",
      "Simulate the physics, not just the look: how the medium flows, dries, and interacts with the surface",
      "Let accidents happen — medium behavior creates happy surprises that pure geometry cannot",
    ],
    references: [
      { title: "Color and Light", author: "James Gurney", year: 2010 },
      { title: "Alla Prima", author: "Richard Schmid", year: 1998 },
      { title: "Watercolor Painting", author: "Charles Reid", year: 1969 },
    ],
  },
  {
    id: "iterative-refinement",
    name: "Iterative Refinement",
    category: "process",
    complexity: "beginner",
    description:
      "Work from block-in to refinement to detail — general-to-specific — and know when to stop.",
    theory: `The most reliable process for creating any visual work follows the same pattern: start with the biggest, most general decisions, then progressively refine toward detail. This general-to-specific approach prevents the common trap of overworking one area while neglecting the whole.

**Stage 1 — Block-in**: Establish the largest shapes, the overall value pattern, and the basic composition. No detail. Think in silhouettes and big color/value masses. If this stage doesn't work, no amount of detail will save it.

**Stage 2 — Refinement**: Break the large shapes into smaller sub-shapes. Establish secondary value relationships and color variations. Define edges (hard, soft, lost). Develop the focal area more than the periphery.

**Stage 3 — Detail**: Add the specific details that make the work finished: texture, fine marks, highlights, darkest accents. Detail should only go where it serves the composition — not everywhere. The focal area gets the most detail; edges of the composition can stay loose.

**When to stop**: A piece is finished when adding more would not improve it. Signs you should stop: the value structure reads clearly at a distance, the focal area is developed, the overall rhythm feels balanced, and you're starting to fiddle with things that don't matter. It's better to stop too early (fresh, spontaneous) than too late (overworked, muddy).

**In generative art**: This translates to layer ordering and parameter design. The first layers establish big shapes (large brush, simple field). Middle layers add mid-scale refinement. Final layers add small-scale detail. The compositionLevel (study/sketch/developed/exhibition) determines how many refinement passes to apply.`,
    principles: [
      "Always work general-to-specific: big shapes first, detail last",
      "Block-in must work as a composition before adding any detail",
      "Develop the focal area more than the periphery — not all areas need equal finish",
      "Stop when adding more would not improve the piece — fresh is better than overworked",
      "Each refinement pass should be a smaller scale than the previous one",
      "If a stage isn't working, go back to the previous stage rather than pushing forward",
    ],
    references: [
      { title: "Alla Prima", author: "Richard Schmid", year: 1998 },
      { title: "The Natural Way to Draw", author: "Kimon Nicolaïdes", year: 1941 },
    ],
  },
  {
    id: "thumbnail-studies",
    name: "Thumbnail Studies",
    category: "process",
    complexity: "beginner",
    description:
      "Use fast, small-scale explorations to test value patterns, compositions, and color schemes before committing to a full piece.",
    theory: `Thumbnails are small, quick studies — typically 2-4 inches — used to explore ideas before investing in a full-size work. They are the artist's equivalent of prototyping: fast, disposable, and focused on answering specific questions.

**Value thumbnails**: The most important type. Simplify to 3-4 values (white, light gray, dark gray, black) and explore where the light and dark masses go. If the thumbnail reads clearly at arm's length as a pattern of lights and darks, the composition will work at full size.

**Composition thumbnails**: Explore different framings, proportions, and element arrangements. Try the same subject with different compositions: centered vs. rule-of-thirds, landscape vs. portrait, tight crop vs. wide view. Quick — 1-2 minutes each.

**Color thumbnails**: Small studies testing palette relationships. Try the same composition with different color schemes: warm vs. cool, high chroma vs. muted, limited palette vs. full spectrum. Color thumbnails don't need to be detailed — just big shapes in different palettes.

**How many**: Do at least 4-6 thumbnails before committing to a full piece. The first idea is rarely the best. Thumbnails cost almost nothing in time but dramatically improve final results.

**In generative art**: Thumbnails map directly to the "study" compositionLevel. Use small canvas sizes (400x400 or smaller), 1-2 layers, and minimal parameter exploration. The goal is to test the core idea — composition, value pattern, color scheme — before scaling up to a developed or exhibition piece.`,
    principles: [
      "Do 4-6 thumbnails before starting a full piece — the first idea is rarely the best",
      "Value thumbnails: simplify to 3-4 values, test if the light/dark pattern reads clearly",
      "Composition thumbnails: try different framings and element arrangements quickly",
      "Color thumbnails: test palette relationships on simple shapes, not detailed drawings",
      "Keep thumbnails fast and rough — 1-2 minutes each, not precious",
      "The best thumbnail becomes the blueprint for the full piece",
    ],
    references: [
      { title: "Alla Prima", author: "Richard Schmid", year: 1998 },
      { title: "Principles of Form and Design", author: "Wucius Wong", year: 1993 },
    ],
  },
  {
    id: "color-mixing-strategy",
    name: "Color Mixing Strategy",
    category: "process",
    complexity: "intermediate",
    description:
      "Master limited palettes, chromatic grays, temperature shifts, and optical mixing to create cohesive, luminous color.",
    theory: `Color mixing is where theory meets practice. The way colors are combined — on the palette, on the canvas, or optically — determines the quality of the final color. Random color choices produce muddy, disconnected results. Strategic mixing produces luminous, harmonious color.

**Limited palette mastery**: Start with fewer colors. A palette of 3-4 well-chosen colors forces you to mix every other color, which naturally creates harmony — all colors share parent pigments. The classic limited palette: one warm and one cool of each primary (e.g., cadmium yellow, lemon yellow, cadmium red, alizarin crimson, ultramarine blue, cerulean blue) plus white.

**Chromatic grays**: The most sophisticated neutrals are mixed from complementary colors, not by adding black. Blue + orange, red + green, purple + yellow — each pair produces a different gray with subtle color character. These grays vibrate with life because they contain the full spectrum. In generative art: mix complementary hex values at varied ratios rather than desaturating to neutral gray.

**Temperature shifts**: Within any color area, shift temperature slightly warm or cool to create visual interest. A "blue" sky isn't one blue — it shifts from warm (near horizon) to cool (zenith). A shadow isn't one dark color — its temperature contrasts with the light. In generative art: add slight hue rotation across gradients.

**Optical mixing**: When small dots or strokes of different colors are placed side by side (as in pointillism), the eye blends them at a distance. The mixed color appears more luminous than a physically mixed equivalent. In generative art: use small, interleaved marks of different colors rather than pre-mixing.`,
    principles: [
      "Use a limited palette (3-5 colors) and mix everything else — shared parents create harmony",
      "Mix grays from complementary pairs, not by adding black — chromatic grays have life",
      "Shift temperature within any color area: warm/cool variation creates visual richness",
      "Optical mixing (small adjacent marks of different colors) produces more luminous color than pre-mixing",
      "Test mixed colors against their neighbors, not in isolation — context changes everything",
      "A restricted palette forces creative solutions and produces more unified results",
    ],
    references: [
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
      { title: "The Art of Color", author: "Johannes Itten", year: 1961 },
      { title: "Color and Light", author: "James Gurney", year: 2010 },
    ],
  },
  {
    id: "atmospheric-depth",
    name: "Atmospheric Depth",
    category: "process",
    complexity: "intermediate",
    description:
      "Create convincing depth through value compression, temperature shift, edge softness, and detail reduction — without relying on geometric perspective.",
    theory: `Atmospheric perspective (also called aerial perspective) is the visual phenomenon where distant objects appear lighter, bluer, lower in contrast, and softer in edge than near objects. This is caused by the atmosphere between the viewer and the object scattering light and reducing contrast.

**Value compression**: Near objects show full value range (darkest darks to lightest lights). Distant objects show compressed value range — their darks lighten and their lights darken, converging toward a middle value. In generative art: reduce the value range of background layers compared to foreground.

**Temperature shift**: Near objects show full color temperature. Distant objects shift toward cool (blue-violet) as scattered atmospheric light dominates. In generative art: shift the hue of background layers toward blue, reduce warm colors.

**Edge softness**: Near objects have sharp, defined edges. Distant objects have soft, diffused edges that merge with their surroundings. In generative art: increase blur, bloom, or edge diffusion for background layers.

**Detail reduction**: Near objects show fine detail and texture. Distant objects show simplified, generalized forms — individual leaves become a mass of green, individual bricks become a flat wall. In generative art: use larger, simpler marks for background layers; finer, more detailed marks for foreground.

**All four effects working together** create convincing depth. Applying only one (e.g., just making backgrounds lighter) feels unconvincing. The combination is key.`,
    principles: [
      "Apply all four depth cues together: value compression, temperature shift, edge softness, detail reduction",
      "Value compression: background has narrower value range than foreground",
      "Temperature shift: backgrounds shift cooler (blue-violet); foregrounds retain warm colors",
      "Edge softness: sharp edges in foreground, soft/lost edges in background",
      "Detail reduction: fine marks foreground, large simple marks background",
      "The atmosphere between layers is not empty — it's a visible haze that adds its own color",
    ],
    references: [
      { title: "Color and Light", author: "James Gurney", year: 2010 },
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
    ],
  },
  {
    id: "creative-constraints",
    name: "Creative Constraints",
    category: "process",
    complexity: "beginner",
    description:
      "Use deliberate limitations — restricted palette, time limits, tool restrictions, format constraints — as creative drivers rather than obstacles.",
    theory: `Paradoxically, more freedom often leads to worse creative output. When every option is available, decision paralysis sets in and work becomes generic. Constraints force creative problem-solving and lead to distinctive, inventive results.

**Palette constraints**: Limit to 2-3 colors. This forces you to create variety through value, temperature shifts, and mixing rather than reaching for a new color. Monochrome work develops your value skills. Complementary pairs develop your contrast skills.

**Tool constraints**: Use only one type of mark (e.g., only hatching, only dots, only large brush). This forces you to solve every problem — value, edge, texture — with a single tool, leading to creative invention.

**Time constraints**: Set a timer. A 5-minute sketch has an energy and directness that a 2-hour rendering never achieves. Time pressure forces you to prioritize the essential and ignore the trivial.

**Format constraints**: Work at an unusual aspect ratio, very small, or very large. Each format changes what's possible. A long narrow vertical forces different composition strategies than a square. A tiny canvas forces simplification.

**Rule-based constraints**: "Every element must touch at least one edge." "No straight lines." "Only curves." "Maximum 50 elements." Rules generate unexpected solutions.

**In generative art**: Constraints map to parameter limits, layer count limits, element count limits, and compositionLevel. A "study" level IS a constraint — small canvas, 1-2 layers, fast execution. The constraint is the creative driver.`,
    principles: [
      "Constraints are creative fuel, not obstacles — embrace them deliberately",
      "Palette constraints: fewer colors force more inventive mixing and value work",
      "Tool constraints: one mark type forces creative problem-solving for every visual need",
      "Time constraints: deadlines force prioritization of the essential over the trivial",
      "Format constraints: unusual dimensions force unexpected composition strategies",
      "Choose constraints that push you toward the skills you want to develop",
      "The compositionLevel (study/sketch/developed/exhibition) is itself a productive constraint",
    ],
    references: [
      { title: "Art and Fear", author: "David Bayles & Ted Orland", year: 1993 },
      { title: "The Natural Way to Draw", author: "Kimon Nicolaïdes", year: 1941 },
    ],
  },
];
