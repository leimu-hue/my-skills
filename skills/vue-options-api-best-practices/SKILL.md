---
name: vue-options-api-best-practices
description: "Vue 2/3 Options API patterns, TypeScript integration, and common gotchas for `data`, `props`, `computed`, `watch`, `methods`, lifecycle hooks, `emits`, `refs`, and `provide/inject`. Use this skill whenever the agent creates or edits Vue-related files such as `.vue` components or Vue JS/TS modules and the code uses, preserves, or may need the Options API style. Be proactive about checking `this` binding, prop defaults, watcher/computed syntax, and Options API TypeScript limitations. Each reference shows Options API solutions only."
license: MIT
---

Vue.js Options API best practices, TypeScript integration, and common gotchas.

### Data & Props
- Component state in `data` is written with the wrong function form or shared across instances → See [data-must-be-a-function](reference/data-must-be-a-function.md)
- Object or array prop defaults are sharing state between component instances → See [props-object-array-default-factory](reference/props-object-array-default-factory.md)
- Need to type object or array props with interfaces → See [ts-options-api-proptype-complex-types](reference/ts-options-api-proptype-complex-types.md)

### Computed & Watch
- Computed properties lose access to component instance state because of arrow functions → See [no-arrow-functions-in-computed](reference/no-arrow-functions-in-computed.md)
- Watchers lose `this` context or need correct handler syntax → See [no-arrow-functions-in-watch](reference/no-arrow-functions-in-watch.md)
- Complex computed properties lack clear type documentation → See [ts-options-api-computed-return-types](reference/ts-options-api-computed-return-types.md)

### TypeScript
- Need to enable TypeScript type inference for component properties → See [ts-options-api-use-definecomponent](reference/ts-options-api-use-definecomponent.md)
- Enabling type safety for Options API this context → See [ts-strict-mode-options-api](reference/ts-strict-mode-options-api.md)
- Using old TypeScript versions with prop validators → See [ts-options-api-arrow-functions-validators](reference/ts-options-api-arrow-functions-validators.md)
- Event handler parameters need proper type safety → See [ts-options-api-type-event-handlers](reference/ts-options-api-type-event-handlers.md)
- Injected properties missing TypeScript types completely → See [ts-options-api-provide-inject-limitations](reference/ts-options-api-provide-inject-limitations.md)
- Template refs are missing or weakly typed in Options API TypeScript code → See [ts-options-api-typed-refs](reference/ts-options-api-typed-refs.md)
- Custom events need payload typing and runtime validation in Options API → See [ts-options-api-emits-typing](reference/ts-options-api-emits-typing.md)
- Mixins or extends make Options API types hard to reason about → See [ts-options-api-mixins-limitations](reference/ts-options-api-mixins-limitations.md)

### Methods & Lifecycle
- Methods aren't binding to component instance context → See [no-arrow-functions-in-methods](reference/no-arrow-functions-in-methods.md)
- Lifecycle hooks losing access to component data → See [no-arrow-functions-in-lifecycle-hooks](reference/no-arrow-functions-in-lifecycle-hooks.md)
- Debounced functions sharing state across component instances → See [stateful-methods-lifecycle](reference/stateful-methods-lifecycle.md)

### Emits, Refs & Provide/Inject
- Need a reminder that Options API `provide/inject` has reactivity caveats → See [provide-inject-reactivity-limitations](reference/provide-inject-reactivity-limitations.md)
