
import { VisuBase } from './visu_base.js'

export class Scope extends VisuBase {

    fftSize = 4096

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
