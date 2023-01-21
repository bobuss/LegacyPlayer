# AudioWorklet port of sc68 player


Reimplementation using AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

Supported backends:
- **sc68**: sndh, sc68 (needs replay *.bin files)
- **openmpt**: mptm mod s3m xm it 669 amf ams c67 dbm digi dmf dsm dsym dtm far fmt imf ice j2b m15 mdl med mms mt2 mtm mus nst okt plm psm pt36 ptm sfx sfx2 st26 stk stm stx stp symmod ult wow gdm mo3 oxm umx xpk ppm mmcmp

Original work by by Juergen Wothke:
- generic audio player: https://bitbucket.org/wothke/webaudio-player/src/master/
- sc68 backend: https://bitbucket.org/wothke/sc68-2.2.1/src/master/
  - emscripten worklet-compatible module from https://github.com/bobuss/sc68-2.2.1
- openmpt backend: https://bitbucket.org/wothke/webmpt/src/master/
  - emscripten worklet-compatible module built manually. Will push that on a repository, on day



## How to use

```javascript
import { NodePlayer } from './node_player.js';

const songUrl = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/wings%20of%20death.sndh'

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new NodePlayer(audioContext)
await player.loadWorkletProcessor('sc68')
await player.loadWorkletProcessor('openmpt')

const loadmptButton = document.getElementById('loadmpt');
loadmptButton.addEventListener('click', async (e) => {
    await player.load(songUrlMPT, 'openmpt');
    player.play()
});

const loadsc68Button = document.getElementById('loadsc68');
loadsc68Button.addEventListener('click', async (e) => {
    await player.load(songUrlSC68, 'sc68');
    player.play()
});

```


### Adding spectrum (Work in Progress: hardcoded)

```javascript
const canvas = document.getElementById('visualizer')
player.enableSpectrum(canvas)
```


## TODO
- seek
- debug mode to turn off/on debug message and audioWorklet addModule timestamp
