
export class StereoVuMeter  {

    width = 250
    height = 20
    vuHeight = 6

    minDecibels = -90;
    maxDecibels = -10;
    fftSize = 128
    smoothingTimeConstant = 0.85;

    constructor(canvas) {
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

    createAnalyser(audioCtx) {
        const analyser = audioCtx.createAnalyser();
        analyser.minDecibels = this.minDecibels
        analyser.maxDecibels = this.maxDecibels
        analyser.fftSize = this.fftSize
        analyser.smoothingTimeConstant = this.smoothingTimeConstant
        return analyser
    }

    register_player(player) {
        this.leftAnalyser = this.createAnalyser(player.audioContext)
        player.leftNode.connect(this.leftAnalyser)

        this.rightAnalyser = this.createAnalyser(player.audioContext)
        player.rightNode.connect(this.rightAnalyser)
    }


    render() {

        if (this.leftAnalyser && this.rightAnalyser) {
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.canvasCtx.fillStyle = this.gradient;

            this.leftAnalyser.getByteTimeDomainData(this.dataArray);
            const leftRange = this.getDynamicRange(this.dataArray) * (Math.E - 1);
            const leftIntensity = Math.min(Math.floor(leftRange * this.width), this.width);
            if (leftIntensity)
                this.canvasCtx.fillRect(0, 0, leftIntensity, this.vuHeight);

            this.rightAnalyser.getByteTimeDomainData(this.dataArray);
            const rightRange = this.getDynamicRange(this.dataArray) * (Math.E - 1);
            const rightIntensity = Math.min(Math.floor(rightRange * this.width), this.width);
            if (rightIntensity)
                this.canvasCtx.fillRect(0, this.height-this.vuHeight, rightIntensity, this.vuHeight);
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
