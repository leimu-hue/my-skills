---
title: Use Factory Functions for Object and Array Prop Defaults
impact: HIGH
impactDescription: Non-factory defaults for object and array props share the same reference across all component instances
type: gotcha
tags: [vue3, vue2, options-api, props, defaults, shared-state]
---

# Use Factory Functions for Object and Array Prop Defaults

**Impact: HIGH** - In the Options API, object and array prop defaults must be returned from a factory function. If you use a plain object or array directly, all component instances share the same reference, which causes cross-instance bugs.

## Task Checklist

- [ ] Use `default: () => ({ ... })` for object props
- [ ] Use `default: () => []` for array props
- [ ] Keep factory functions pure and side-effect free
- [ ] Use `PropType<T>` when the prop also needs TypeScript typing

## Incorrect

```javascript
export default {
  props: {
    filters: {
      type: Object,
      default: {
        query: '',
        tags: []
      }
    },
    items: {
      type: Array,
      default: []
    }
  }
}
```

Both `filters` and `items` are shared references.

## Correct

```javascript
export default {
  props: {
    filters: {
      type: Object,
      default() {
        return {
          query: '',
          tags: []
        }
      }
    },
    items: {
      type: Array,
      default: () => []
    }
  }
}
```

Each instance gets a fresh default value.

## With TypeScript

```typescript
import { defineComponent, PropType } from 'vue'

interface Filters {
  query: string
  tags: string[]
}

export default defineComponent({
  props: {
    filters: {
      type: Object as PropType<Filters>,
      default: (): Filters => ({
        query: '',
        tags: []
      })
    }
  }
})
```

## Reference

- [Vue.js Props - Prop Validation](https://vuejs.org/guide/components/props.html#prop-validation)
- [Vue.js TypeScript with Options API](https://vuejs.org/guide/typescript/options-api.html)
