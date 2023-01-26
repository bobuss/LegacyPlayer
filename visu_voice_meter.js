

export class VoiceMeter {

    width = 400
    height = 200
    numVoices = 32

    constructor(canvas) {
        this.canvas = canvas;
        this.canvasCtx = this.canvas.getContext('2d');
        this.canvas.width = this.width
        this.canvas.height = this.height

        this.gradient = this.canvasCtx.createLinearGradient(0, 0, 0, this.canvas.height);
        this.gradient.addColorStop(1, "green");
        this.gradient.addColorStop(0.4, "yellow");
        this.gradient.addColorStop(1, "red");
    }

    register_player(player) {
        this.player = player
    }

    render() {

        if ( this.player && this.player.playing ) {

            this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const vuWidth = this.width / this.numVoices - 1;

            for (let i = 0; i < this.numVoices ; i++) {
                const vuHeight = this.player.chvu[i] * (1 - this.canvas.height);
                this.canvasCtx.fillStyle = this.gradient
                this.canvasCtx.fillRect(i * (vuWidth + 1) , this.canvas.height, vuWidth , vuHeight);
            }

        }

    }
}
