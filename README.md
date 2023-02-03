# Nostalic player

Implementation using AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

Tested on Chrome and Firefox.
Got some partial results on Safari.


Supported backends:
- **sc68**: sndh, sc68 (needs replay *.bin files)
- **openmpt**: mptm mod s3m xm it 669 amf ams c67 dbm digi dmf dsm dsym dtm far fmt imf ice j2b m15 mdl med mms mt2 mtm mus nst okt plm psm pt36 ptm sfx sfx2 st26 stk stm stx stp symmod ult wow gdm mo3 oxm umx xpk ppm mmcmp
- **ahx**: ahx
- **ft2**: xm
- **st3**: sm3
- **pt**: mod

Note: Openmpt backend gives the best results, but it does not support vumeters by channels.



## How to use

```javascript
import { LegacyPlayer } from './legacy_player.js';

const songUrlSC68 = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/wings%20of%20death.sndh'
const songUrlFT2 = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/onward%20(party%20version).xm'

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new LegacyPlayer(audioContext)

const loadsc68Button = document.getElementById('loadsc68');
loadsc68Button.addEventListener('click', async (e) => {
    await player.load(songUrlSC68);
    player.play()
});

// by default xm files are played with ft2 backend
const loadFT2Button = document.getElementById('loadft2');
loadFT2Button.addEventListener('click', async (e) => {
    await player.load(songUrlFT2);
});

// you can force to use openmpt instead
const loadFT2WithMTPButton = document.getElementById('loadft2withmpt');
loadFT2WithMTPButton.addEventListener('click', async (e) => {
    await player.load(songUrlFT2, {"processor": 'openmpt'});
});

```



## Inspirations

Original work by by Juergen Wothke:
- generic audio player: https://bitbucket.org/wothke/webaudio-player/src/master/
- sc68 backend: https://bitbucket.org/wothke/sc68-2.2.1/src/master/
  - emscripten worklet-compatible module from https://github.com/bobuss/sc68-2.2.1

Emscripten worklet-compatible module built manually in worker mode. Will push that on a repository, maybe.
Based on https://lib.openmpt.org/libopenmpt/

AHX backend by Bryc:
- https://github.com/bryc/ahx-web-player

Native javascript origin backends for Protracker (pt), ScreamTracker3 (st3) and FastTracker 2 (ft2) by electronoora:
- https://github.com/electronoora/webaudio-mod-player

More format (old Soundtracker mods) by krzykos:
- https://github.com/krzykos/webaudio-mod-player/tree/master





## TODO
- seek
- getInfo with common fields
- Better API (play / stop / pause / resume ?)
- UI
- Decide what to du at the end of a song
