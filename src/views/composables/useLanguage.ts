import { ref } from 'vue'

const showChinese = ref(true)

// 全局挂载 'z' 快捷键监听
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    // 防干扰保护：如果正在输入框、文本域或富文本编辑器中打字，则不要触发快捷键
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return
    }
    
    if (e.key && e.key.toLowerCase() === 'z') {
      showChinese.value = !showChinese.value
    }
  })
}

export function useLanguage() {
  function toggleLanguage() {
    showChinese.value = !showChinese.value
  }
  
  return {
    showChinese,
    toggleLanguage
  }
}
