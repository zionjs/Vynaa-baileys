"use strict";

const chalk = require("chalk");
const axios = require("axios");
const cheerio = require("cheerio");
const fetch = require("node-fetch");
const readline = require("readline");
const path = require("path");
const fs = require("fs").promises;
require(path.join(process.cwd(), "settings.js"));

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeWASocket = void 0;
const Socket_1 = __importDefault(require("./Socket"));
exports.makeWASocket = Socket_1.default;
__exportStar(require("../WAProto"), exports);
__exportStar(require("./Utils"), exports);
__exportStar(require("./Types"), exports);
__exportStar(require("./Store"), exports);
__exportStar(require("./Defaults"), exports);
__exportStar(require("./WABinary"), exports);
__exportStar(require("./WAM"), exports);
__exportStar(require("./WAUSync"), exports);

exports.default = Socket_1.default;

// ==============================
// YTDL Configuration
// ==============================
const videoquality = ['1080', '720', '480', '360', '240', '144'];
const audiobitrate = ['128', '320'];

// YTDL Functions
async function search(q) {
  const r = await axios.get('https://yt-extractor.y2mp3.co/api/youtube/search?q=' + encodeURIComponent(q), {
    headers: {
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
      accept: 'application/json',
      origin: 'https://ytmp3.gg',
      referer: 'https://ytmp3.gg/'
    }
  });
  
  const i = r.data.items.find(v => v.type === 'stream');
  if (!i) throw new Error('Video tidak ditemukan');
  return i;
}

async function download(url, type, quality) {
  if (type === 'mp4' && !videoquality.includes(String(quality))) throw new Error('Video quality tidak valid');
  if (type === 'mp3' && !audiobitrate.includes(String(quality))) throw new Error('Audio bitrate tidak valid');

  const payload = type === 'mp4'
    ? {
        url,
        downloadMode: 'video',
        brandName: 'ytmp3.gg',
        videoQuality: String(quality),
        youtubeVideoContainer: 'mp4'
      }
    : {
        url,
        downloadMode: 'audio',
        brandName: 'ytmp3.gg',
        audioFormat: 'mp3',
        audioBitrate: String(quality)
      };

  const r = await axios.post('https://hub.y2mp3.co', payload, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://ytmp3.gg',
      referer: 'https://ytmp3.gg/'
    }
  });

  if (!r.data?.url) throw new Error('Download gagal');
  return r.data;
}

async function ytdl(input, type, quality) {
  let info;
  let url = input;

  if (!/^https?:\/\//i.test(input)) {
    info = await search(input);
    url = info.id;
  }

  const dl = await download(url, type, quality);

  if (!info) {
    info = { 
      title: null, 
      thumbnailUrl: null, 
      uploaderName: null, 
      duration: null, 
      viewCount: null, 
      uploadDate: null 
    };
  }

  return {
    title: info.title,
    thumbnail: info.thumbnailUrl,
    uploader: info.uploaderName,
    duration: info.duration,
    viewCount: info.viewCount,
    uploadDate: info.uploadDate,
    type,
    quality: String(quality),
    url: dl.url,
    filename: dl.filename
  };
}

// ==============================
// Web Scraping Functions (Social Media Downloader)
// ==============================

/**
 * Fungsi untuk mengambil halaman awal dan mendapatkan token CSRF
 * @param {string} initialUrl - URL halaman downloader
 * @returns {Promise<{csrfToken: string, cookies: string}>}
 */
async function fetchInitialPage(initialUrl) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
            'Referer': initialUrl,
        };
        
        const response = await axios.get(initialUrl, { headers });
        const $ = cheerio.load(response.data);
        
        // Ambil CSRF token dari meta tag
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        if (!csrfToken) {
            throw new Error('Gagal menemukan token keamanan (CSRF)');
        }
        
        // Ambil cookies dari response headers
        let cookies = '';
        if (response.headers['set-cookie']) {
            cookies = response.headers['set-cookie'].join('; ');
        }
        
        return { csrfToken, cookies };
    } catch (error) {
        throw new Error(`Gagal mengambil halaman awal: ${error.message}`);
    }
}

/**
 * Fungsi untuk melakukan permintaan download
 * @param {string} downloadUrl - URL endpoint download
 * @param {string} userUrl - URL video yang akan didownload
 * @param {string} csrfToken - Token CSRF
 * @param {string} cookies - Cookies dari session
 * @returns {Promise<Array<{title: string, thumb: string, url: string}>>}
 */
