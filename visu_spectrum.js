
import { VisuBase } from './visu_base.js'

export class Spectrum extends VisuBase{

    fftSize = 256
    minDecibels = -90;
    maxDecibels = -10;

    render() {

        if ( this.analyser ) {

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const barWidth = this.canvas.width / bufferLength * 2.5;
            let barHeight;
            let x = 0;
            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.analyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2;
                this.canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
                this.canvasCtx.fillRect(x, this.canvas.height - barHeight / 2, barWidth, barHeight);
                x += barWidth + 1;
            }

        }

    }
}
