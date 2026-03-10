---
title: Understand Provide/Inject Reactivity Limits in Options API
impact: MEDIUM
impactDescription: Provide/inject passes references down the tree, but the pattern is not a substitute for explicit state management and can be misleading when values are non-reactive or mutated indirectly
type: gotcha
tags: [vue3, vue2, options-api, provide-inject, reactivity, state-management]
---

# Understand Provide/Inject Reactivity Limits in Options API

**Impact: MEDIUM** - `provide/inject` is useful for dependency sharing, but it is easy to overestimate how reactive or maintainable it is. Primitive snapshots, ad-hoc mutations, and hidden cross-component coupling can make state flow hard to reason about.

## Task Checklist

- [ ] Use `provide/inject` for dependencies or shared services, not as a default global-state replacement
- [ ] Provide reactive objects intentionally, not accidental primitive snapshots
- [ ] Prefer exposing methods for mutation instead of deep child mutation
- [ ] Document injected dependencies clearly

## Primitive Snapshot Pitfall

```javascript
export default {
  data() {
    return {
      theme: 'dark'
    }
  },
  provide() {
    return {
      theme: this.theme
    }
  }
}
```

If `theme` later changes, do not treat the injected primitive as a clear, reactive state-management channel.

## Better: Provide a Reactive Object or Controlled API

```javascript
export default {
  data() {
    return {
      themeState: {
        current: 'dark'
      }
    }
  },
  provide() {
    return {
      themeState: this.themeState,
      setTheme: this.setTheme
    }
  },
  methods: {
    setTheme(value) {
      this.themeState.current = value
    }
  }
}
```

## Consumer Example

```javascript
export default {
  inject: ['themeState', 'setTheme'],
  computed: {
    currentTheme() {
      return this.themeState.current
    }
  },
  methods: {
    toggleTheme() {
      this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark')
    }
  }
}
```

## Prefer Clearer Alternatives When State Gets Complex

- For tightly shared app state, prefer Pinia or another explicit store
- For parent-child coordination, props and emits are usually easier to follow
- For plugin-like dependencies, provide/inject is a strong fit

## Reference

- [Vue.js Provide / Inject](https://vuejs.org/guide/components/provide-inject.html)
- [Vue.js State Management](https://vuejs.org/guide/scaling-up/state-management.html)
