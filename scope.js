
export class Scope {

    analyser = null;

    constructor(canvas, type) {
        this.canvas = canvas;
        this.canvasContext = this.canvas.getContext('2d');
        this.type = type
    }

    register_analyser(analyser) {
        this.analyser = analyser
    }

    render() {

        if ( this.analyser ) {


            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const barWidth = this.canvas.width / bufferLength;
            let barHeight;
            let x = 0;
            this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const gradient = this.canvasContext.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, "yellow");
            gradient.addColorStop(1, "red");

            this.analyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];
                this.canvasContext.fillStyle = gradient;
                this.canvasContext.fillRect(x, this.canvas.height - barHeight, barWidth - 2, barHeight);
                x += barWidth;
            }



        }

    }
}
