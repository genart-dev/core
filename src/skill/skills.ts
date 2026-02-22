import type { SkillDefinition } from "../types.js";

// ---------------------------------------------------------------------------
// Composition Theory Skills (Arnheim, Wong)
// ---------------------------------------------------------------------------

export const COMPOSITION_SKILLS: readonly SkillDefinition[] = [
  {
    id: "golden-ratio",
    name: "Golden Ratio",
    category: "composition",
    complexity: "intermediate",
    description:
      "Use the golden ratio (1:1.618) to create naturally harmonious proportions and spiral compositions.",
    theory: `The golden ratio (phi, approximately 1.618) appears throughout nature and has been used in art and architecture for millennia. In generative art, it provides a mathematical foundation for creating compositions that feel naturally balanced.

The golden rectangle can be recursively subdivided, creating a spiral that guides the viewer's eye. Elements placed along this spiral or at golden section points create visual harmony without the rigidity of symmetric layouts.

Key applications in generative art:
- Divide the canvas at golden ratio points (61.8% / 38.2%) for element placement
- Use the golden spiral as a path for distributing elements
- Scale recursive elements by phi for self-similar patterns
- Apply phi to spacing, margins, and proportional relationships`,
    principles: [
      "Divide compositions at 61.8% / 38.2% rather than halves",
      "Place focal elements at golden section intersections",
      "Use the golden spiral to guide element distribution",
      "Scale nested or recursive elements by phi (1.618) or 1/phi (0.618)",
      "Apply golden proportions to negative space as well as positive forms",
    ],
    references: [
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
      { title: "Principles of Form and Design", author: "Wucius Wong", year: 1993 },
    ],
    suggestedParameters: [
      { key: "phi", label: "Golden Ratio", min: 1.0, max: 2.0, step: 0.001, default: 1.618 },
      { key: "subdivisions", label: "Subdivisions", min: 1, max: 12, step: 1, default: 6 },
    ],
  },
  {
    id: "rule-of-thirds",
    name: "Rule of Thirds",
    category: "composition",
    complexity: "beginner",
    description:
      "Divide the canvas into a 3x3 grid and place key elements at intersection points for dynamic balance.",
    theory: `The rule of thirds is one of the most fundamental composition techniques. By dividing the canvas into nine equal sections with two horizontal and two vertical lines, artists create four "power points" at the intersections where the viewer's eye naturally rests.

In generative art, this grid serves as an anchor system. Rather than centering elements (which creates static compositions), placing density clusters, color accents, or focal geometries at third-line intersections produces dynamic, engaging layouts.

This rule also applies to the distribution of visual weight: roughly two-thirds of the canvas can be one tone or density, with the remaining third providing contrast.`,
    principles: [
      "Place primary focal elements at one of the four intersection points",
      "Align dominant lines (horizons, divisions) with the third lines, not center",
      "Distribute visual weight asymmetrically: 2/3 to 1/3 ratio",
      "Use the grid to create tension between filled and empty areas",
      "Multiple elements should occupy different intersection points",
    ],
    references: [
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
      { title: "Principles of Form and Design", author: "Wucius Wong", year: 1993 },
    ],
    suggestedParameters: [
      { key: "gridDivisions", label: "Grid Divisions", min: 2, max: 8, step: 1, default: 3 },
      { key: "focalStrength", label: "Focal Strength", min: 0.1, max: 1.0, step: 0.1, default: 0.7 },
    ],
  },
  {
    id: "visual-weight",
    name: "Visual Weight & Balance",
    category: "composition",
    complexity: "intermediate",
    description:
      "Create equilibrium through the distribution of visual weight — size, density, color intensity, and position.",
    theory: `Every visual element carries "weight" determined by its size, color intensity, texture density, and position relative to the canvas center. Rudolf Arnheim's research showed that viewers perceive compositions as balanced or imbalanced based on this aggregate weight distribution.

In generative art, visual weight manifests through:
- **Size**: Larger elements carry more weight
- **Value contrast**: High-contrast elements are heavier than low-contrast ones
- **Color saturation**: Saturated colors are heavier than muted ones
- **Density**: Clusters of small elements can balance a single large one
- **Position**: Elements farther from center exert more leverage (like a seesaw)

Balance can be symmetrical (formal, stable), asymmetrical (dynamic, interesting), or radial (emanating from center).`,
    principles: [
      "A small, high-contrast element can balance a large, low-contrast one",
      "Elements farther from the center carry more compositional weight",
      "Asymmetrical balance creates more visual interest than symmetry",
      "Distribute density gradients to create directional visual flow",
      "Empty space (negative space) has visual weight and must be balanced too",
      "Color saturation and value contribute independently to perceived weight",
    ],
    references: [
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
    ],
    suggestedParameters: [
      { key: "balancePoint", label: "Balance Point", min: 0.2, max: 0.8, step: 0.05, default: 0.5 },
      { key: "weightContrast", label: "Weight Contrast", min: 0.1, max: 2.0, step: 0.1, default: 1.0 },
    ],
  },
  {
    id: "gestalt-grouping",
    name: "Gestalt Grouping",
    category: "composition",
    complexity: "intermediate",
    description:
      "Apply Gestalt principles — proximity, similarity, closure, continuity — to organize elements into perceived wholes.",
    theory: `Gestalt psychology reveals how humans perceive visual elements as organized groups rather than isolated parts. These principles are powerful tools for generative artists:

- **Proximity**: Elements close together are perceived as a group. Control spacing to create clusters or separations.
- **Similarity**: Elements sharing color, size, or shape are grouped. Use gradual variation to create sub-groups.
- **Closure**: The mind completes incomplete shapes. Leave gaps in patterns — viewers will fill them in.
- **Continuity**: Elements arranged along a line or curve are perceived as related. Use flow fields or parametric curves.
- **Figure-Ground**: The relationship between foreground elements and background space defines the composition.

In generative art, these principles help create readable structure from potentially chaotic algorithms.`,
    principles: [
      "Use proximity (spacing) as the primary grouping mechanism",
      "Vary one property (color, size) while keeping others constant to create similarity groups",
      "Leave intentional gaps for the viewer's mind to complete (closure)",
      "Arrange elements along implied lines or curves for continuity",
      "Ensure clear figure-ground separation at all parameter settings",
      "Layer multiple Gestalt principles for complex but readable compositions",
    ],
    references: [
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
      { title: "Principles of Form and Design", author: "Wucius Wong", year: 1993 },
    ],
    suggestedParameters: [
      { key: "groupSpacing", label: "Group Spacing", min: 0.5, max: 5.0, step: 0.1, default: 2.0 },
      { key: "similarity", label: "Similarity", min: 0.0, max: 1.0, step: 0.05, default: 0.8 },
      { key: "elementCount", label: "Element Count", min: 10, max: 500, step: 10, default: 100 },
    ],
  },
  {
    id: "figure-ground",
    name: "Figure-Ground Relationship",
    category: "composition",
    complexity: "beginner",
    description:
      "Control the interplay between positive forms (figure) and negative space (ground) for clarity and ambiguity.",
    theory: `The figure-ground relationship is the most fundamental perceptual organization. Every composition consists of figures (perceived objects) and ground (the space around and between them).

Strong figure-ground contrast creates clarity and focus. Deliberate ambiguity — where figure and ground are interchangeable — creates visual puzzles that engage viewers (as in M.C. Escher's tessellations).

In generative art, controlling figure-ground means managing:
- Value contrast between elements and background
- Edge definition (sharp vs. soft boundaries)
- Density distribution (clustered elements read as figure)
- Reversibility (can the viewer flip perception?)`,
    principles: [
      "Maintain sufficient contrast between figure and ground for readability",
      "Use value (light/dark) as the primary figure-ground separator",
      "Create deliberate ambiguity for visual interest when appropriate",
      "Small enclosed areas tend to be perceived as figure; large areas as ground",
      "Convex shapes are more likely perceived as figure than concave ones",
    ],
    references: [
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
    ],
    suggestedParameters: [
      { key: "contrast", label: "Figure-Ground Contrast", min: 0.1, max: 1.0, step: 0.05, default: 0.7 },
      { key: "density", label: "Figure Density", min: 0.1, max: 0.9, step: 0.05, default: 0.4 },
    ],
  },
  {
    id: "rhythm-movement",
    name: "Rhythm & Movement",
    category: "composition",
    complexity: "advanced",
    description:
      "Create visual rhythm through repetition, variation, and progression to guide the viewer's eye across the composition.",
    theory: `Rhythm in visual art functions like rhythm in music — it creates patterns of emphasis and rest that move the viewer's eye through the composition. Wucius Wong identifies several types of visual rhythm:

- **Regular rhythm**: Consistent repetition of identical elements at equal intervals. Creates order and predictability.
- **Alternating rhythm**: Two or more elements or spacings alternate. Creates more complex patterns.
- **Progressive rhythm**: Elements gradually change in size, color, spacing, or orientation. Creates directional movement.
- **Flowing rhythm**: Elements follow organic, curving paths. Creates natural, fluid movement.
- **Random rhythm**: Irregular repetition with controlled variation. Creates controlled chaos.

In generative art, rhythm emerges from the interplay between your algorithm's regularity and its stochastic variation. The seed controls the specific instance; the parameters control the type and intensity of rhythm.`,
    principles: [
      "Establish a base rhythm through regular repetition before introducing variation",
      "Use progressive changes in size or spacing to create directional movement",
      "Alternate between tension (clustering) and release (spacing) zones",
      "Let flow fields or parametric curves create natural movement paths",
      "Control the ratio of regularity to randomness via parameters",
      "Use acceleration/deceleration in element distribution for energy",
    ],
    references: [
      { title: "Principles of Form and Design", author: "Wucius Wong", year: 1993 },
      { title: "Art and Visual Perception", author: "Rudolf Arnheim", year: 1954 },
    ],
    suggestedParameters: [
      { key: "frequency", label: "Rhythm Frequency", min: 1, max: 20, step: 1, default: 8 },
      { key: "variation", label: "Variation", min: 0.0, max: 1.0, step: 0.05, default: 0.3 },
      { key: "flow", label: "Flow Strength", min: 0.0, max: 2.0, step: 0.1, default: 0.5 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Color Theory Skills (Albers, Itten)
// ---------------------------------------------------------------------------

export const COLOR_SKILLS: readonly SkillDefinition[] = [
  {
    id: "color-harmony",
    name: "Color Harmony Systems",
    category: "color",
    complexity: "beginner",
    description:
      "Use systematic color relationships — complementary, analogous, triadic, split-complementary — for harmonious palettes.",
    theory: `Color harmony describes combinations of colors that are aesthetically pleasing. Johannes Itten formalized these relationships using the color wheel:

- **Complementary**: Colors opposite on the wheel (e.g., blue/orange). Maximum contrast, vibrant when juxtaposed.
- **Analogous**: 2-4 adjacent colors on the wheel. Harmonious and calm, low contrast.
- **Triadic**: Three colors equally spaced (120° apart). Balanced and vibrant.
- **Split-complementary**: A color plus the two colors adjacent to its complement. High contrast with less tension.
- **Tetradic**: Two pairs of complementary colors. Rich and complex.

In generative art, these systems provide algorithmic palette generation. Start with a base hue, then calculate harmonious companions using angular relationships on the HSL color wheel.`,
    principles: [
      "Choose one dominant color and use harmonics as accents (60-30-10 rule)",
      "Complementary pairs create maximum vibrance — use for focal contrast",
      "Analogous schemes work well for atmospheric, mood-driven pieces",
      "Vary saturation and value within a harmonic scheme for depth",
      "Use triadic schemes when you need balanced variety without chaos",
    ],
    references: [
      { title: "The Art of Color", author: "Johannes Itten", year: 1961 },
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
    ],
    suggestedParameters: [
      { key: "baseHue", label: "Base Hue", min: 0, max: 360, step: 1, default: 200 },
      { key: "harmonyAngle", label: "Harmony Angle", min: 15, max: 180, step: 5, default: 120 },
    ],
    suggestedColors: [
      { key: "base", label: "Base Color", default: "#2196f3" },
      { key: "accent", label: "Accent Color", default: "#ff9800" },
    ],
  },
  {
    id: "simultaneous-contrast",
    name: "Simultaneous Contrast",
    category: "color",
    complexity: "advanced",
    description:
      "Exploit how adjacent colors alter each other's perceived hue, value, and saturation — the core of Albers' teaching.",
    theory: `Josef Albers spent decades demonstrating that color is the most relative medium in art. The same color appears dramatically different depending on its surroundings:

- A gray square on a black background appears lighter than the same gray on white
- A neutral color surrounded by red appears to shift toward green (and vice versa)
- Small color areas are more affected by their surroundings than large ones

This phenomenon — simultaneous contrast — means that in generative art, you cannot choose colors in isolation. The same palette will look different depending on element sizes, spacing, and layering order.

Practical implications:
- Test colors in context, not in isolation
- Adjacent complementary colors intensify each other
- Adjacent similar colors reduce each other's saturation
- Background color dramatically shifts perception of all foreground elements`,
    principles: [
      "The same color will appear different depending on what surrounds it",
      "Adjacent complementary colors intensify each other (vibration effect)",
      "Small color areas are dominated by surrounding colors",
      "Background color shifts the perceived hue of all foreground elements",
      "Use simultaneous contrast deliberately to create optical effects",
      "Test palette choices at various element sizes — effects change with scale",
    ],
    references: [
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
    ],
    suggestedParameters: [
      { key: "elementSize", label: "Element Size", min: 2, max: 100, step: 1, default: 20 },
      { key: "borderWidth", label: "Border Width", min: 0, max: 10, step: 0.5, default: 0 },
    ],
  },
  {
    id: "color-temperature",
    name: "Color Temperature",
    category: "color",
    complexity: "beginner",
    description:
      "Use warm (red/orange/yellow) and cool (blue/green/violet) color relationships to create depth and emotional tone.",
    theory: `Color temperature divides the spectrum into warm colors (reds, oranges, yellows) and cool colors (blues, greens, violets). This division has profound perceptual and emotional effects:

**Spatial effects**: Warm colors appear to advance (come toward the viewer) while cool colors recede. This creates an automatic sense of depth without perspective geometry.

**Emotional associations**: Warm colors evoke energy, passion, urgency. Cool colors evoke calm, distance, contemplation.

**Temperature contrast**: The tension between warm and cool areas creates visual energy. A predominantly cool composition with a warm accent immediately draws the eye to the accent.

In generative art, map temperature to depth layers: cool backgrounds, warm foregrounds. Or use temperature gradients across the composition to create directional flow.`,
    principles: [
      "Warm colors advance, cool colors recede — use for spatial depth",
      "A small warm accent in a cool composition creates a strong focal point",
      "Temperature contrast is as important as value contrast for composition",
      "Map color temperature to z-depth or layering order",
      "Use temperature gradients to create directional energy flow",
    ],
    references: [
      { title: "The Art of Color", author: "Johannes Itten", year: 1961 },
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
    ],
    suggestedParameters: [
      { key: "warmth", label: "Warmth", min: 0.0, max: 1.0, step: 0.05, default: 0.5 },
      { key: "temperatureRange", label: "Temperature Range", min: 30, max: 180, step: 10, default: 90 },
    ],
    suggestedColors: [
      { key: "warm", label: "Warm Tone", default: "#ff6b35" },
      { key: "cool", label: "Cool Tone", default: "#4a90d9" },
    ],
  },
  {
    id: "itten-contrasts",
    name: "Itten's Seven Contrasts",
    category: "color",
    complexity: "advanced",
    description:
      "Apply Itten's systematic framework of seven color contrasts to create specific visual effects.",
    theory: `Johannes Itten identified seven fundamental types of color contrast, each producing distinct visual effects:

1. **Contrast of Hue**: Pure hues side by side (red, blue, yellow). Maximum color variety.
2. **Light-Dark Contrast**: Value differences. The strongest structural contrast.
3. **Cold-Warm Contrast**: Temperature opposition. Creates spatial depth.
4. **Complementary Contrast**: Opposite hues. Each intensifies the other.
5. **Simultaneous Contrast**: Perceived color shift caused by adjacency.
6. **Contrast of Saturation**: Pure vs. muted colors. Creates focus hierarchy.
7. **Contrast of Extension**: Relative area sizes of colors. Balances visual weight.

Each contrast type can be parameterized in generative art. A single piece might employ multiple contrasts simultaneously, with parameters controlling the intensity of each.`,
    principles: [
      "Light-dark contrast provides the structural backbone of any composition",
      "Use saturation contrast to create hierarchy: saturated = focal, muted = ambient",
      "Complementary contrast creates energy; analogous reduces it",
      "Contrast of extension: balance area ratios to color intensity (bright colors need less area)",
      "Layer multiple contrast types for visual complexity",
      "Control contrast intensity through parameters for exploration",
    ],
    references: [
      { title: "The Art of Color", author: "Johannes Itten", year: 1961 },
    ],
    suggestedParameters: [
      { key: "hueContrast", label: "Hue Contrast", min: 0.0, max: 1.0, step: 0.05, default: 0.5 },
      { key: "valueContrast", label: "Value Contrast", min: 0.1, max: 1.0, step: 0.05, default: 0.7 },
      { key: "saturationContrast", label: "Saturation Contrast", min: 0.0, max: 1.0, step: 0.05, default: 0.4 },
    ],
  },
  {
    id: "value-structure",
    name: "Value Structure",
    category: "color",
    complexity: "intermediate",
    description:
      "Organize compositions through light-dark value patterns — the foundation that underlies all color decisions.",
    theory: `Value (lightness/darkness) is the most important property of color for composition. A piece that works in grayscale will work in any palette; a piece that fails in grayscale cannot be saved by color alone.

Value structure means planning the distribution of lights, mid-tones, and darks across the composition. Classic approaches include:

- **High-key**: Predominantly light values. Airy, ethereal, optimistic.
- **Low-key**: Predominantly dark values. Dramatic, mysterious, intense.
- **Full-range**: Full spectrum from near-white to near-black. Maximum contrast and visual impact.
- **Limited-range**: Narrow value band. Subtle, atmospheric, unified.

In generative art, map value to depth, density, or importance. Establish a value plan (the notan — simplified light/dark pattern) before adding color complexity.`,
    principles: [
      "Squint at your output: if the value pattern is unclear, color won't help",
      "Limit your palette to 3-5 value steps for strong structure",
      "Reserve highest contrast for the focal area",
      "Use mid-tones for transitions and atmosphere",
      "Dark values carry more visual weight than light ones at equal size",
    ],
    references: [
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
      { title: "The Art of Color", author: "Johannes Itten", year: 1961 },
    ],
    suggestedParameters: [
      { key: "valueRange", label: "Value Range", min: 0.1, max: 1.0, step: 0.05, default: 0.8 },
      { key: "keyValue", label: "Key Value", min: 0.0, max: 1.0, step: 0.05, default: 0.3 },
    ],
  },
  {
    id: "palette-generation",
    name: "Algorithmic Palette Generation",
    category: "color",
    complexity: "intermediate",
    description:
      "Generate cohesive color palettes algorithmically using perceptual color spaces and mathematical relationships.",
    theory: `Traditional color theory works with the HSL/HSV color wheel, but perceptual uniformity is better achieved in modern color spaces like OKLCH (Oklab Lightness-Chroma-Hue).

In OKLCH:
- **L** (lightness, 0-1): Perceptually uniform brightness steps
- **C** (chroma, 0-0.4): Saturation/vibrancy
- **H** (hue, 0-360): Hue angle

Algorithmic palette strategies:
- **Fixed hue, varying L/C**: Monochromatic palette with perceptual uniformity
- **Fixed L/C, varying H**: Evenly-spaced hues at consistent brightness (true equiluminant palette)
- **Seed-based generation**: Use the sketch seed to derive a base hue, then calculate harmonics
- **Gradient interpolation**: Interpolate between anchor colors in OKLCH for smooth transitions

The advantage of working in OKLCH over HSL is that equal mathematical steps produce equal perceptual steps — a gradient from dark blue to light blue will look evenly spaced rather than having a perceptual "jump" in the middle.`,
    principles: [
      "Use OKLCH or Oklab for perceptually uniform color operations",
      "Generate palettes from seed + base hue for deterministic, explorable results",
      "Keep chroma (saturation) consistent across a palette for cohesion",
      "Vary lightness for value structure, hue for variety, chroma for energy",
      "Map parameter ranges to hue angles for intuitive color exploration",
      "Limit generated palettes to 3-7 colors for coherence",
    ],
    references: [
      { title: "Interaction of Color", author: "Josef Albers", year: 1963 },
    ],
    suggestedParameters: [
      { key: "baseHue", label: "Base Hue", min: 0, max: 360, step: 1, default: 220 },
      { key: "chroma", label: "Chroma", min: 0.05, max: 0.35, step: 0.01, default: 0.15 },
      { key: "paletteSize", label: "Palette Size", min: 3, max: 7, step: 1, default: 5 },
    ],
  },
];
