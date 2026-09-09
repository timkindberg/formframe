# VNDLY RJSF inventory (FormFrame #159)

Source: local VNDLY checkout. No tenant DBs crawled. FormFrame unchanged.

**Spike target for #160:** `ScheduleMeetingModal` (`assets/js/interviews/ScheduleMeetingModal.tsx`).

---

## How RJSF shows up

Three layers, not one:

1. **Full RJSF forms** — `VndlyFormWithConditionals2` (production). Legacy `VndlyFormWithConditionals.jsx` has no production importers. Surveys still call `applyRules(...)(Form)` on raw `@rjsf/core`.
2. **Unknown-shape generic fields** — `GenericFormFields` / `useGenericFormRJSFQuery`. Tenant schema from the API. Embeds on job, work order, tracker, SOW, expense, invoice, RFP, vendor, etc.
3. **JSFSelect leaked out of RJSF** — standalone `JSFSelect` (~47 production files) plus `HookFormJSFSelect` (~100 RHF files) and `FormikJSFSelect` (3 files). This is VNDLY’s async-select adapter, not a FormFrame surface.

`JSONSchemaTableForm` wraps (1) for array-of-objects admin tables (Work Types, Work Type Profiles, Premium Rates, Customization CDS).

Chakra vs not: most product forms pass `isChakra` (chakra widget/field/template set). Budget Settings and some worker-tracking views do not.

---

## Widgets

### Default registry (`VndlyJsonSchemaFormBase/widgets/index.jsx`)

`buPicker`, `toggle`, `select`, `date`, `wysiwyg`, `currency`, `decimal`, `percentage`, `radio`, `stringTime`, `bulkString` (alias of stringTime; unused in production), `time`, `phone`, `checkbox`.

### Chakra registry (`chakraTheme/Widgets/Widgets.js`)

Adds / overrides: `BaseInput`, `CheckboxWidget`, `CheckboxesWidget`, `segmentedControl`, `RangeWidget`, `textarea`, `UpDownWidget`, `bulkCustomFieldInput`. Drops `percentage` and the base `checkbox` key.

### Per-screen extras

| Key | Where |
|---|---|
| `InputToggle` | Budget Settings |
| `status_badge`, `date_display`, `datetime_with_tooltip`, `boolean_display`, `string_display`, `tracker_id`, `worker_id` | Worker Tracking view-only generic forms |
| `select_with_details`, SOW `date` | Dead — specs only |

### Distinct `ui:widget` strings in production schemas

`select`, `toggle`, `hidden`, `currency`, `textarea`, `radio`, `decimal`, `time`, `text`, `password`, `wysiwyg`, `buPicker`, `phone`, `date`, `stringTime`, `percentage`, `InputToggle`, `checkboxes`, `segmentedControl`, `bulkCustomFieldInput`, plus WT view-only widgets above. `visible` appears in JobTemplateForm (not in any registry — falls through). RJSF built-ins `updown` / `range` / `color` are stories only.

---

## Fields

### Default registry (`fields/index.js`)

`autogrid`, `row_column_layout`, `layout`, `select`, `multi_select`, `table`, `flexgrid`, `charge_codes`, `generic_fields`, `LabelField`, `SchemaField`, `form_section`, `accordion`, `fieldset`, `wdCustomObject`, `form_sections`, `simple_grid`, `grid`, `flex`, `stack`, `multiValueInput`, `currency_with_code`, `ObjectField`.

### Distinct `ui:field` strings

Most common: `layout` (Chakra/Bootstrap tree via `ui:layout`). Also `select` / `multi_select`, `form_section` / `form_sections`, `row_column_layout`, `simple_grid` / `autogrid`, `accordion` / `fieldset` / `wdCustomObject` (Workday), `multiValueInput`, `currency_with_code`, `charge_codes`, `table`.

Per-screen: `unique_id` (tracker), `customLaborAmountField` (budget calculator). JobForm passes **component refs** in uiSchema (`ReasonForHireFields`, `GenericFieldsField`, …). `TooltipDescriptionField` is documented, never registered.

`ui:layout` is the big VNDLY-specific customize: a serializable JSX-ish tree (`Stack` / `SimpleGrid` / `Card` / `FormSection` / …). Known-shape FormFrame would replace this with actual JSX.

---

## `$rules` actions

Default (`actions/index.js`): `remove`, `require`, `set`, `setValue`, `setTitle`, `placeholder`, `disable`, `readonly` / `setReadOnly`, `hideFieldAndDefaultValue`, `hide`, `allowNull`.

### How rules arrive

There is no form-document `$rules` consumed as a JSON Schema keyword. Three pipes:

1. **`schema.$rules` on committed settings YAML** (~29 modules under `app/settings/modules/`) — terse arrays, passed as the `rules` prop.
2. **`schema.rjsf.ui_rules`** — generic fields / checklist preview.
3. **Inline `rules=`** — JobForm (terse), JobTemplateForm (verbose `{conditions, event}`), ScheduleMeetingModal, AddExpenseReportModal, AddVendorModal, bulk-update JSON `ui_rules`, etc.

`VndlyFormWithConditionals2` always runs `compileTerseRuleSyntax`.

### Production extraActions