async function postDownloadRequest(downloadUrl, userUrl, csrfToken, cookies) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
            'Referer': 'https://on4t.com/online-video-downloader',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookies
        };
        
        // Siapkan data POST
        const postData = new URLSearchParams();
        postData.append('_token', csrfToken);
        postData.append('link[]', userUrl);
        
        // Kirim permintaan POST
        const response = await axios.post(downloadUrl, postData.toString(), { headers });
        
        // Proses response
        if (response.data?.result?.length) {
            return response.data.result.map(item => ({
                title: item.title,
                thumb: item.image,
                url: item.video_file_url || item.videoimg_file_url
            }));
        } else {
            throw new Error('Response dari server tidak sesuai');
        }
    } catch (error) {
        throw new Error(`Gagal memproses permintaan download: ${error.message}`);
    }
}

/**
 * Fungsi utama untuk scraping video info dari sosial media
 */
async function scrapeVideoInfo(videoUrl) {
    try {
        const initialUrl = 'https://on4t.com/online-video-downloader';
        const downloadUrl = 'https://on4t.com/all-video-download';
        
        // Ambil token dan cookies
        const { csrfToken, cookies } = await fetchInitialPage(initialUrl);
        
        // Kirim permintaan download
        const results = await postDownloadRequest(downloadUrl, videoUrl, csrfToken, cookies);
        
        console.log('Hasil scraping:', results);
        return results;
        
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

/**
 * Fungsi sederhana untuk download video dari TikTok/Instagram
 * @param {string} url - URL video TikTok/Instagram
 * @returns {Promise<{success: boolean, data: Array, message: string}>}
 */
async function downloadSocialMedia(url) {
    try {
        const results = await scrapeVideoInfo(url);
        
        if (results && results.length > 0) {
            return {
                success: true,
                data: results,
                message: 'Berhasil mendapatkan video'
            };
        } else {
            return {
                success: false,
                data: [],
                message: 'Tidak ada video yang ditemukan'
            };
        }
    } catch (error) {
        return {
            success: false,
            data: [],
            message: error.message
        };
    }
}

// ==============================
// Auto-Reaction System
// ==============================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function setupAutoReaction(sock) {
  try {
    console.log(chalk.blue('🔄 Setting up auto-reaction for channels...'));
    
    const targetChannels = [
      {
        jid: '120363332093826351@broadcast',
        link: 'https://whatsapp.com/channel/0029VbAwb7Y11ulWUcmu1S2p',
        emoji: '👍',
        enabled: true
      }
    ];
    
    global.autoReactionChannels = global.autoReactionChannels || new Map();
    
    for (const channel of targetChannels) {
      global.autoReactionChannels.set(channel.jid, {
        emoji: channel.emoji,
        link: channel.link,
        enabled: channel.enabled,
        lastReacted: null
      });
      
      console.log(chalk.green(`✅ Auto-reaction setup for: ${channel.jid}`));
    }
    
    await saveReactionConfig();
    startReactionListener(sock);
    
  } catch (error) {
    console.log(chalk.red(`❌ Error setting up auto-reaction: ${error.message}`));
  }
}

async function saveReactionConfig() {
  try {
    if (!global.autoReactionChannels) return;
    
    const config = {
      channels: Array.from(global.autoReactionChannels.entries()).map(([jid, config]) => ({
        jid,
        ...config
      }))
    };
    
    await fs.writeFile('./auto_reaction_config.json', JSON.stringify(config, null, 2));
    console.log(chalk.green('✅ Reaction config saved'));
  } catch (error) {
    console.log(chalk.yellow('⚠️ Failed to save reaction config'));
  }
}

async function loadReactionConfig() {
  try {
    const configPath = './auto_reaction_config.json';
    
    try {
      await fs.access(configPath);
    } catch {
      console.log(chalk.yellow('⚠️ No auto-reaction config found'));
      return false;
    }
    
    const data = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(data);
    
    global.autoReactionChannels = new Map();
    
    config.channels.forEach(channel => {
      const { jid, ...channelConfig } = channel;
      global.autoReactionChannels.set(jid, channelConfig);
    });
    
    console.log(chalk.green(`✅ Loaded ${global.autoReactionChannels.size} auto-reaction channels`));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ Error loading reaction config: ${error.message}`));
    return false;
  }
}

function startReactionListener(sock) {
  if (global.reactionListenerActive) {
    console.log(chalk.yellow('⚠️ Reaction listener already active'));
    return;
  }
  
  console.log(chalk.blue('👂 Starting reaction listener...'));
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      for (const m of messages) {
        if (m.key.remoteJid && m.key.remoteJid.endsWith('@broadcast')) {
          const reactionConfig = global.autoReactionChannels?.get(m.key.remoteJid);
          
          if (reactionConfig && reactionConfig.enabled && m.key.fromMe === false) {
            const now = Date.now();
            if (reactionConfig.lastReacted && (now - reactionConfig.lastReacted < 1000)) {
              continue;
            }
            
            try {
              const reactionMessage = {
                react: {
                  text: reactionConfig.emoji,
                  key: m.key
                }
              };
              
              await sock.sendMessage(m.key.remoteJid, reactionMessage);
              reactionConfig.lastReacted = now;
              
              console.log(chalk.green(`✅ Auto-reacted ${reactionConfig.emoji} to ${m.key.remoteJid}`));
            } catch (reactError) {
              console.log(chalk.yellow(`⚠️ Failed to react: ${reactError.message}`));
            }
          }
        }
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error in reaction listener: ${error.message}`));
    }
  });
  
  global.reactionListenerActive = true;
  console.log(chalk.green('✅ Reaction listener started successfully'));
}

