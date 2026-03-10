---
title: Be Careful with Mixins and Extends in Options API TypeScript
impact: MEDIUM
impactDescription: Mixins and extends can technically work, but they often make type inference, naming conflicts, and code navigation harder to maintain
type: gotcha
tags: [vue3, vue2, typescript, options-api, mixins, extends, reuse]
---

# Be Careful with Mixins and Extends in Options API TypeScript

**Impact: MEDIUM** - Mixins and `extends` are common in older Options API codebases, but they make component behavior harder to trace and can weaken type clarity. Reused properties come from multiple sources, collisions are easy to introduce, and TypeScript inference is less ergonomic than with composables.

## Task Checklist

- [ ] Prefer explicit composition patterns when possible
- [ ] If using mixins, keep them small and narrowly scoped
- [ ] Watch for name collisions across `data`, computed properties, and methods
- [ ] Document inherited members that are not obvious in the local component file

## The Problem

```typescript
import { defineComponent } from 'vue'
import paginationMixin from './paginationMixin'
import loadingMixin from './loadingMixin'

export default defineComponent({
  mixins: [paginationMixin, loadingMixin],
  methods: {
    refresh() {
      this.loadPage(this.currentPage)
      this.setLoading(true)
    }
  }
})
```

This works, but `currentPage`, `loadPage`, and `setLoading` are defined somewhere else. That makes review, refactoring, and typing harder.

## Safer Practices for Legacy Code

```typescript
import { defineComponent } from 'vue'
import paginationMixin from './paginationMixin'

export default defineComponent({
  mixins: [paginationMixin],
  methods: {
    refreshCurrentPage() {
      this.loadPage(this.currentPage)
    }
  }
})
```

If a legacy project already uses mixins, keep each mixin focused and reduce overlap.

## Migration Guidance

- For new reusable logic, prefer composables in Composition API
- For existing Options API code, extract clearer helper modules or services when full migration is not practical
- Avoid introducing new large cross-cutting mixins unless the codebase already depends on them heavily

## Reference

- [Vue.js Mixins](https://vuejs.org/api/options-composition.html#mixins)
- [Vue.js Composition API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html)
