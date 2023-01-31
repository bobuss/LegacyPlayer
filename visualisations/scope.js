

export class Scope {

    width = 200
    height = 200

    minDecibels = -90;
    maxDecibels = -10;
    fftSize = 1024
    smoothingTimeConstant = 0.85;

    constructor(canvas) {
        this.canvas = canvas;
        this.canvasCtx = this.canvas.getContext('2d');
        this.canvas.width = this.width
        this.canvas.height = this.height
        this.fftSize = this.fftSize
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
        this.analyser = this.createAnalyser(player.audioContext)
        player.masterNode.connect(this.analyser)
    }

    render() {

        if (this.analyser) {

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const gradient = this.canvasCtx.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, "yellow");
            gradient.addColorStop(1, "red");

            this.analyser.getByteTimeDomainData(dataArray);
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = "rgb(0, 0, 0)";
            this.canvasCtx.beginPath();
            const sliceWidth = this.canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * (this.canvas.height / 2);

                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }


            this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
            this.canvasCtx.stroke();

        }

    }
}
