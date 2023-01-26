export class VisuBase{

    createAnalyser(audioCtx) {
        this.analyser = audioCtx.createAnalyser();
        this.analyser.minDecibels = this.minDecibels
        this.analyser.maxDecibels = this.maxDecibels
        this.analyser.fftSize = this.fftSize
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant
        return this.analyser
    }

}
