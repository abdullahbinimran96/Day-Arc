// Bundled Sounds Auto-Loader
// Scans resources/Sounds directory on startup and automatically registers default sound entries

const fs = require('fs');
const path = require('path');

class BundledSoundsManager {
  constructor() {
    let resDir = path.join(__dirname, '..', '..', 'resources');
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.isPackaged) {
        const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources');
        const rootRes = path.join(process.resourcesPath, 'resources');
        if (fs.existsSync(unpacked)) resDir = unpacked;
        else if (fs.existsSync(rootRes)) resDir = rootRes;
      }
    } catch (e) {}
    this.resourcesDir = resDir;
  }

  scanAndRegister(dbManager) {
    if (!fs.existsSync(this.resourcesDir)) return;

    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const discoveredFiles = [];

    // Helper recursive search
    const scanDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (audioExtensions.includes(ext)) {
              discoveredFiles.push({
                name: entry.name,
                fullPath: fullPath,
                ext: ext
              });
            }
          }
        }
      } catch (err) {
        console.error('Error scanning directory for bundled sounds:', err);
      }
    };

    scanDir(this.resourcesDir);

    if (discoveredFiles.length === 0) return;

    const existingSounds = dbManager.getSounds();

    discoveredFiles.forEach((file, index) => {
      const baseName = path.basename(file.name, file.ext);
      // Format Title: e.g. "azaan voice" -> "Azaan Voice"
      const formattedTitle = baseName
        .split(/[-_ ]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      const soundId = `bundled-${baseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const isAlreadyRegistered = existingSounds.some(s => s.id === soundId);

      if (!isAlreadyRegistered) {
        try {
          const fileBuffer = fs.readFileSync(file.fullPath);
          const mimeType = file.ext === '.mp3' ? 'audio/mpeg' : (file.ext === '.wav' ? 'audio/wav' : 'audio/ogg');
          const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

          console.log(`[BundledSounds] Registering new bundled sound: ${formattedTitle} (${soundId})`);
          dbManager.saveSound({
            id: soundId,
            name: formattedTitle,
            duration: '04:30',
            audio_data: dataUrl,
            is_builtin: 1,
            used_in: ['Namaz', 'Tasks']
          });
        } catch (err) {
          console.error(`Error loading bundled audio file ${file.name}:`, err);
        }
      }

      // Set as default azaan sound if not explicitly configured
      const currentAzaanSound = dbManager.getSetting('azaan_sound_id');
      if (!currentAzaanSound || currentAzaanSound === 'sound-azaan-makkah') {
        dbManager.setSetting('azaan_sound_id', soundId);
      }
    });
  }
}

module.exports = new BundledSoundsManager();
