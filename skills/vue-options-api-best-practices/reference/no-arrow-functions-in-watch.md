---
title: Never Use Arrow Functions for Options API Watchers
impact: HIGH
impactDescription: Arrow functions in watcher handlers break access to the component instance and often hide the correct watcher object syntax
type: capability
tags: [vue3, vue2, options-api, watch, watchers, arrow-functions, this-binding]
---

# Never Use Arrow Functions for Options API Watchers

**Impact: HIGH** - Options API watchers often need `this` for side effects, follow-up method calls, and instance state access. Arrow functions prevent Vue from binding `this` to the component instance.

## Task Checklist

- [ ] Use method shorthand or regular functions for watcher handlers
- [ ] Use object syntax when you need `immediate` or `deep`
- [ ] Use string handlers only when they clearly point to a method name
- [ ] Do not use arrow functions for watcher handlers that access instance state

## Incorrect

```javascript
export default {
  data() {
    return {
      searchTerm: '',
      filters: { active: true }
    }
  },
  watch: {
    searchTerm: (newValue) => {
      this.fetchResults(newValue)
    },
    filters: {
      deep: true,
      handler: (value) => {
        this.persistFilters(value)
      }
    }
  }
}
```

## Correct

```javascript
export default {
  data() {
    return {
      searchTerm: '',
      filters: { active: true }
    }
  },
  watch: {
    searchTerm(newValue, oldValue) {
      if (newValue !== oldValue) {
        this.fetchResults(newValue)
      }
    },
    filters: {
      deep: true,
      handler(value) {
        this.persistFilters(value)
      }
    }
  },
  methods: {
    fetchResults(query) {
      // ...
    },
    persistFilters(filters) {
      // ...
    }
  }
}
```

## String Handler Form

```javascript
export default {
  watch: {
    searchTerm: 'fetchResults'
  },
  methods: {
    fetchResults(value) {
      // ...
    }
  }
}
```

## When to Use Object Syntax

```javascript
export default {
  watch: {
    routeId: {
      immediate: true,
      handler(id) {
        this.loadRecord(id)
      }
    },
    settings: {
      deep: true,
      handler() {
        this.saveSettings()
      }
    }
  }
}
```

## Reference

- [Vue.js Watchers](https://vuejs.org/guide/essentials/watchers.html)
- [Vue.js Options: watch](https://vuejs.org/api/options-state.html#watch)
