class BufferedStereoWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		/* Bigger buffer to ride out UI-thread stalls (GC/layout/etc). */
		this.capacityFrames = Math.max( 8192, ( sampleRate | 0 ) * 4 );
		this.ring = new Float32Array( this.capacityFrames * 2 );
		this.readIdx = 0;
		this.writeIdx = 0;
		this.availableFrames = 0;
		this.reportCounter = 0;
		this.underrunFrames = 0;
		this.started = false;

		this.port.onmessage = ( event ) => {
			const msg = event.data;
			if( !msg || !msg.type ) {
				return;
			}
			switch( msg.type ) {
				case "reset":
					this.readIdx = 0;
					this.writeIdx = 0;
					this.availableFrames = 0;
					this.underrunFrames = 0;
					this.started = false;
					break;
				case "push": {
					if( !msg.buffer ) return;
					const data = new Float32Array( msg.buffer );
					const frames = ( data.length / 2 ) | 0;
					let toWrite = frames;
					const freeFrames = this.capacityFrames - this.availableFrames;
					if( toWrite > freeFrames ) {
						toWrite = freeFrames;
					}
					for( let i = 0; i < toWrite; i++ ) {
						const src = i * 2;
						const dst = this.writeIdx * 2;
						this.ring[ dst ] = data[ src ];
						this.ring[ dst + 1 ] = data[ src + 1 ];
						this.writeIdx++;
						if( this.writeIdx >= this.capacityFrames ) this.writeIdx = 0;
					}
					this.availableFrames += toWrite;
					if( toWrite > 0 ) {
						this.started = true;
					}
					/* Return the transferred buffer for reuse on the main thread. */
					this.port.postMessage( { type: "recycle", buffer: msg.buffer }, [ msg.buffer ] );
					break;
				}
			}
		};
	}

	process( inputs, outputs ) {
		const output = outputs[ 0 ];
		const left = output[ 0 ];
		const right = output[ 1 ];
		const frames = left.length;

		for( let i = 0; i < frames; i++ ) {
			if( this.availableFrames > 0 ) {
				const src = this.readIdx * 2;
				left[ i ] = this.ring[ src ];
				right[ i ] = this.ring[ src + 1 ];
				this.readIdx++;
				if( this.readIdx >= this.capacityFrames ) this.readIdx = 0;
				this.availableFrames--;
			} else {
				// Only count underruns once we've actually started receiving audio.
				if( this.started ) {
					this.underrunFrames++;
				}
				left[ i ] = 0;
				right[ i ] = 0;
			}
		}

		/* Report often so the UI thread can keep the buffer topped up. */
		if( ++this.reportCounter >= 4 ) {
			this.reportCounter = 0;
			this.port.postMessage({ type: "level", frames: this.availableFrames, capacity: this.capacityFrames, underrunFrames: this.underrunFrames });
		}
		return true;
	}
}

registerProcessor( "buffered-stereo", BufferedStereoWorkletProcessor );
