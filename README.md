<div align="center">
  <h1>Slash Vision</h1>
  <p><strong>Fruit Ninja com as mãos — 100% no navegador</strong></p>
</div>

---

## Sobre

**Slash Vision** é um jogo estilo Fruit Ninja que usa a câmera e detecção de mãos em tempo real. Tudo roda no navegador — sem servidor, sem backend. A detecção de mãos usa [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) a partir de arquivos locais em `core/` e `models/` (sem CDN).

### Onde fica cada parte (como no visao-computacional-python)

| Pasta | Conteúdo | Função |
|-------|----------|--------|
| **models/** | `hand_landmarker.task` | Modelo treinado (pesos da rede). Sozinho não roda — precisa do runtime. |
| **core/mediapipe/** | `vision_bundle.mjs`, `wasm/` (*.js + *.wasm) | Runtime: API JS que carrega o modelo e o WASM que executa a inferência no navegador. |

Os dois são necessários: o modelo diz *o quê* detectar; o core (bundle + WASM) é *quem* carrega e executa o modelo no browser.

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

1. Faça commit das pastas `core/` e `models/` e dê push. Deploy 100% estático (sem build).
2. Acesse [vercel.com](https://vercel.com) e importe o repositório.
3. Clique em **Deploy**.

## Estrutura

```
slash/
├── index.html      # Página principal
├── assets/
│   ├── script.js   # Game engine + detecção de mãos
│   └── style.css   # Estilos
├── core/
│   └── mediapipe/  # Runtime MediaPipe: vision_bundle.mjs, wasm/
├── models/
│   └── hand_landmarker.task   # Modelo Hand Landmarker
├── vercel.json     # Config de deploy estático
└── .gitignore
```

---

<div align="center">
  <p>Built by <strong>Wagner Sobreira</strong></p>
</div>
