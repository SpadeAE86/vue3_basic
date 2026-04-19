import { BrowserWindow, app, ipcMain } from "electron"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs/promises"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sanitizeFileStem(name) {
  // Windows forbidden: <>:"/\|?* and control chars; also avoid trailing dots/spaces
  const cleaned = String(name)
     
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
  return cleaned || "untitled"
}

function templatesDir() {
  return path.join(app.getPath("userData"), "prompt-templates")
}

async function ensureTemplatesDir() {
  await fs.mkdir(templatesDir(), { recursive: true })
}

function templateFilePath(templateName) {
  const stem = sanitizeFileStem(templateName)
  return path.join(templatesDir(), `${stem}.md`)
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle("ping", () => "pong")

// =========================
// Prompt template (md files)
// =========================

ipcMain.handle("promptTemplates:list", async () => {
  await ensureTemplatesDir()
  const entries = await fs.readdir(templatesDir(), { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))

  return files.map((file) => ({
    name: file.replace(/\.md$/i, ""),
    has_content: true,
  }))
})

ipcMain.handle("promptTemplates:read", async (_evt, templateName) => {
  await ensureTemplatesDir()
  const filePath = templateFilePath(templateName)
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return { name: sanitizeFileStem(templateName), content }
  } catch {
    return { name: sanitizeFileStem(templateName), content: "" }
  }
})

ipcMain.handle("promptTemplates:write", async (_evt, payload) => {
  await ensureTemplatesDir()
  const name = sanitizeFileStem(payload?.name ?? "")
  const content = String(payload?.content ?? "")
  const filePath = templateFilePath(name)
  await fs.writeFile(filePath, content, "utf-8")
  return { ok: true, name }
})

ipcMain.handle("promptTemplates:delete", async (_evt, templateName) => {
  await ensureTemplatesDir()
  const name = sanitizeFileStem(templateName)
  const filePath = templateFilePath(name)
  try {
    await fs.unlink(filePath)
  } catch {}
  return { ok: true, name }
})