| Action | Screen |
|---|---|
| `setFieldEnum` | Workday connector |
| `checkOffice365MeetingSuggestionsEvents` | Schedule meeting (job-app / interview wrappers) |
| `averageScore` | Surveys (old engine) |

---

## Templates

Default when `isChakra`: chakra `FieldTemplate`, `ArrayFieldTemplate`, `ObjectFieldTemplate`, `ErrorList`. Otherwise RJSF core defaults.

Opt-in: `FlexGridObjectTemplate` (tracker + some SOW settings), `JSONSchemaTableForm` templates (admin tables), `VendorFeeObjectTemplate` (JobForm fee object). `InlineFieldTemplate` is unused.

---

## Screens

Classification: **unknown-shape** = schema from DB/API/tenant and can change without a deploy (generic fields, CDS, surveys). **Known-shape** = schema authored in JS/TS/JSON/YAML in the repo. Settings YAML fetched at runtime still counts as known-shape — a deploy is required to change the shape.

### Unknown-shape (do not spike)

| Screen | Why |
|---|---|
| `GenericFormFields` | *Is* Mode 1. Namespaces: general, worker_tracking, sow, budget_calculator, job_form, timesheet, work_order, expenses, invoices, reports, candidate, rfp, vendor_entity, work_sites, checklist |
| Tracker create/edit/end/extend/reopen/onboard, WorkerEdit/View | GF only |
| JobForm, JobTemplateForm | Mixed: known product schema **plus** GF |
| BudgetCalculator2, CustomFieldsBulkUpdate, ChecklistForm preview, GenericFieldPreview | GF |
| CustomizationDetail | CDS table schema from API |
| ChargeCodeFields | CDS charge-code table schema |
| Survey | API `survey_form` |
| AdditionalDetails (end WO) | connector JSON form from API |

### Known-shape product forms (inline JS/TS)

| Screen | Mix | Notes |
|---|---|---|
| **ScheduleMeetingModal** | date, time, phone, textarea, text, segmentedControl, layout, 1 timezone select; ~11 terse rules; Office365 extraAction | **Spike** |
| AddExpenseReportModal | Almost all async select + buPicker | Rejected — adapter test |
| EditExpenseReportModal | Title + user multi-select | Tiny + select-heavy |
| AddVendorModal | Stepper; layout; booleans/radios/text; 1 async program-team select; rules | Strong runner-up |
| VendorRejectWorkOrder | Async CDS select and/or textarea | Tiny |
| IntegrationSettings | Booleans + layout | Tiny |
| HiredscoreConnection / Coupa ConnectionConfiguration | Strings + password | Tiny |
| ChargeCodeFieldsWrappers | Text + layout fragments | Not a screen |

### Known-shape YAML settings (`app/settings/modules/`, ~60 schemas)

Hosted by `Settings.jsx` / `SingleKVComponentSettingsPage` / dedicated cards. Shape cannot change without a deploy.

Notable: **BudgetSettings** (nested groups, currency vs %, many `$rules`, custom `InputToggle`, no `isChakra`). Mixpanel (2 booleans). Workday / Coupa / Ultipro (connector YAML — adapter zoo, skip). SOW payment/approval/change-order/role-form (small + `FlexGridObjectTemplate`).

### Known-shape tables (`JSONSchemaTableForm`)

WorkTypes, WorkTypeProfiles, PremiumRates — array-of-objects, local enums/toggles/numbers. CustomizationDetail is the unknown-shape cousin.

### Known-shape bulk-update JSON (`app/bulk_updates/form_schema/`, 28 files)

Host: `DefaultBulkUpdateActionForm`. Mix varies: many are select-only. **`wo_end.json`** is the interesting one (date, time, layout, `end_now` rules, CDS reason select). `WorkOrderSelectFieldBulkUpdate` subsets a committed schema at runtime — mixed. `CustomFieldsBulkUpdate` is unknown-shape.

---

## Spike decision

Issue #159 already flagged:

- `AddExpenseReportModal` — select/API-heavy (tests VNDLY `JSFSelect`, not FormFrame).
- `JobTemplateForm` — mixed with generic fields.

**Named target: `ScheduleMeetingModal`.**

Why it tests FormFrame:

- Known-shape, no generic fields.
- Widget mix is date / time / phone / textarea / segmentedControl / layout — not “only async selects” (timezone `JSFSelect` is one field).
- Real conditionals (`type` shows/hides address, phone, video; cancel vs schedule; require). In FormFrame that is intercept / JSX, not `$rules`.
- `ui:field: layout` + `ui:layout` is exactly the serialize-when-you-must smell ADR 007 wants replaced with JSX.
- Medium modal; two real entry points (`ScheduleMeetingInterviewEventModal`, `ScheduleMeetingJobApplicationModal`).

What #160 should stub / not chase: Office365 `extraAction`, timezone API, `ui:displayAsText`, Chakra theme chrome. File those as VNDLY-adapter or don’t-migrate-yet.

Runners-up if the modal is awkward to mount: BudgetSettings (structure + `$rules`, one custom widget), WorkTypes (arrays), AddVendorModal (stepper + layout), `wo_end.json` (date/time + one CDS select).
