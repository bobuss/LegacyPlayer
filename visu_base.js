export class VisuBase{

    analyser = null;
    width = 100
    height = 100

    minDecibels = -90;
    maxDecibels = -10;
    fftSize = 128
    smoothingTimeConstant = 0.85;

    constructor(canvas) {
        this.canvas = canvas;
        this.canvas.width = this.width
        this.canvas.height = this.height
        this.canvasCtx = this.canvas.getContext('2d');
    }

    createAnalyser(audioCtx) {
        this.analyser = audioCtx.createAnalyser();
        this.analyser.minDecibels = this.minDecibels
        this.analyser.maxDecibels = this.maxDecibels
        this.analyser.fftSize = this.fftSize
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant
        return this.analyser
    }

}
