
import { VisuBase } from './visu_base.js'

export class Spectrum extends VisuBase{

    render() {

        if ( this.analyser ) {

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const barWidth = this.canvas.width / bufferLength;
            let barHeight;
            let x = 0;
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const gradient = this.canvasCtx.createLinearGradient(0, 0, 0, this.canvas.height);
            gradient.addColorStop(0, "yellow");
            gradient.addColorStop(1, "red");

            this.analyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];
                this.canvasCtx.fillStyle = gradient;
                this.canvasCtx.fillRect(x, this.canvas.height - barHeight, barWidth - 2, barHeight);
                x += barWidth;
            }

        }

    }
}
