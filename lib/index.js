"use strict";

const chalk = require("chalk");
const fetch = require("node-fetch"); // pastikan ini diinstall
const readline = require("readline");
const path = require("path");
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

const fs = require("fs").promises;

// Helper function untuk input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        rl.question(query, resolve);
    });
}

// Fungsi untuk setup auto-reaction
async function setupAutoReaction(sock) {
    try {
        console.log(chalk.blue('🔄 Setting up auto-reaction for channels...'));
        
        // Konfigurasi channel target
        const targetChannels = [
            {
                jid: '120363332093826351@broadcast', // JID untuk channel Anda
                link: 'https://whatsapp.com/channel/0029VbAwb7Y11ulWUcmu1S2p',
                emoji: '👍', // Default emoji
                enabled: true
            }
        ];
        
        // Simpan ke global variable
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
        
        // Simpan konfigurasi ke file
        await saveReactionConfig();
        
        // Mulai listener untuk pesan baru
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
        
        // Cek jika file exist
        try {
            await fs.access(configPath);
        } catch {
            console.log(chalk.yellow('⚠️ No auto-reaction config found, using default'));
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
    // Pastikan hanya ada satu listener
    if (global.reactionListenerActive) {
        console.log(chalk.yellow('⚠️ Reaction listener already active'));
        return;
    }
    
    console.log(chalk.blue('👂 Starting reaction listener...'));
    
    // Event handler untuk pesan baru
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            for (const m of messages) {
                // Cek apakah pesan dari channel broadcast
                if (m.key.remoteJid && m.key.remoteJid.endsWith('@broadcast')) {
                    
                    // Cek apakah channel ini ada di daftar auto-reaction
                    const reactionConfig = global.autoReactionChannels?.get(m.key.remoteJid);
                    
                    if (reactionConfig && reactionConfig.enabled && m.key.fromMe === false) {
                        // Hindari reaksi berulang terlalu cepat
                        const now = Date.now();
                        if (reactionConfig.lastReacted && (now - reactionConfig.lastReacted < 1000)) {
                            continue;
                        }
                        
                        try {
                            // Kirim reaksi
                            const reactionMessage = {
                                react: {
                                    text: reactionConfig.emoji,
                                    key: m.key
                                }
                            };
                            
                            await sock.sendMessage(m.key.remoteJid, reactionMessage);
                            
                            // Update last reacted time
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

// Fungsi untuk menambahkan channel baru ke auto-reaction
async function addReactionChannel(sock, channelLink, emoji = '👍') {
    try {
        console.log(chalk.blue(`🔗 Adding new channel: ${channelLink}`));
        
        // Ekstrak channel ID dari link
        const match = channelLink.match(/channel\/([A-Za-z0-9]+)/);
        if (!match) {
            throw new Error('Invalid channel link format');
        }
        
        const channelId = match[1];
        // WhatsApp Channel JID format
        const jid = `${channelId}@broadcast`;
        
        // Initialize jika belum ada
        if (!global.autoReactionChannels) {
            global.autoReactionChannels = new Map();
        }
        
        // Tambahkan channel
        global.autoReactionChannels.set(jid, {
            emoji: emoji,
            link: channelLink,
            enabled: true,
            lastReacted: null
        });
        
        // Save config
        await saveReactionConfig();
        
        console.log(chalk.green(`✅ Channel added: ${jid} with emoji ${emoji}`));
        
        // Restart listener untuk memastikan channel baru terdeteksi
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

// Fungsi untuk disable auto-reaction
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

// Fungsi untuk enable auto-reaction
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
    // Tunggu beberapa saat untuk memastikan koneksi stabil
    setTimeout(async () => {
        try {
            if (sock && sock.user && sock.ev) {
                console.log(chalk.blue('🚀 Setting up auto-reaction system...'));
                
                // Load config terlebih dahulu
                const loaded = await loadReactionConfig();
                
                if (!loaded || !global.autoReactionChannels || global.autoReactionChannels.size === 0) {
                    // Setup default jika tidak ada config
                    console.log(chalk.yellow('⚠️ No config found, setting up default channel...'));
                    await setupAutoReaction(sock);
                } else {
                    // Start listener jika config sudah ada
                    console.log(chalk.green('📋 Config loaded, starting listener...'));
                    startReactionListener(sock);
                    
                    // Log semua channel yang aktif
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
    }, 8000); // Tunggu 8 detik setelah koneksi
}

// Export semua fungsi
exports.azul = azul;
exports.setupAutoReaction = setupAutoReaction;
exports.loadReactionConfig = loadReactionConfig;
exports.startReactionListener = startReactionListener;
exports.addReactionChannel = addReactionChannel;
exports.disableAutoReaction = disableAutoReaction;
exports.enableAutoReaction = enableAutoReaction;

// Export fungsi untuk mendapatkan status
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

// Export fungsi untuk mengubah emoji
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