<div align="center">
  <h1>Slash Vision</h1>
  <p><strong>Fruit Ninja com as mãos — 100% no navegador</strong></p>
</div>

---

## Sobre

**Slash Vision** é um jogo estilo Fruit Ninja que usa a câmera e detecção de mãos em tempo real. Tudo roda no navegador — sem servidor, sem backend. A detecção de mãos usa [MediaPipe Hand Landmarker](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) via CDN.

## Stack

- **HTML Canvas** — renderização do jogo a 60 FPS
- **MediaPipe Hand Landmarker** — detecção de mãos no navegador (WebAssembly)
- **Web Audio API** — efeitos sonoros e música gerados proceduralmente
- **CSS** — UI com design dark/neon

## Como jogar

1. Abra o jogo no navegador (Chrome/Edge recomendado)
2. Permita acesso à câmera
3. Use as mãos para cortar as frutas que aparecem na tela
4. Evite as bombas
5. Faça combos para multiplicar pontos

## Rodar localmente

```bash
npx serve -p 3333
```

Acesse `http://localhost:3333`

## Deploy na Vercel

O projeto é um site estático. O `vercel.json` já está configurado.

1. Acesse [vercel.com](https://vercel.com) e importe o repositório
2. Não altere Build Command nem Output Directory
3. Clique em **Deploy**

## Estrutura

```
├── index.html          # Página principal
├── assets/
│   ├── script.js       # Game engine + detecção de mãos
│   └── style.css       # Estilos
├── vercel.json         # Config de deploy estático
└── .gitignore
```

---

<div align="center">
  <p>Built by <strong>Wagner Sobreira</strong></p>
</div>
# slash-vision
# slash-vision
