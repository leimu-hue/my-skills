---
title: Declare and Type Emits in Options API Components
impact: MEDIUM
impactDescription: Undeclared events and untyped payloads make parent-child contracts unclear and weaken TypeScript validation
type: best-practice
tags: [vue3, typescript, options-api, emits, events, component-contracts]
---

# Declare and Type Emits in Options API Components

**Impact: MEDIUM** - In Options API components, `emits` makes component events explicit and lets Vue validate event names. With TypeScript-friendly payload typing in methods, the parent-child contract becomes easier to maintain.

## Task Checklist

- [ ] Declare emitted event names in the `emits` option
- [ ] Use object syntax when runtime payload validation is useful
- [ ] Type the payload at the call site before passing it to `$emit`
- [ ] Keep event names aligned with documented parent listeners

## Basic Emits Declaration

```typescript
import { defineComponent } from 'vue'

export default defineComponent({
  emits: ['save', 'cancel'],
  methods: {
    saveForm(payload: { id: number; name: string }) {
      this.$emit('save', payload)
    },
    cancelForm() {
      this.$emit('cancel')
    }
  }
})
```

## With Runtime Validation

```typescript
import { defineComponent } from 'vue'

interface SavePayload {
  id: number
  name: string
}

export default defineComponent({
  emits: {
    save(payload: SavePayload) {
      return typeof payload.id === 'number' && typeof payload.name === 'string'
    },
    cancel: null
  },
  data() {
    return {
      formName: ''
    }
  },
  methods: {
    submit() {
      const payload: SavePayload = {
        id: 1,
        name: this.formName
      }
      this.$emit('save', payload)
    }
  }
})
```

## Common Mistake

```typescript
export default defineComponent({
  methods: {
    submit() {
      this.$emit('succes', this.formData)
    }
  }
})
```

Without `emits`, event name typos like `succes` are easier to miss.

## Reference

- [Vue.js Component Events](https://vuejs.org/guide/components/events.html)
- [Vue.js TypeScript Overview](https://vuejs.org/guide/typescript/overview.html)
