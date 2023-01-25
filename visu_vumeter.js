import { VisuBase } from './visu_base.js'

export class VuMeter extends VisuBase {


    vuWidth = 500;
    vuHeight = 6;
    dotWidth = 10;
    margin = 2;
    middleMargin = 4;
    dataArray;
    bufferSize = 128;

    constructor(canvas) {
        super(canvas)
        this.canvas.width = this.vuWidth;
        this.canvas.height = this.vuHeight;

        this.gradient = this.canvasCtx.createLinearGradient(0, 0, this.canvas.width, 0);
        this.gradient.addColorStop(0, "green");
        this.gradient.addColorStop(0.2, "yellow");
        this.gradient.addColorStop(1, "red");
    }


    createAnalyser(audioCtx) {
        this.analyser = super.createAnalyser(audioCtx)
        this.bufferSize = this.analyser.fftSize;
        this.dataArray = new Uint8Array(this.bufferSize);
        return this.analyser
    }

    render() {

        if (this.analyser) {
            this.analyser.getByteTimeDomainData(this.dataArray);
            const range = this.getDynamicRange(this.dataArray) * (Math.E - 1);

            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const intensity = Math.min(Math.floor(range * this.vuWidth), this.vuWidth);

            this.canvasCtx.fillStyle = this.gradient;
            if (intensity)
                this.canvasCtx.fillRect(0, 0, intensity, this.vuHeight, 0, 0, intensity, this.vuHeight);
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
