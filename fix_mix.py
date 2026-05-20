import sys

with open('src/composables/video_match/useVideoMatchMixCompose.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('export function useVideoMatchMixCompose(\n  composing: any,\n', 'export function useVideoMatchMixCompose(')
text = text.replace('export function useVideoMatchMixCompose(\\n  composing: any,\\n', 'export function useVideoMatchMixCompose(\n  composing: any,\n')

with open('src/composables/video_match/useVideoMatchMixCompose.ts', 'w', encoding='utf-8') as f:
    f.write(text)
