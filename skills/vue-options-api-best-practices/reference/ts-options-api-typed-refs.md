---
title: Type Template Refs Explicitly in Options API TypeScript
impact: MEDIUM
impactDescription: `$refs` are weakly typed by default, so DOM methods and child component instance access need explicit typing to stay safe
type: best-practice
tags: [vue3, vue2, typescript, options-api, refs, template-refs]
---

# Type Template Refs Explicitly in Options API TypeScript

**Impact: MEDIUM** - In Options API components, `$refs` usually default to broad or unknown-like types. Without explicit typing, DOM access and child component instance usage become unsafe and IDE support gets weak.

## Task Checklist

- [ ] Treat `$refs` as explicitly typed escape hatches
- [ ] Cast DOM refs to the correct element type before use
- [ ] Use `InstanceType<typeof ChildComponent>` for child component refs when possible
- [ ] Guard refs in lifecycle hooks because refs may be absent under conditional rendering

## DOM Ref Example

```vue
<template>
  <input ref="searchInput" />
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  mounted() {
    const input = this.$refs.searchInput as HTMLInputElement | undefined
    input?.focus()
  }
})
</script>
```

## Child Component Ref Example

```vue
<template>
  <UserDialog ref="userDialog" />
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import UserDialog from './UserDialog.vue'

type UserDialogInstance = InstanceType<typeof UserDialog>

export default defineComponent({
  components: { UserDialog },
  methods: {
    openDialog() {
      const dialog = this.$refs.userDialog as UserDialogInstance | undefined
      dialog?.open()
    }
  }
})
</script>
```

## Global Augmentation Pattern

```typescript
import 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    $refs: {
      searchInput?: HTMLInputElement
    }
  }
}

export {}
```

Use this carefully because it affects all components unless you keep the declared shape broad enough.

## Reference

- [Vue.js Template Refs](https://vuejs.org/guide/essentials/template-refs.html)
- [Vue.js TypeScript with Options API](https://vuejs.org/guide/typescript/options-api.html)
