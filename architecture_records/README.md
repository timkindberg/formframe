# Architecture records

Sequential ADRs for FormFrame. **`ARCHITECTURE.md`** (repo root) is the living
current snapshot; these files are the decision history.

## How to read status

| Status | Meaning |
| --- | --- |
| **Accepted** | In force (may carry an annotation narrowing an earlier clause). |
| **Proposed** | Written but not yet locked. |
| **Superseded** | Replaced by a later ADR; kept in place for history (not moved). |
| **Historical** | Pre-ADR dump / narrative, not a discrete decision. |

**Archive policy (ADR 050):** superseded ADRs stay in this directory with a
`Superseded by …` status line and a short note — same pattern as ADR 004 / ADR 022.
They are **not** moved to `architecture_records/superseded/`; a flat folder + this
index is enough, and moving would churn cross-links.

**Validation pivot:** [ADR 050](./050_validation_is_a_non_goal.md) — the library
renders errors; recipes produce them. Anchors that remain: [ADR 008](./008_swappability_earned_by_second_implementation.md)
(earn the seam), [ADR 024](./024_adapters_are_patterns_not_packages.md) (recipes,
annotated), [ADR 011](./011_form_state_is_a_shallow_slot.md) (shallow form-state /
no first-party store, annotated).

> **Note:** two files share number **036** — dual-build (accepted) vs spreadable
> validation capability (superseded by ADR 050). Prefer links to the filename.

---

## Accepted

| File | Title | Notes |
| --- | --- | --- |
| [002](./002_parts_api_consolidation_and_validation_structure.md) | Parts API Consolidation and Validation Structure | |
| [003](./003_boolean_and_enum_field_types.md) | Boolean and Enum Field Type Support | |
| [005](./005_handler_inheritance_via_parameters.md) | Handler Inheritance via Parameters | |
| [006](./006_core_as_form_tree_ir_with_adapters.md) | Core Is the Form-Tree IR; Front-ends and Consumers Are Adapters | |
| [007](./007_schema_generates_jsx_customizes.md) | Schema Generates; JSX (or Serializable Schema) Customizes | |
| [008](./008_swappability_earned_by_second_implementation.md) | Swappability Is Earned by a Second Implementation | Anchor |
| [009](./009_verification_gated_autonomous_loop.md) | Development Runs as a Verification-Gated Autonomous Loop | |
| [010](./010_recursive_continuation_rendering.md) | Recursive Continuation Rendering & Customization | |
| [011](./011_form_state_is_a_shallow_slot.md) | Form-State Is a Shallow Slot; Validation and UI Are the Primary Swaps | Annotated by ADR 050 |
| [012](./012_typed_core_ir.md) | A Richer, Typed Core IR | |
| [013](./013_declarative_template_set_and_engine_decomposition.md) | The Renderer Adapter as the Customization Seam | |
| [014](./014_continuation_engine_in_core.md) | The Continuation Engine Belongs to Core | |
| [015](./015_stateful_renderer_seam_and_array_interactivity.md) | The Stateful-Renderer Seam | |
| [016](./016_render_by_calling_not_mounting.md) | Render by Calling, Not Mounting | |
| [017](./017_component_re_entry_layer.md) | Component Re-entry Layer | |
| [018](./018_dense_array_paths_via_ui_repathing.md) | Dense Array Paths via UI Re-pathing | |
| [020](./020_shared_validation_contract_package.md) | Shared Validation-Contract Package | Premise weakened by ADR 050; cleanup with demotion |
| [024](./024_adapters_are_patterns_not_packages.md) | Adapters Are Patterns, Not Packages | Annotated by ADR 050 |
| [028](./028_whole_document_validation_stays_field_scoping_deferred.md) | Whole-Document Validation Stays; Field-Scoping Deferred | Premise weakened by ADR 050 |
| [029](./029_presentation_stage_over_neutral_facts.md) | Presentation as a Dedicated Stage over Neutral Facts | |
| [030](./030_container_facts_and_subtree_collapse.md) | Container Facts | |
| [033](./033_core_is_schema_agnostic_input_packages.md) | Core Is Schema-Agnostic — Input Packages | |
| [034](./034_zod_front_end_direct_introspection.md) | The Zod Front-End Compiles by Direct Introspection | |
| [035](./035_react_binds_form_trees_not_schemas.md) | React Binds Form Trees, Not Schemas | |
| [036](./036_dual_build_and_development_condition.md) | Dual ESM+CJS Build, Source-Resolved Dev Loop | Dual-build (not the spreadable-validation 036) |
| [037](./037_validation_errors_terminology.md) | Validation Failures Are Errors in Owned Interfaces | Kept under ADR 050 (display types) |
| [038](./038_formframe_product_and_package_identity.md) | FormFrame Product and Package Identity | |
| [039](./039_sister_adapters_share_conformance_oracles.md) | Sister Adapters Share Conformance Oracles | |
| [040](./040_renderer_package_family.md) | Name Rendering Adapters `renderer-*` | |
| [047](./047_customize_component_handlers_and_parts.md) | The Customize Layer | |
| [048](./048_typed_tree_form_shape_binding.md) | Front-ends brand the tree with a resolved `FormShape` | |
| [049](./049_as_const_guard_and_runtime_door.md) | The `as const` narrowing guard | |
| [050](./050_validation_is_a_non_goal.md) | Validation Is a Non-Goal — Library Renders; Recipes Produce | Current validation framing |

