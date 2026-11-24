import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  cleanProject,
  CAMERAS,
  preset,
  type Project,
} from "../src/lib/prompts";
import catalog from "../src/lib/style-presets.json";
import { cleanTemplate } from "../src/lib/templates";
const project: Project = {
  name: "Test",
  video_idea: "A creator shows a product.",
  video_goal: "UGC",
  mode: "simple",
  duration: "15",
  aspect_ratio: "9:16",
  platform: "TikTok",
  ai_video_model: "Google Flow / Veo",
  settings: { style: "UGC" },
};
const refs = [
  {
    asset_type: "product",
    reference_name: "PRODUCT_REF_01",
    original_filename: "product.png",
  },
  {
    asset_type: "character",
    reference_name: "CHARACTER_REF_02",
    original_filename: "character.png",
  },
];
for (const mode of ["simple", "advanced"] as const)
  for (const [name, style] of Object.entries(catalog))
    test(`${mode}: ${name} preserves supplied style directions`, () => {
      const r = buildPrompt({ ...project, mode, settings: { style: name } });
      assert(r.master_prompt.includes(style.positive));
      assert(r.short_prompt.includes(style.positive));
      assert(r.negative_prompt.includes(style.negative));
    });
for (const [name, plan] of Object.entries(CAMERAS))
  for (const duration of [5, 8, 10, 15, 20, 30])
    test(`${name}: ${duration}s ordered full timeline`, () => {
      const r = buildPrompt({
        ...project,
        duration: String(duration),
        settings: { style: "UGC", camera_template: name },
      });
      assert.deepEqual(
        r.shots.map((s) => s.label),
        plan.map((s) => s.label),
      );
      let last = 0;
      for (const shot of r.shots) {
        assert.equal(shot.time_start, last);
        assert(shot.time_end > last);
        last = shot.time_end;
      }
      assert.equal(last, duration);
      assert(r.master_prompt.includes(plan.map((x) => x.label).join(" → ")));
    });
test("No dialogue accepts a blank script without speaking stored text", () => {
  const p = {
    ...project,
    video_idea: "",
    settings: {
      style: "UGC",
      no_dialogue: true,
      include_dialogue: true,
      dialogue: "Stored words",
    },
  };
  const before = structuredClone(p),
    r = buildPrompt(cleanProject(p));
  assert.deepEqual(p, before);
  assert(r.master_prompt.includes("No dialogue"));
  assert(!r.master_prompt.includes("Stored words"));
  assert(!r.short_prompt.includes("conversational speaking rhythm"));
  assert(r.shots.every((s) => s.dialogue === ""));
});
test("No dialogue retains explicit captions and instrumental music", () => {
  const r = buildPrompt({
    ...project,
    mode: "advanced",
    settings: {
      style: "UGC",
      no_dialogue: true,
      include_subtitles: true,
      subtitle_text: "Exact caption",
      music: "Chill",
    },
  });
  assert(r.master_prompt.includes("Exact caption"));
  assert(r.master_prompt.includes("Chill"));
  assert(!r.negative_prompt.includes("unwanted subtitles"));
});
for (const outfit of ["reference", "random"])
  test("First-to-last product and character continuity: " + outfit, () => {
    const r = buildPrompt(
      { ...project, settings: { style: "Cartoon", outfit_mode: outfit } },
      refs,
    );
    for (const field of ["master_prompt", "short_prompt"] as const) {
      assert(r[field].includes("first frame to the final frame"));
      assert(
        r[field].includes(
          outfit === "random"
            ? "one wardrobe choice"
            : "Follow the reference outfit exactly",
        ),
      );
    }
    assert(
      r.shots.every((s) =>
        s.continuity.includes("first frame to the final frame"),
      ),
    );
  });
test("Advanced ignores stored Simple camera and respects frame script", () => {
  const r = buildPrompt({
    ...project,
    mode: "advanced",
    settings: {
      camera_template: "Multi-Angle",
      frame_script: "First custom frame\nSecond custom frame",
    },
  });
  assert.equal(r.shots.length, 2);
  assert.equal(r.shots[0].action, "First custom frame");
  assert(!r.master_prompt.includes("CAMERA TEMPLATE"));
});
test("Too many custom shots are rejected", () =>
  assert.throws(() =>
    buildPrompt({
      ...project,
      mode: "advanced",
      duration: "5",
      settings: { frame_script: "a\nb\nc\nd\ne\nf" },
    }),
  ));
for (const input of [
  { video_idea: "" },
  { settings: "bad" },
  { settings: { no_dialogue: "true" } },
  { settings: { outfit_mode: "changing" } },
  { settings: { camera_template: "unknown" } },
  { settings: { character_id: "-1" } },
  { duration: "7" },
])
  test("Rejects invalid input " + JSON.stringify(input), () =>
    assert.throws(() => cleanProject({ ...project, ...input })),
  );
test("Template import rejects private IDs and nested data", () => {
  for (const settings of [
    { product_id: "1" },
    { any: { key: "secret" } },
    { no_dialogue: "true" },
  ])
    assert.throws(() =>
      cleanTemplate({ name: "Test", idea: "Scene", settings }),
    );
  assert.equal(
    cleanTemplate({
      name: "Test",
      idea: "Scene",
      settings: { no_dialogue: true, camera_template: "Multi-Angle" },
    }).name,
    "Test",
  );
});
test("Legacy Dramatic alias uses Drama preset", () =>
  assert.equal(preset("Dramatic")?.positive, catalog.Drama.positive));
