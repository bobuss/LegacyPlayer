# AudioWorklet port of sc68 player


Reimplementation using AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

Supported backends:
- sc68: formats *.sndh, *.sc68 (needs replay *.bin files)


Original work by by Juergen Wothke:
- generic audio player: https://bitbucket.org/wothke/webaudio-player/src/master/
- sc68 backend: https://bitbucket.org/wothke/sc68-2.2.1/src/master/




## How to use

### Basic
```javascript
import { NodePlayer } from './node_player.js';

const songUrl = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/wings%20of%20death.sndh'

const player = new NodePlayer()

await player.load(songUrl);

// play method can't be called directly, but needs an user interaction
const playButton = document.getElementById('play');
playButton.addEventListener('click', async (e) => {
    player.play()
});
```


### Adding spectrum (Work in Progress)

```javascript
const canvas = document.getElementById('visualizer')
player.enableSpectrum(canvas)
```


## TODO
- debug mode to turn off/on debug message and audioWorklet addModule timestamp
- backend switch
