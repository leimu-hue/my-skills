---
title: Never Use Arrow Functions for Options API Computed Properties
impact: HIGH
impactDescription: Arrow functions prevent Vue from binding `this` to the component instance, breaking computed access to props, data, and other computed properties
type: capability
tags: [vue3, vue2, options-api, computed, arrow-functions, this-binding]
---

# Never Use Arrow Functions for Options API Computed Properties

**Impact: HIGH** - Options API computed properties rely on Vue binding `this` to the component instance. Arrow functions capture lexical `this` instead, so `this` becomes `undefined` or the wrong object.

## Task Checklist

- [ ] Always use method shorthand or regular functions for computed getters
- [ ] Never use arrow functions for computed getters or setters that read `this`
- [ ] Arrow functions are fine inside a computed body as nested callbacks

## Incorrect

```javascript
export default {
  data() {
    return {
      firstName: 'Ada',
      lastName: 'Lovelace'
    }
  },
  computed: {
    fullName: () => `${this.firstName} ${this.lastName}`,
    displayName: {
      get: () => this.fullName.toUpperCase(),
      set(value) {
        this.firstName = value
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
      firstName: 'Ada',
      lastName: 'Lovelace'
    }
  },
  computed: {
    fullName() {
      return `${this.firstName} ${this.lastName}`
    },
    displayName: {
      get() {
        return this.fullName.toUpperCase()
      },
      set(value) {
        const parts = value.split(' ')
        this.firstName = parts[0] || ''
        this.lastName = parts.slice(1).join(' ') || ''
      }
    }
  }
}
```

## Nested Arrow Functions Are Fine

```javascript
export default {
  data() {
    return {
      items: [1, 2, 3]
    }
  },
  computed: {
    doubledItems() {
      return this.items.map(item => item * 2)
    }
  }
}
```

## Reference

- [Vue.js Computed Properties](https://vuejs.org/guide/essentials/computed.html)
- [Vue.js TypeScript with Options API - Typing Computed Properties](https://vuejs.org/guide/typescript/options-api.html#typing-computed-properties)
