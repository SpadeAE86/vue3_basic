import { BrowserWindow, app, ipcMain, dialog } from "electron"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"
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
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
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

// =========================
// Local folder & file utilities
// =========================

ipcMain.handle("localImport:selectFiles", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Media Files", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "mp4", "webm", "ogg"] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return { type: "files", paths: result.filePaths }
})

ipcMain.handle("localImport:selectFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"]
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const dirPath = result.filePaths[0]
  const folderName = path.basename(dirPath) || dirPath
  return { type: "folder", path: dirPath, name: folderName }
})

ipcMain.handle("localFolder:read", async (_evt, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const folders = []
    const files = []
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        let cover_url = "";
        try {
          // Scan first level of subfolder for a media cover file
          const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isFile()) {
              const subExt = path.extname(sub.name).toLowerCase();
              const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(subExt);
              const isVideo = [".mp4", ".webm", ".ogg"].includes(subExt);
              if (isImage || isVideo) {
                 const subFullPath = path.join(fullPath, sub.name);
                 cover_url = pathToFileURL(subFullPath).href;
                 break;
               }
            }
          }
        } catch (subErr) {
          console.warn("Failed to read subfolder cover:", subErr);
        }

        folders.push({
          id: `local-folder-${fullPath}`,
          item_type: "folder",
          title: entry.name,
          path: fullPath,
          cover_url: cover_url || undefined
        })
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)
        const isVideo = [".mp4", ".webm", ".ogg"].includes(ext)
        if (isImage || isVideo) {
          const stat = await fs.stat(fullPath)
          const fileUrl = pathToFileURL(fullPath).href
          files.push({
            id: `local-file-${fullPath}`,
            item_type: "media",
            title: entry.name,
            cover_url: fileUrl,
            created_at: stat.birthtime || stat.mtime,
            updated_at: stat.mtime,
            path: fullPath,
            data: {
              url: fileUrl,
              media_type: isVideo ? "video" : "image",
              model: "local",
              prompt: "",
              local_path: fullPath
            }
          })
        }
      }
    }
    
    // Sort folders alphabetically, files by modified time desc
    folders.sort((a, b) => a.title.localeCompare(b, "zh-CN"))
    files.sort((a, b) => b.updated_at - a.updated_at)
    
    return { folders, files }
  } catch (err) {
    console.error("Read local folder failed:", err)
    throw err
  }
})

ipcMain.handle("localFile:readBytes", async (_evt, filePath) => {
  try {
    const data = await fs.readFile(filePath)
    return data
  } catch (err) {
    console.error("Read file bytes failed:", err)
    throw err
  }
})

ipcMain.handle("localFolder:create", async (_evt, { parentPath, name }) => {
  try {
    const cleanName = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim()
    const fullPath = path.join(parentPath, cleanName)
    await fs.mkdir(fullPath, { recursive: true })
    return { ok: true, path: fullPath }
  } catch (err) {
    console.error("Create local folder failed:", err)
    throw err
  }
})

ipcMain.handle("localFile:move", async (_evt, { srcPath, destDir }) => {
  try {
    const filename = path.basename(srcPath)
    const destPath = path.join(destDir, filename)
    await fs.rename(srcPath, destPath)
    return { ok: true, destPath }
  } catch (err) {
    console.error("Move local file failed:", err)
    throw err
  }
})

ipcMain.handle("localFolder:copy", async (_evt, { srcPath, destPath }) => {
  try {
    let dest = destPath
    if (!dest) {
      const dirName = path.dirname(srcPath)
      const baseName = path.basename(srcPath)
      dest = path.join(dirName, `${baseName}_copy`)
    }
    await fs.cp(srcPath, dest, { recursive: true })
    return { ok: true, destPath: dest }
  } catch (err) {
    console.error("Copy local folder failed:", err)
    throw err
  }
})

ipcMain.handle("localFolder:delete", async (_evt, { dirPath }) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    console.error("Delete local folder failed:", err)
    throw err
  }
})

ipcMain.handle("localFolder:rename", async (_evt, { srcPath, destPath }) => {
  try {
    await fs.rename(srcPath, destPath)
    return { ok: true }
  } catch (err) {
    console.error("Rename local folder failed:", err)
    throw err
  }
})

ipcMain.handle("localFile:delete", async (_evt, { filePath }) => {
  try {
    // Delete main file
    await fs.unlink(filePath)
    
    // Check and delete corresponding .txt file
    const parsed = path.parse(filePath)
    const txtPath = path.join(parsed.dir, `${parsed.name}.txt`)
    try {
      await fs.unlink(txtPath)
    } catch {}
    
    return { ok: true }
  } catch (err) {
    console.error("Delete local file failed:", err)
    throw err
  }
})

ipcMain.handle("localFile:copy", async (_evt, { srcPath, destDir, destPath }) => {
  try {
    let targetPath = destPath
    if (!targetPath && destDir) {
      const filename = path.basename(srcPath)
      targetPath = path.join(destDir, filename)
      if (targetPath === srcPath) {
        const parsed = path.parse(srcPath)
        targetPath = path.join(parsed.dir, `${parsed.name}_copy${parsed.ext}`)
      }
    }
    await fs.cp(srcPath, targetPath)
    
    // Copy corresponding .txt file if exists
    const srcParsed = path.parse(srcPath)
    const txtSrcPath = path.join(srcParsed.dir, `${srcParsed.name}.txt`)
    
    const destParsed = path.parse(targetPath)
    const txtDestPath = path.join(destParsed.dir, `${destParsed.name}.txt`)
    try {
      await fs.cp(txtSrcPath, txtDestPath)
    } catch {}
    
    return { ok: true, destPath: targetPath }
  } catch (err) {
    console.error("Copy local file failed:", err)
    throw err
  }
})

ipcMain.handle("localFolder:copyContents", async (_evt, { srcPath, destPath }) => {
  try {
    const entries = await fs.readdir(srcPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const fileSrc = path.join(srcPath, entry.name)
        const fileDest = path.join(destPath, entry.name)
        await fs.cp(fileSrc, fileDest)
      }
    }
    return { ok: true }
  } catch (err) {
    console.error("Copy folder contents failed:", err)
    throw err
  }
})

// Touch to reload: 2026-07-08 01:20
