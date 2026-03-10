---
title: Always Define Component Data as a Function
impact: HIGH
impactDescription: Non-function data creates shared state across component instances, and arrow functions can break access to props or the component instance
type: best-practice
tags: [vue3, vue2, options-api, data, shared-state, this-binding]
---

# Always Define Component Data as a Function

**Impact: HIGH** - In the Options API, component `data` must be a function that returns a fresh object for each instance. If you reuse a plain object, instances share mutable state. If you use an arrow function when you need access to the component instance, `this` and related instance-aware initialization become unreliable.

## Task Checklist

- [ ] Always write component `data` as a function returning a new object
- [ ] Never reuse a top-level mutable object for component state
- [ ] Avoid arrow functions for `data` when you need instance-aware logic
- [ ] Keep props-derived initialization in `data()` or computed properties

## Incorrect: Shared State

```javascript
const sharedState = {
  count: 0,
  items: []
}

export default {
  data() {
    return sharedState
  }
}
```

If multiple instances render, mutating `count` or `items` in one instance affects the others.

## Correct Pattern

```javascript
export default {
  data() {
    return {
      count: 0,
      items: []
    }
  }
}
```

Each instance gets a fresh state object.

## Avoid Arrow Functions When You Need Props or Instance State

**Risky / incorrect:**
```javascript
export default {
  props: {
    initialCount: Number
  },
  data: () => ({
    count: this.initialCount || 0
  })
}
```

`this` here is not the component instance.

**Preferred:**
```javascript
export default {
  props: {
    initialCount: {
      type: Number,
      default: 0
    }
  },
  data() {
    return {
      count: this.initialCount
    }
  }
}
```

## When to Use Computed Instead

If the value should stay synced with props, prefer computed properties instead of copying into local state:

```javascript
export default {
  props: {
    user: {
      type: Object,
      required: true
    }
  },
  computed: {
    displayName() {
      return this.user.name.trim()
    }
  }
}
```

## Reference

- [Vue.js Options: data](https://vuejs.org/api/options-state.html#data)
- [Vue.js Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
