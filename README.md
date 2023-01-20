# AudioWorklet port of sc68 player


Reimplementation using AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

Supported backends:
- **sc68**: sndh, sc68 (needs replay *.bin files)
- **openmpt**: mptm mod s3m xm it 669 amf ams c67 dbm digi dmf dsm dsym dtm far fmt imf ice j2b m15 mdl med mms mt2 mtm mus nst okt plm psm pt36 ptm sfx sfx2 st26 stk stm stx stp symmod ult wow gdm mo3 oxm umx xpk ppm mmcmp

Original work by by Juergen Wothke:
- generic audio player: https://bitbucket.org/wothke/webaudio-player/src/master/
- sc68 backend: https://bitbucket.org/wothke/sc68-2.2.1/src/master/
- openmpt backend: https://bitbucket.org/wothke/webmpt/src/master/




## How to use

```javascript
import { NodePlayer } from './node_player.js';

const songUrl = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/wings%20of%20death.sndh'

const player = new NodePlayer()

await player.load(songUrl, 'sc68');

// play method can't be called directly, but needs an user interaction
const playButton = document.getElementById('play');
playButton.addEventListener('click', async (e) => {
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
- stereo?
- debug mode to turn off/on debug message and audioWorklet addModule timestamp
