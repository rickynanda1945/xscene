import catalog from "./style-presets.json";
import { required } from "./errors";
export const MODELS = [
  "Google Flow / Veo",
  "Kling",
  "Seedance",
  "Sora",
  "Generic",
];
export const CAMERAS: Record<
  string,
  { label: string; camera: string; action: string }[]
> = {
  "Multi-Angle": [
    [
      "Front View",
      "Front-facing view",
      "Show the established subject from the front.",
    ],
    [
      "Side View",
      "Side-profile view",
      "Move to a side view without changing subject geometry.",
    ],
    [
      "Back View",
      "Rear view",
      "Show the rear angle without changing the subject, product or wardrobe.",
    ],
  ].map(([label, camera, action]) => ({ label, camera, action })),
  "Wide to Close-Up": [
    [
      "Wide Shot",
      "Wide establishing shot",
      "Establish the subject and environment.",
    ],
    ["Medium Shot", "Medium shot", "Show the subject and main action."],
    ["Close-Up", "Close-up", "Reveal a meaningful detail of the same subject."],
  ].map(([label, camera, action]) => ({ label, camera, action })),
  "Product Hero Sequence": [
    [
      "Product Introduction",
      "Medium product shot",
      "Introduce the selected product.",
    ],
    [
      "Product Detail",
      "Close-up or macro shot",
      "Show the same product material, packaging, label and detail without redesign.",
    ],
    [
      "Hero Shot",
      "Final product hero shot",
      "Finish on a clear hero view of the unchanged product.",
    ],
  ].map(([label, camera, action]) => ({ label, camera, action })),
  "Cinematic Montage": [
    [
      "Establishing Shot",
      "Wide establishing shot",
      "Establish scene geography and subject.",
    ],
    ["Action Shot", "Medium action shot", "Show the main action."],
    [
      "Detail Shot",
      "Close-up detail shot",
      "Show a relevant detail with consistent references.",
    ],
    [
      "Closing Shot",
      "Composed closing shot",
      "Resolve the scene in a coherent final frame.",
    ],
  ].map(([label, camera, action]) => ({ label, camera, action })),
  "Shot-Reverse-Shot": [
    [
      "Character A",
      "Character A angle",
      "Establish the first character and eyeline.",
    ],
    [
      "Character B",
      "Reverse angle",
      "Show Character B only if established in the script. Otherwise use a reverse or over-the-shoulder view of the same subject; do not invent a new identity.",
    ],
    [
      "Reaction Shot",
      "Reaction close-up",
      "Return to the established character for a natural reaction.",
    ],
  ].map(([label, camera, action]) => ({ label, camera, action })),
};
export type Settings = Record<string, string | number | boolean | null>;
export type Project = {
  id?: string;
  name: string;
  video_idea: string;
  video_goal: string;
  mode: "simple" | "advanced";
  duration: string;
  aspect_ratio: string;
  platform: string;
  ai_video_model: string;
  settings: Settings;
};
export const FLAGS = [
  "no_dialogue",
  "include_dialogue",
  "lock_identity",
  "lock_outfit",
  "lock_face",
  "include_subtitles",
  "continuous_scenes",
  "lock_lighting",
  "lock_character",
  "lock_product",
  "lock_logo",
  "lock_voice",
  "lock_location",
];
export function cleanProject(data: Record<string, any>): Project {
  required(
    !data.settings ||
      (typeof data.settings === "object" && !Array.isArray(data.settings)),
    "Invalid project settings.",
  );
  const settings: Settings = {};
  for (const [key, v] of Object.entries(data.settings || {})) {
    required(
      key.length <= 80 &&
        (v === null || ["string", "number", "boolean"].includes(typeof v)) &&
        String(v ?? "").length <= 12000,
      "Invalid project settings.",
    );
    if (FLAGS.includes(key))
      required(typeof v === "boolean", "Invalid toggle value.");
    if (
      [
        "character_id",
        "product_id",
        "brand_id",
        "background_asset_id",
        "logo_asset_id",
      ].includes(key) &&
      v !== "" &&
      v !== null
    )
      required(
        /^\d+$/.test(String(v)) && BigInt(String(v)) > 0n,
        "Invalid reference ID.",
      );
    if (key === "outfit_mode")
      required(
        ["reference", "random"].includes(String(v)),
        "Choose reference or random outfit.",
      );
    if (key === "camera_template")
      required(
        typeof v === "string" && (v === "" || Object.hasOwn(CAMERAS, v)),
        "Choose a supported camera template.",
      );
    settings[key] = v as Settings[string];
  }
  const idea = String(data.video_idea || "").trim();
  required(
    idea.length <= 12000 && (idea !== "" || settings.no_dialogue === true),
    "Add a scene script, or select No dialogue to create a visual-only scene.",
  );
  const out: any = {
    name:
      String(data.name || "Untitled Project")
        .trim()
        .slice(0, 180) || "Untitled Project",
    video_idea: idea,
    video_goal: String(data.video_goal || "Storytelling").slice(0, 100),
    settings,
  };
  const choices: Record<string, string[]> = {
    mode: ["simple", "advanced"],
    duration: ["5", "8", "10", "15", "20", "30"],
    aspect_ratio: ["9:16", "16:9", "1:1", "4:5"],
    platform: [
      "TikTok",
      "Instagram Reels",
      "YouTube Shorts",
      "YouTube",
      "Facebook",
      "Ads",
    ],
    ai_video_model: MODELS,
  };
  for (const [key, values] of Object.entries(choices)) {
    const value = String(data[key] ?? values[0]);
    required(values.includes(value), "Invalid " + key);
    out[key] = value;
  }
  return out;
}
export function preset(name: string, subtitles = false, silent = false) {
  const actual =
    name.toLowerCase() === "dramatic"
      ? "Drama"
      : Object.keys(catalog).find(
          (k) => k.toLowerCase() === name.trim().toLowerCase(),
        );
  if (!actual) return null;
  const result = {
    ...(catalog as Record<string, { positive: string; negative: string }>)[
      actual
    ],
  };
  const without = (text: string, terms: string[]) =>
    text
      .replace(/\.$/, "")
      .split(", ")
      .filter((v) => !terms.includes(v.toLowerCase()))
      .join(", ") + ".";
  if (subtitles)
    result.negative = without(result.negative, [
      "unwanted subtitles",
      "unwanted text",
    ]);
  if (silent)
    result.positive = without(result.positive, [
      "accurate lip synchronization",
      "conversational speaking rhythm",
      "natural speaking rhythm",
      "relaxed conversational delivery",
    ]);
  return result;
}
export type Reference = {
  asset_type: string;
  reference_name: string;
  original_filename: string;
  [key: string]: any;
};
export function buildPrompt(
  p: Project,
  refs: Reference[] = [],
  brand: Record<string, any> | null = null,
) {
  const s = { ...p.settings },
    silent = s.no_dialogue === true;
  if (silent) s.include_dialogue = false;
  if (p.mode === "simple")
    Object.assign(s, {
      include_subtitles: false,
      continuous_scenes: false,
      ambient: "",
      music: "",
      structure: "Single Action",
      main_action: "",
      hook: "",
      cta: "",
    });
  const v = (key: string, def = "") =>
      String((s[key] === "Custom" ? s[key + "_custom"] : s[key]) ?? def).trim(),
    style = v("style", p.video_goal),
    direction = preset(style, !!s.include_subtitles, silent),
    duration = Number(p.duration),
    idea =
      p.video_idea ||
      "Create a visual-only scene using the selected style and supplied references. Show clear visual actions without inventing speech or promotional claims.";
  const plan = p.mode === "simple" ? CAMERAS[v("camera_template")] || [] : [],
    frames =
      p.mode === "advanced"
        ? v("frame_script")
            .split(/\r\n|\r|\n/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
  required(
    frames.length <= Math.min(12, duration),
    "Use at most 12 shot lines and no more shots than duration seconds.",
  );
  const productRules = refs
    .filter((r) => r.asset_type === "product")
    .map(
      (r) =>
        `Use ${r.reference_name} as the exact product reference from the first frame to the final frame. Preserve the same product identity, shape, proportions, relative scale, colors, materials, packaging, labels, visible branding and logo placement in every shot. Never morph, replace or redesign the product or invent labels.`,
    );
  const characterRules = refs
    .filter((r) => r.asset_type === "character")
    .map(
      (r) =>
        `Use ${r.reference_name} as the same character from the first frame to the final frame. Preserve the same face, age, skin tone, hair/hijab and physical identity in the selected visual style. ` +
        (v("outfit_mode", "reference") === "random"
          ? "Choose one new outfit different from the reference clothing, then keep that exact outfit, colors, fabrics and accessories unchanged throughout the video. Random outfit means one wardrobe choice for the entire video."
          : "Follow the reference outfit exactly; keep the same clothing, colors, fabrics, patterns and accessories throughout every shot. Maintain the same wardrobe."),
    );
  const a: Record<string, string> = {};
  a["REFERENCE ASSETS"] =
    refs
      .map(
        (r) =>
          `${r.reference_name}\nFile: ${r.original_filename}\nRole: ${({ product: "Exact Product Visual Reference", character: "Primary Character Identity", scene: "BACKGROUND visual reference", brand: "LOGO / brand visual reference" } as Record<string, string>)[r.asset_type] || "Visual reference"}` +
          (r.asset_type === "brand"
            ? "\nPreserve the exact logo design, colors, typography and placement; never redraw or distort it."
            : r.asset_type === "scene"
              ? "\nPreserve the background layout, architecture, furniture and scene geography."
              : ""),
      )
      .join("\n\n") || "No image references supplied.";
  a.SUBJECT = `${idea}\nGoal: ${p.video_goal}. Create a ${duration} second ${p.aspect_ratio} video for ${p.platform}.`;
  if (direction) a["POSITIVE STYLE PROMPT"] = direction.positive;
  a["DIRECTION PRIORITY"] =
    "Explicit reference identity, outfit, dialogue/text settings, camera sequence and scene directions take priority over generic style phrases where they conflict. Express reference features in the selected visual style without forcing photorealism onto cartoon, animation or illustration.";
  a.CHARACTER =
    v("character_description") ||
    (characterRules.length
      ? "Use the selected character reference."
      : "No primary character specified.");
  a.SCENE =
    p.mode === "simple"
      ? "Follow the scene script and supplied background reference."
      : [
          v("location"),
          v("specific_location"),
          v("time"),
          v("weather"),
          v("activity"),
        ]
          .filter(Boolean)
          .join(", ");
  a.BACKGROUND =
    v("background_description") ||
    "Use the supplied background reference or scene setting.";
  a.ACTION = [
    "Structure: " + v("structure", "Single Action"),
    v("hook") ? "Hook: " + v("hook") : "",
    v("action"),
    v("main_action"),
    v("cta") ? "CTA: " + v("cta") : "",
  ]
    .filter(Boolean)
    .join("\n");
  a.CAMERA =
    p.mode === "simple"
      ? `Choose framing and movement appropriate to ${style} and the scene script.`
      : `${v("shot", "Medium")} shot; ${v("movement", "Static")}; ${v("feel", "Natural")} feel. Lens: ${v("lens", "Auto")}; depth: ${v("depth", "Balanced")}; composition: ${v("composition", "Rule of Thirds")}; motion intensity: ${v("motion", "35")}%.`;
  if (plan.length) {
    a["CAMERA TEMPLATE"] =
      v("camera_template") +
      "\nShot Sequence: " +
      plan.map((x) => x.label).join(" → ");
    a.CAMERA = a["CAMERA TEMPLATE"];
  }
  a.LIGHTING =
    p.mode === "simple"
      ? "Keep lighting appropriate to the scene and reference environment."
      : `${v("lighting", "Natural Daylight")}. Contrast: ${v("contrast", "Balanced")}; exposure: ${v("exposure", "Balanced")}.`;
  if (frames.length)
    a["FRAME / SHOT SCRIPT"] = frames
      .map(
        (line, i) =>
          `${Math.round((i * duration) / frames.length)}–${Math.round(((i + 1) * duration) / frames.length)}s: ${line}`,
      )
      .join("\n");
  if (p.mode === "advanced" && v("look_consistency"))
    a["LOOK CONSISTENCY"] = v("look_consistency");
  a["VISUAL STYLE"] =
    style +
    (p.mode === "advanced"
      ? `. ${v("visual_detail")} Pacing: ${v("pacing", "Natural")}.`
      : ".");
  if (brand)
    a.BRAND = `${brand.name}: ${brand.description}. Visual style: ${brand.visual_style}. Tone: ${brand.tone}. Colors: ${brand.primary_colors}; ${brand.secondary_colors}. Do: ${brand.brand_do}. Avoid: ${brand.brand_dont}`;
  if (productRules.length) a["PRODUCT CONSISTENCY"] = productRules.join("\n");
  if (characterRules.length)
    a["CHARACTER / OUTFIT CONSISTENCY"] = characterRules.join("\n");
  if (s.include_dialogue && v("dialogue"))
    a.DIALOGUE = `Language: ${v("language", "English")}. Accent: ${v("accent", "Neutral")}. Voice: ${v("voice", "Natural")}. Spoken words: "${v("dialogue")}"`;
  a.AUDIO =
    [
      v("ambient") ? "Ambient: " + v("ambient") : "",
      v("music") ? "Music: " + v("music") : "",
    ]
      .filter(Boolean)
      .join(". ") || "No audio direction specified.";
  if (silent) {
    a.DIALOGUE =
      "No dialogue, spoken words, narration, voice-over or singing. Keep mouths silent and use only nonverbal performance. Script text is visual/action direction, never a spoken line.";
    a.AUDIO +=
      " No speech or vocals; any background music must be instrumental.";
  }
  const caption =
    v("subtitle_text") || (s.include_dialogue ? v("dialogue") : "");
  if (s.include_subtitles)
    a["SUBTITLES / CAPTIONS"] =
      `${v("subtitle_mode", "Subtitles")}. Language: ${v("subtitle_language", "English")}. Position: ${v("subtitle_position", "Bottom center")}. Exact text: ${caption || "No text supplied; do not invent promotional claims."}. Styling: ${v("subtitle_style", "Readable sans-serif inside safe margins")}. Preserve exact spelling. Add final captions in post-production if the model cannot render them accurately.`;
  else a.TEXT = "No subtitles, captions or on-screen text.";
  a.CONTINUITY = [
    "Maintain spatial continuity, coherent lighting and stable reference identity in every shot.",
    ...productRules,
    ...characterRules,
  ].join(" ");
  if (s.continuous_scenes) {
    const locks = Object.entries({
      lighting: "lighting direction and exposure",
      character: "character identity and chosen wardrobe",
      product: "product appearance and packaging",
      logo: "exact logo design",
      voice: "voice identity and accent",
      location: "location and spatial geography",
    })
      .filter(([key]) => s["lock_" + key])
      .map(([, label]) => label);
    a["CONTINUOUS SCENES"] =
      `Scene ${v("scene_number", "1")}. Shared continuity brief: ${v("continuity_bible", "Reuse established references and scene details.")}\nPrevious scene ending: ${v("previous_scene", "Establish the first connected scene.")}\nLocks: ${locks.join("; ")}. Continue the previous final pose/action without resetting the environment.`;
    a.CONTINUITY += " " + a["CONTINUOUS SCENES"];
  }
  let negative =
    "No distorted anatomy, extra fingers, flicker, inconsistent faces, warped packaging, altered logos, watermarks or sudden continuity changes.";
  negative += s.include_subtitles
    ? " No misspelled or duplicate captions, or text beyond the requested wording."
    : " No unwanted text or subtitles.";
  if (direction) negative += " " + direction.negative;
  if (silent)
    negative +=
      " No speech, dialogue, narration, voice-over, vocals or singing.";
  if (productRules.length)
    negative +=
      " No product identity drift, changing packaging, altered labels or product substitution.";
  if (characterRules.length)
    negative +=
      " No face replacement, character identity drift or clothing changes between shots.";
  if (p.mode === "advanced" && v("negative")) negative += " " + v("negative");
  a["NEGATIVE INSTRUCTIONS"] = negative;
  a["MODEL DIRECTION"] =
    (
      {
        ["Google Flow / Veo"]:
          "For Veo: use a coherent visual sequence, explicit camera movement and " +
          (silent
            ? "only permitted nonverbal background audio."
            : "synchronized audio."),
        Kling:
          "For Kling: emphasize clear subject action and start-to-end movement.",
        Seedance:
          "For Seedance: describe clear shot transitions and consistent reference identity.",
        Sora: "For Sora: preserve physical plausibility and spatial/temporal continuity.",
      } as Record<string, string>
    )[p.ai_video_model] ||
    "Use the structured directions with your chosen model and check its supported duration.";
  const count =
      plan.length ||
      frames.length ||
      (duration <= 8 ? 2 : duration <= 10 ? 3 : 4),
    actions =
      v("structure") === "Hook → Action → CTA"
        ? [
            v("hook") || "Introduce the scene.",
            v("main_action") || idea,
            v("main_action") || idea,
            v("cta") || "Hold a clear final frame.",
          ]
        : [
            "Establish the subject and setting.",
            v("main_action") || idea,
            "Show the key action in detail.",
            "Resolve the scene in a clean final frame.",
          ];
  const segment = (text: string, start: number, end: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    return words
      .slice(
        Math.round((words.length * start) / duration),
        Math.round((words.length * end) / duration),
      )
      .join(" ");
  };
  const shots = Array.from({ length: count }, (_, i) => {
    const start = Math.round((i * duration) / count),
      end = Math.round(((i + 1) * duration) / count);
    return {
      time_start: start,
      time_end: end,
      label: plan[i]?.label || "",
      action: plan[i]
        ? plan[i].action + " Scene direction: " + idea
        : frames.length
          ? frames[i]
          : actions[i === count - 1 ? 3 : i],
      camera:
        plan[i]?.camera ||
        (p.mode === "simple"
          ? a.CAMERA
          : i === 0 && !frames.length
            ? "Wide establishing shot"
            : v("shot", "Medium") + " / " + v("movement", "Static")),
      dialogue: s.include_dialogue ? segment(v("dialogue"), start, end) : "",
      caption: s.include_subtitles
        ? v("subtitle_mode") === "On-screen text"
          ? caption
          : segment(caption, start, end)
        : "",
      character_reference: refs
        .filter((r) => r.asset_type === "character")
        .map((r) => r.reference_name)
        .join(", "),
      product_reference: refs
        .filter((r) => r.asset_type === "product")
        .map((r) => r.reference_name)
        .join(", "),
      background: a.BACKGROUND,
      continuity: a.CONTINUITY,
    };
  });
  const short = [
    direction?.positive,
    ...productRules,
    ...characterRules,
    silent ? a.DIALOGUE : "",
    a["FRAME / SHOT SCRIPT"],
    a["LOOK CONSISTENCY"],
    a["SUBTITLES / CAPTIONS"],
    a["CONTINUOUS SCENES"],
    a.BACKGROUND,
    idea,
    a.SCENE,
    a.CAMERA,
    a.LIGHTING,
    `Style: ${style}. ${duration}s, ${p.aspect_ratio}.`,
    refs.length
      ? "References: " + refs.map((r) => r.reference_name).join(", ") + "."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    master_prompt: Object.entries(a)
      .map(([heading, body]) => heading + "\n" + body)
      .join("\n\n"),
    short_prompt: short,
    negative_prompt: negative,
    shots,
  };
}
