import { NodePlayer } from './node_player.js';
import { Spectrum } from './visu_spectrum.js'
import { VuMeter } from './visu_vumeter.js'
import { Scope } from './visu_scope.js'

const songUrlMPT = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/onward.xm'
const songUrlSC68 = 'http://modland.com/pub/modules/SC68/Jochen%20Hippel/wings%20of%20death%20-%20title.sc68'
const songUrlAHX = 'http://modland.com/pub/modules/AHX/AceMan/arrrr!ghwblwubwubwub.ahx'
const songUrlPT = 'http://modland.com/pub/modules/Protracker/Travolta/spacefunk.mod'

const songUrlFT2 = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/dope.xm'

const songUrlST3 = 'http://modland.com/pub/modules/Screamtracker%203/Skaven/2nd%20reality.s3m'

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new NodePlayer(audioContext)

const canvas1 = document.getElementById('visualizer1')
const scope1 = new Spectrum(canvas1)
player.connect(player.leftNode, scope1)

const canvas2 = document.getElementById('visualizer2')
const scope2 = new VuMeter(canvas2)
player.connect(player.rightNode, scope2)

const canvas3 = document.getElementById('visualizer3')
const scope3 = new Scope(canvas3)
player.connect(player.masterNode, scope3)

player.enableSpectrum();


await player.loadWorkletProcessor('sc68')
await player.loadWorkletProcessor('openmpt')
await player.loadWorkletProcessor('ahx')
await player.loadWorkletProcessor('pt')
await player.loadWorkletProcessor('ft2')
await player.loadWorkletProcessor('st3')

const loadmptButton = document.getElementById('loadmpt');
loadmptButton.addEventListener('click', async (e) => {
    await player.load(songUrlMPT);
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

const playButton = document.getElementById('play');
playButton.addEventListener('click', async (e) => {
    player.play()
});

const stopButton = document.getElementById('stop');
stopButton.addEventListener('click', async (e) => {
    player.pause()
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

