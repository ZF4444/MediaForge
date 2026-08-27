---
name: image-generation
version: 1.0.0
---
# Image Generation

Use this Skill for requests to create, revise, run, compare, or iterate image-generation nodes on the canvas.

## Scope And Boundaries

- The current supported canvas image capability is `image.text_to_image`. Do not claim that image-to-image, inpainting, ControlNet, or reference-strength controls exist unless `read_capability_registry` and `read_capability_parameters` expose them for the selected model.
- A referenced canvas node is context for the plan. It does not by itself create a provider-side image input. Describe visual continuity in the prompt and plan, and ask for clarification if the requested edit needs an unavailable pixel-level control.
- All node changes must remain a `SemanticPlan` submitted by `propose_canvas_patch`; never state that an image was created or queued before confirmation and the existing execution flow completes.

## Required Reading

Before proposing an image-generation change:

1. Call `read_canvas_context` to inspect the target nodes, existing images, and connections. Use referenced or selected nodes as the source of continuity requirements.
2. Call `read_capability_registry` to select an enabled image capability and provider/model combination.
3. Call `read_capability_parameters` for the selected `image.text_to_image` provider and model. Use only its fields, option values, defaults, and `params_path` in the proposal.

## Creative Brief

Extract only the decisions that affect the generated image:

- subject, action, setting, visual style, mood, lighting, material, and composition;
- aspect ratio, resolution, quality, and count when the user provides them or the selected schema makes them relevant;
- when a canvas image is referenced, separate **inherit** (for example, composition, palette, subject identity, or atmosphere) from **change** (for example, outfit, action, or time of day).

For a broad idea with no blocking ambiguity, choose a coherent visual direction and present it in the node title and prompt. Ask `request_clarification` only when a user choice would materially change the result, such as conflicting requested styles or an unspecified target among several selected nodes.

## Prompt And Node Plan

- Write a direct natural-language prompt that prioritizes subject, action, setting, composition, lighting, and style. Include only details that matter to the requested result.
- Use `semantic_type=image_generation` and `capability=image.text_to_image` for an API image node.
- Put parameter values under the `params_path` returned by `read_capability_parameters`; for normal image nodes this is normally `node.params.runSettings`.
- Preserve provider/model IDs and option values exactly as returned by the capability tools. User-facing aliases and labels may be used in the explanation, but not substituted for submitted values.
- Create a new node for a new composition or variant. Update an existing node only when the user clearly identifies it as the iteration target.
- Set `execution.auto_run` to `false` unless the user explicitly asks to run after confirmation. A plan may include `canvas.run_node` only for a user-requested run of a valid image node.
- State the intended output, key prompt direction, model settings, and whether the plan creates, updates, or runs a node in the confirmation reason.

## Review And Iteration

After execution, inspect the actual node/result before suggesting an iteration. Keep successful outputs intact; create a separate branch node for alternative styles or compositions unless the user explicitly requests replacement. Do not infer an output's dimensions, ratio, or quality from the prompt when the actual result is available on the canvas.