## Proposed

| File | Title |
| --- | --- |
| [031](./031_present_render_layer_boundary.md) | The Three-Way Boundary — Schema / `present()` / `renderNode` |
| [032](./032_query_methods_traverse_arrays.md) | Query Surface Traverses Arrays |

## Superseded

| File | Title | Superseded by |
| --- | --- | --- |
| [004](./004_root_handler_and_react_default_components.md) | Root Handler in Walk API and React Default Components | ADR 005 |
| [019](./019_validation_as_a_side_loaded_slot.md) | Validation as a Side-Loaded Capability Slot | [ADR 050](./050_validation_is_a_non_goal.md) |
| [021](./021_reactive_validation.md) | Reactive (Validate-on-Change) Validation | [ADR 050](./050_validation_is_a_non_goal.md) |
| [022](./022_widget_selection_layered_slot.md) | Widget Selection as a Layered IR Slot | ADR 029 |
| [023](./023_reactive_state_subscription_store.md) | Reactive State as a Fine-Grained Subscription Store | [ADR 050](./050_validation_is_a_non_goal.md) |
| [025](./025_validator_purity_and_transformed_data.md) | The Validator is Pure and Returns Transformed Data | [ADR 050](./050_validation_is_a_non_goal.md) |
| [026](./026_standard_schema_at_the_boundary.md) | Speak Standard Schema at the Boundary | [ADR 050](./050_validation_is_a_non_goal.md) |
| [027](./027_touched_tracking_and_error_display_policy.md) | Touched Tracking + `showErrorsWhen` | [ADR 050](./050_validation_is_a_non_goal.md) |
| [036](./036_spreadable_validation_capability.md) | `useFormTree` Returns a Spreadable Validation Capability | [ADR 050](./050_validation_is_a_non_goal.md) |
| [041](./041_async_validator_is_a_sibling_seam.md) | Async Validator Is a Sibling Seam | [ADR 050](./050_validation_is_a_non_goal.md) |
| [042](./042_validation_run_authority_and_failure.md) | Validation-Run Authority, Staleness, and Failure | [ADR 050](./050_validation_is_a_non_goal.md) |
| [043](./043_submit_snapshots_and_transformed_output.md) | Submit Snapshots, Transformed Output, and `isSubmitting` | [ADR 050](./050_validation_is_a_non_goal.md) |
| [044](./044_pending_state_and_retained_errors.md) | Pending State, Retained Errors, and Store Ownership | [ADR 050](./050_validation_is_a_non_goal.md) |
| [045](./045_async_standard_schema_and_conformance.md) | Async Standard-Schema Interop and Conformance | [ADR 050](./050_validation_is_a_non_goal.md) |
| [046](./046_async_validation_ratified_design.md) | Async Validation — Ratified Design | [ADR 050](./050_validation_is_a_non_goal.md) |

## Historical

| File | Title |
| --- | --- |
| [001](./001_core_layer_tree_structure_and_state_decisions.md) | Architecture & Design Decisions (pre-ADR dump) |