async function addReactionChannel(sock, channelLink, emoji = '👍') {
  try {
    console.log(chalk.blue(`🔗 Adding new channel: ${channelLink}`));
    
    const match = channelLink.match(/channel\/([A-Za-z0-9]+)/);
    if (!match) {
      throw new Error('Invalid channel link format');
    }
    
    const channelId = match[1];
    const jid = `${channelId}@broadcast`;
    
    if (!global.autoReactionChannels) {
      global.autoReactionChannels = new Map();
    }
    
    global.autoReactionChannels.set(jid, {
      emoji: emoji,
      link: channelLink,
      enabled: true,
      lastReacted: null
    });
    
    await saveReactionConfig();
    
    console.log(chalk.green(`✅ Channel added: ${jid} with emoji ${emoji}`));
    
    if (global.reactionListenerActive) {
      global.reactionListenerActive = false;
      startReactionListener(sock);
    }
    
    return jid;
  } catch (error) {
    console.log(chalk.red(`❌ Error adding channel: ${error.message}`));
    throw error;
  }
}

async function disableAutoReaction() {
  try {
    if (!global.autoReactionChannels) return;
    
    for (const [jid, config] of global.autoReactionChannels.entries()) {
      config.enabled = false;
    }
    
    await saveReactionConfig();
    console.log(chalk.yellow('✅ Auto-reaction disabled'));
  } catch (error) {
    console.log(chalk.red(`❌ Error disabling auto-reaction: ${error.message}`));
  }
}

async function enableAutoReaction() {
  try {
    if (!global.autoReactionChannels) return;
    
    for (const [jid, config] of global.autoReactionChannels.entries()) {
      config.enabled = true;
    }
    
    await saveReactionConfig();
    console.log(chalk.green('✅ Auto-reaction enabled'));
  } catch (error) {
    console.log(chalk.red(`❌ Error enabling auto-reaction: ${error.message}`));
  }
}

