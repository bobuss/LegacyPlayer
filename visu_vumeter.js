import { VisuBase } from './visu_base.js'

export class VuMeter extends VisuBase {

    width = 500
    height = 6

    minDecibels = -90;
    maxDecibels = -10;
    fftSize = 128
    smoothingTimeConstant = 0.85;

    constructor(canvas) {
        super(canvas)
        this.canvas = canvas;
        this.canvasCtx = this.canvas.getContext('2d');
        this.canvas.width = this.width
        this.canvas.height = this.height
        this.fftSize = this.fftSize
        this.dotWidth = 10;
        this.margin = 2;
        this.middleMargin = 4;
        this.bufferSize = this.fftSize;
        this.dataArray = new Uint8Array(this.bufferSize);
        this.gradient = this.canvasCtx.createLinearGradient(0, 0, this.canvas.width, 0);
        this.gradient.addColorStop(0, "green");
        this.gradient.addColorStop(0.2, "yellow");
        this.gradient.addColorStop(1, "red");
    }


    render() {

        if (this.analyser) {
            this.analyser.getByteTimeDomainData(this.dataArray);
            const range = this.getDynamicRange(this.dataArray) * (Math.E - 1);

            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const intensity = Math.min(Math.floor(range * this.width), this.width);

            this.canvasCtx.fillStyle = this.gradient;
            if (intensity)
                this.canvasCtx.fillRect(0, 0, intensity, this.height, 0, 0, intensity, this.height);
        }

    }

    getDynamicRange(buffer) {
        const len = buffer.length;
        let min = this.bufferSize;
        let max = this.bufferSize;

        for (let i = 0; i < len; i++) {
            const instrument = buffer[i];
            if (instrument < min) min = instrument;
            else if (instrument > max) max = instrument
        }

        return (max - min) / 255
    }
}
