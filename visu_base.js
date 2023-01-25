export class VisuBase{

    analyser = null;

    constructor(canvas) {
        this.canvas = canvas;
        this.canvasCtx = this.canvas.getContext('2d');
    }

    // Can be overridden if needed in subclasses
    createAnalyser(audioCtx) {
        this.analyser = audioCtx.createAnalyser();
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.analyser.fftSize = 128
        this.analyser.smoothingTimeConstant = 0.85;
        return this.analyser
    }

}
