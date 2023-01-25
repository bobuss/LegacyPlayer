export class VisuBase{

    analyser = null;
    minDecibels = -90;
    maxDecibels = -10;
    fftSize = 128
    smoothingTimeConstant = 0.85;


    constructor(canvas) {
        this.canvas = canvas;
        this.canvasCtx = this.canvas.getContext('2d');
    }

    // Can be overridden if needed in subclasses
    createAnalyser(audioCtx) {
        this.analyser = audioCtx.createAnalyser();
        this.analyser.minDecibels = this.minDecibels
        this.analyser.maxDecibels = this.maxDecibels
        this.analyser.fftSize = this.fftSize
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant
        return this.analyser
    }

}
