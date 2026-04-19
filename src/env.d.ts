/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    api?: {
      send: (channel: string, data?: any) => void
      on: (channel: string, callback: (...args: any[]) => void) => void
      invoke: (channel: string, data?: any) => Promise<any>
      promptTemplates?: {
        list: () => Promise<Array<{ name: string; has_content: boolean }>>
        read: (name: string) => Promise<{ name: string; content: string }>
        write: (payload: { name: string; content: string }) => Promise<{ ok: boolean; name: string }>
        delete: (name: string) => Promise<{ ok: boolean; name: string }>
      }
    }
  }
}