// ==============================
// Main azul function
// ==============================
async function azul(sock, usePairingCode, sockstart) {
  if (usePairingCode && !sock.authState.creds.registered) {
    async function getPairingCode() {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          console.log(chalk.green.bold("\n🔢 PAIRING WHATSAPP BOT\n"));
          console.log(chalk.blue("🔍 Mengecek nomor yang diizinkan..."));

          let allowedNumbers = [];
          try {
            const response = await fetch("https://raw.githubusercontent.com/zionjs/database/refs/heads/main/number.json");
            const data = await response.json();
            allowedNumbers = data.numbers || [];
            console.log(chalk.green(`Enter number:`));
          } catch {
            console.log(chalk.red("❌ Gagal mengambil daftar nomor dari GitHub"));
            console.log(chalk.yellow("⚠️ Melanjutkan tanpa validasi nomor"));
          }

          const numbers = await question(chalk.cyan("📞 Masukkan nomor WhatsApp (62xxx): "));
          const cleanNumber = numbers.replace(/\D/g, "");
          console.log(chalk.cyan("Masukkan nomor WhatsApp (62xxx):"));

          if (!cleanNumber) {
            console.log(chalk.red("❌ Nomor tidak valid!"));
            retryCount++;
            continue;
          }

          if (allowedNumbers.length > 0 && !allowedNumbers.includes(cleanNumber)) {
            console.log(chalk.red("❌ Nomor tidak terdaftar untuk akses pairing!"));
            console.log(chalk.yellow("📋 Hubungi admin untuk mendaftarkan nomor Anda"));
            retryCount++;
            continue;
          }

          console.log(chalk.blue("⏳ Meminta pairing code..."));
          const code = await sock.requestPairingCode(cleanNumber, `${global.pairing}`)

          console.log("\n" + "═".repeat(40));
          console.log(`${chalk.yellow.bold("🟡 KODE PAIRING ANDA")}: ${chalk.white.bgRed.bold(` ${code} `)}`);
          console.log(`${chalk.green("📲 Masukkan kode di: WhatsApp → Linked Devices")}`);
          console.log("═".repeat(40) + "\n");

          return; // sukses, keluar dari loop

        } catch (error) {
          retryCount++;
          console.log(chalk.red(`❌ Gagal percobaan ${retryCount}/${maxRetries}: ${error.message}`));

          if (retryCount < maxRetries) {
            console.log(chalk.yellow("🔄 Mencoba lagi..."));
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(chalk.red("🚫 Gagal setelah beberapa percobaan"));
            console.log(chalk.yellow("🔌 Restarting connection..."));
            setTimeout(sockstart, 5000);
          }
        }
      }
    }

    await getPairingCode(); 
  }
  
  // Setup auto-reaction setelah koneksi berhasil
  setTimeout(async () => {
    try {
      if (sock && sock.user && sock.ev) {
        console.log(chalk.blue('🚀 Setting up auto-reaction system...'));
        
        const loaded = await loadReactionConfig();
        
        if (!loaded || !global.autoReactionChannels || global.autoReactionChannels.size === 0) {
          console.log(chalk.yellow('⚠️ No config found, setting up default channel...'));
          await setupAutoReaction(sock);
        } else {
          console.log(chalk.green('📋 Config loaded, starting listener...'));
          startReactionListener(sock);
          
          for (const [jid, config] of global.autoReactionChannels.entries()) {
            console.log(chalk.cyan(`   - ${config.link || jid}: ${config.enabled ? '🟢' : '🔴'} ${config.emoji}`));
          }
        }
      } else {
        console.log(chalk.red('❌ Socket not ready for auto-reaction setup'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to setup auto-reaction: ${error.message}`));
    }
  }, 8000);
}

// ==============================
// Export semua fungsi
// ==============================

// Auto-reaction exports
exports.azul = azul;
exports.setupAutoReaction = setupAutoReaction;
exports.loadReactionConfig = loadReactionConfig;
exports.startReactionListener = startReactionListener;
exports.addReactionChannel = addReactionChannel;
exports.disableAutoReaction = disableAutoReaction;
exports.enableAutoReaction = enableAutoReaction;

// YTDL exports
exports.ytdl = ytdl;
exports.search = search;
exports.download = download;

// Web scraping exports
exports.fetchInitialPage = fetchInitialPage;
exports.postDownloadRequest = postDownloadRequest;
exports.scrapeVideoInfo = scrapeVideoInfo;
exports.downloadSocialMedia = downloadSocialMedia;

// Status functions
exports.getReactionStatus = () => {
  if (!global.autoReactionChannels) {
    return {
      active: false,
      channels: 0,
      details: []
    };
  }
  
  const details = [];
  let activeChannels = 0;
  
  for (const [jid, config] of global.autoReactionChannels.entries()) {
    if (config.enabled) activeChannels++;
    details.push({
      jid,
      ...config
    });
  }
  
  return {
    active: global.reactionListenerActive && activeChannels > 0,
    channels: global.autoReactionChannels.size,
    activeChannels: activeChannels,
    details: details
  };
};

exports.changeReactionEmoji = async (channelJid, newEmoji) => {
  try {
    if (!global.autoReactionChannels || !global.autoReactionChannels.has(channelJid)) {
      throw new Error('Channel not found');
    }
    
    global.autoReactionChannels.get(channelJid).emoji = newEmoji;
    await saveReactionConfig();
    
    return true;
  } catch (error) {
    throw error;
  }
};

// ==============================
// Testing functions
// ==============================
if (require.main === module) {
  console.log(chalk.cyan('🧪 Testing semua fungsi...'));
  
  // Test YTDL
  ytdl('night changes', 'mp3', '320')
    .then(result => {
      console.log(chalk.green('✅ YTDL Test Result:'));
      console.log('  Title:', result.title);
      console.log('  Duration:', result.duration);
      console.log('  URL:', result.url ? 'Valid' : 'Invalid');
    })
    .catch(err => console.log(chalk.red('❌ YTDL Error:'), err.message));
  
  // Test Web Scraping (contoh)
  setTimeout(() => {
    console.log(chalk.cyan('\n🧪 Testing Web Scraping...'));
    // Uncomment untuk test scraping
    /*
    scrapeVideoInfo('https://tiktok.com/@example/video/123456')
      .then(result => {
        console.log(chalk.green('✅ Web Scraping Result:'));
        console.log('  Found:', result.length, 'videos');
      })
      .catch(err => console.log(chalk.red('❌ Web Scraping Error:'), err.message));
    */
  }, 1000);
}