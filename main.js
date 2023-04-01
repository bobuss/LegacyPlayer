import { LegacyPlayer } from './legacy-player.js';
import { Spectrum } from './visualisations/spectrum.js'
import { StereoVuMeter } from './visualisations/stereo-vumeter.js'
import { Scope } from './visualisations/scope.js'
import { VoiceMeter } from './visualisations/voice-meter.js';

const songUrlMPT = 'http://modland.com/pub/modules/Fasttracker%202/Jugi/onward%20(party%20version).xm'
const songUrlPT = 'http://modland.com/pub/modules/Soundtracker/Karsten%20Obarski/amegas.mod'
const songUrlPT2 = 'dope.mod'
const songUrlSC68 = 'jam.sc68'
const songUrlSNDH = 'http://modland.com/pub/modules/SNDH/Jochen%20Hippel/enchanted%20land.sndh'
const songUrlAHX = 'http://modland.com/pub/modules/AHX/Android/axel%20f%20-%20the%20remodel.ahx'
const songUrlST3 = 'http://modland.com/pub/modules/Screamtracker%203/Skaven/2nd%20reality.s3m'
const songUrlSID = 'Mus1k.sid'
const songUrlVGM = 'Covered.vgz'

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const player = new LegacyPlayer(audioContext)

// Visualisations

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


function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);
    return `${minutes}:${seconds < 10 ? '0'+seconds : seconds}`
}

// seek
const slider = document.getElementById('seek-slider')
const currentTime = document.getElementById('current-time')
slider.addEventListener('input', (e) => {
    slider.block = true;
})
slider.addEventListener('change', (e) => {
    e.preventDefault()
    slider.block = false;
    currentTime.innerHTML = formatTime(e.target.value)
    player.seek(e.target.value);
})
player.onSongPositionUpdated = function() {
    if (this.songInfo['duration'] !== undefined) {
        currentTime.innerHTML = formatTime(this.position)
    } else if (this.songInfo['positionNr'] !== undefined) {
        currentTime.innerHTML = this.position
    } else {
        currentTime.innerHTML = 'N/A'
    }
    if (!slider.block)
        slider.value = this.position
}

// songInfo updated
player.onSongInfoUpdated = function () {
    const e1 = document.getElementById('song-info')
    e1.innerHTML = JSON.stringify(this.songInfo, undefined, 2)
    const el = document.getElementById('duration')
    const slider = document.getElementById('seek-slider')

    if (this.songInfo['duration'] !== undefined) {
        el.innerHTML = formatTime(this.songInfo['duration'])
        currentTime.innerHTML = '0:00'
        slider.max = this.songInfo['duration']
        slider.step = 0.1
    } else if (this.songInfo['positionNr'] !== undefined) {
        el.innerHTML = this.songInfo['positionNr']
        currentTime.innerHTML = '0'
        slider.max = this.songInfo['positionNr']
        slider.step = 1
    } else {
        currentTime.innerHTML = 'N/A'
        el.innerHTML = 'N/A'
    }
    if (!slider.block)
        slider.value = 0
}

const loadFT2Button = document.getElementById('loadft2');
loadFT2Button.addEventListener('click', async (e) => {
    await player.load(songUrlMPT, { "processor": 'ft2' });
});

const loadmptButton = document.getElementById('loadmpt');
loadmptButton.addEventListener('click', async (e) => {
    await player.load(songUrlMPT, { "processor": 'openmpt' });
});

const loadPTButton = document.getElementById('loadpt');
loadPTButton.addEventListener('click', async (e) => {
    await player.load(songUrlPT, { "processor": 'pt' })
});

const loadPTButton2 = document.getElementById('loadpt2');
loadPTButton2.addEventListener('click', async (e) => {
    await player.load(songUrlPT2, { "processor": 'pt' })
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
    await player.load(songUrlAHX, { track: 2 });
});

const loadSIDButton = document.getElementById('loadsid');
loadSIDButton.addEventListener('click', async (e) => {
    await player.load(songUrlSID);
});

const loadVGMButton = document.getElementById('loadvgm');
loadVGMButton.addEventListener('click', async (e) => {
    await player.load(songUrlVGM);
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

