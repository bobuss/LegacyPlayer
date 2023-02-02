import { LegacyPlayer } from './legacy-player.js';
import { Spectrum } from './visualisations/spectrum.js'
import { StereoVuMeter } from './visualisations/stereo-vumeter.js'
import { Scope } from './visualisations/scope.js'
import { VoiceMeter } from './visualisations/voice-meter.js';

const songUrlMPT = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/onward%20(party%20version).xm'
const songUrlPT = 'http://modland.com/pub/modules/Soundtracker/Karsten%20Obarski/amegas.mod'
const songUrlPT2 = 'dope.mod'
const songUrlSC68 = 'http://modland.com/pub/modules/SC68/Jochen%20Hippel/wings%20of%20death%20-%20title.sc68'
const songUrlSNDH = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/enchanted%20land.sndh'
const songUrlAHX = 'http://modland.com/pub/modules/AHX/Android/axel%20f%20-%20the%20remodel.ahx'
const songUrlST3 = 'http://modland.com/pub/modules/Screamtracker%203/Skaven/2nd%20reality.s3m'
// const songUrlPSG = 'There_Are_No_Sheep.sndh'


const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new LegacyPlayer(audioContext)

const vuMeterCanvas = document.getElementById('vuMeter')
const scope1 = new StereoVuMeter(vuMeterCanvas)
player.addScope(scope1)

const canvas3 = document.getElementById('visualizer3')
const scope3 = new Scope(canvas3)
player.addScope(scope3)

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
    const e1 = document.getElementById('song-info')
    e1.innerHTML = JSON.stringify(this.songInfo, undefined, 2)
    if (this.songInfo['duration'] !== undefined) {
        const el = document.getElementById('duration')
        el.innerHTML = this.songInfo['duration']
    }
}

const loadFT2Button = document.getElementById('loadft2');
loadFT2Button.addEventListener('click', async (e) => {
    await player.load(songUrlMPT, {"processor": 'ft2'});
});

const loadmptButton = document.getElementById('loadmpt');
loadmptButton.addEventListener('click', async (e) => {
    await player.load(songUrlMPT, {"processor": 'openmpt'});
});

const loadPTButton = document.getElementById('loadpt');
loadPTButton.addEventListener('click', async (e) => {
    await player.load(songUrlPT)
});

const loadPTButton2 = document.getElementById('loadpt2');
loadPTButton2.addEventListener('click', async (e) => {
    await player.load(songUrlPT2)
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
    await player.load(songUrlAHX, {track:2});
});

// const loadPSGButton = document.getElementById('loadpsg');
// loadPSGButton.addEventListener('click', async (e) => {
//     await player.load(songUrlPSG, {"processor": 'psgplay'});
// });



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

