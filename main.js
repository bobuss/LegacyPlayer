import { NodePlayer } from './node_player.js';
import { Spectrum } from './visu_spectrum.js'
import { VuMeter } from './visu_vumeter.js'
import { Scope } from './visu_scope.js'
import { VoiceMeter } from './visu_voice_meter.js';

const songUrlMPT = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/onward.xm'
const songUrlSC68 = 'http://modland.com/pub/modules/SC68/Jochen%20Hippel/wings%20of%20death%20-%20title.sc68'
const songUrlSNDH = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/enchanted%20land.sndh'
const songUrlAHX = 'http://modland.com/pub/modules/AHX/AceMan/arrrr!ghwblwubwubwub.ahx'
const songUrlPT = 'http://modland.com/pub/modules/Protracker/Travolta/spacefunk.mod'

const songUrlFT2 = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/dope.xm'

const songUrlST3 = 'http://modland.com/pub/modules/Screamtracker%203/Skaven/2nd%20reality.s3m'

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new NodePlayer(audioContext)

const vuMeterLCanvas = document.getElementById('vuMeterL')
const scope1 = new VuMeter(vuMeterLCanvas)
player.connect(player.leftNode, scope1)

const vuMeterRCanvas = document.getElementById('vuMeterR')
const scope2 = new VuMeter(vuMeterRCanvas)
player.connect(player.rightNode, scope2)

const canvas3 = document.getElementById('visualizer3')
const scope3 = new Scope(canvas3)
player.connect(player.masterNode, scope3)

const canvas4 = document.getElementById('voices')
const voices = new VoiceMeter(canvas4)
player.addScope(voices)

player.enableSpectrum();


await player.loadWorkletProcessor('sc68')
await player.loadWorkletProcessor('openmpt')
await player.loadWorkletProcessor('ahx')
await player.loadWorkletProcessor('pt')
await player.loadWorkletProcessor('ft2')
await player.loadWorkletProcessor('st3')
await player.loadWorkletProcessor('psgplay')

player.onSongInfoUpdated = function() {
    const e1 = document.getElementById('info')
    e1.innerHTML = JSON.stringify(this.songInfo, undefined, 2)
    if (this.songInfo['duration'] !== undefined) {
        const el = document.getElementById('duration')
        el.innerHTML = this.songInfo['duration']
    }
}

const loadmptButton = document.getElementById('loadmpt');
loadmptButton.addEventListener('click', async (e) => {
    await player.load(songUrlMPT);
});

const loadSNDHButton = document.getElementById('loadsndh');
loadSNDHButton.addEventListener('click', async (e) => {
    await player.load(songUrlSNDH);
});

const loadsc68Button = document.getElementById('loadsc68');
loadsc68Button.addEventListener('click', async (e) => {
    await player.load(songUrlSC68);
});

const loadAHXButton = document.getElementById('loadahx');
loadAHXButton.addEventListener('click', async (e) => {
    await player.load(songUrlAHX);
});

const loadPTButton = document.getElementById('loadpt');
loadPTButton.addEventListener('click', async (e) => {
    await player.load(songUrlPT)
});

const loadFT2Button = document.getElementById('loadft2');
loadFT2Button.addEventListener('click', async (e) => {
    await player.load(songUrlFT2)
});

const loadST3Button = document.getElementById('loadst3');
loadST3Button.addEventListener('click', async (e) => {
    await player.load(songUrlST3)
});


const playButton = document.getElementById('play-pause');
playButton.addEventListener('click', async (e) => {
    const button = e.target;
    if (player.playing) {
        player.pause()
        button.className = "gg-play-button-o"
    } else {
        player.play()
        button.className = "gg-play-pause-o"
    }
});

const stereoSeparationInput = document.getElementById('stereoSeparation');
stereoSeparationInput.addEventListener('input', async (e) => {
    e.preventDefault();
    player.setStereoSeparation(e.target.value)
});

const panningInput = document.getElementById('panning');
panningInput.addEventListener('input', async (e) => {
    e.preventDefault();
    player.setPanning(e.target.value)
});

