import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended, // 👇 在最后追加你自己的自定义规则对象
  {
    name: 'app/custom-rules',
      rules: {
    // 关闭禁止显式使用 any 的规则
    '@typescript-eslint/no-explicit-any': 'off',
      // 如果你发现局部还有关于 any 的弱警告，可以顺便把这个也关了（可选）
      '@typescript-eslint/no-unsafe-assignment': 'off'
  }
}
)
