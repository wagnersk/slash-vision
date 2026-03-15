#!/usr/bin/env node
/**
 * Baixa os arquivos do MediaPipe direto por URL para assets/mediapipe/.
 * Modelo: oficial do guia Google AI Edge MediaPipe Solutions.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 * Não usa npm install nem node_modules. Rode: node prepare-mediapipe.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname);
const OUT = path.join(ROOT, 'assets', 'mediapipe');
const OUT_WASM = path.join(OUT, 'wasm');

const MP_VERSION = '0.10.21';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
// Modelo oficial: Hand Landmarker (full) — https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/index#models
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const FILES = [
    { url: `${CDN}/vision_bundle.mjs`, path: 'vision_bundle.mjs' },
    { url: `${CDN}/wasm/vision_wasm_internal.js`, path: 'wasm/vision_wasm_internal.js' },
    { url: `${CDN}/wasm/vision_wasm_internal.wasm`, path: 'wasm/vision_wasm_internal.wasm' },
    { url: MODEL_URL, path: 'hand_landmarker.task' },
];

function mkdir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadToFile(url, destPath) {
    return new Promise((resolve, reject) => {
        mkdir(path.dirname(destPath));
        const stream = fs.createWriteStream(destPath);
        const req = https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                stream.close();
                try { fs.unlinkSync(destPath); } catch (_) {}
                return downloadToFile(res.headers.location, destPath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                stream.close();
                try { fs.unlinkSync(destPath); } catch (_) {}
                reject(new Error(`${url} → HTTP ${res.statusCode}`));
                return;
            }
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                console.log('OK', path.relative(ROOT, destPath));
                resolve();
            });
        });
        req.on('error', (err) => {
            stream.close();
            try { fs.unlinkSync(destPath); } catch (_) {}
            reject(err);
        });
    });
}

async function main() {
    console.log('Baixando MediaPipe direto (sem npm)...\n');
    mkdir(OUT);
    mkdir(OUT_WASM);

    for (const { url, path: filePath } of FILES) {
        const dest = path.join(OUT, filePath);
        try {
            await downloadToFile(url, dest);
        } catch (err) {
            console.error('Erro:', err.message);
            process.exit(1);
        }
    }

    console.log('\nPronto. Arquivos em assets/mediapipe/');
}

main();
