function AudioPlayer() {
	var AudioCtx = window.AudioContext || window.webkitAudioContext;
	var audioContext = new AudioCtx();
	var audioSource = new SineSource( audioContext.sampleRate );
	var playToken = 0;
	var isPlaying = false;
	var scriptProcessor = null;
	var workletNode = null;
	var usingWorklet = false;
	var pumpTimer = null;
	var bufferedFrames = 0;
	var bufferCapacityFrames = 0;
	var underrunFrames = 0;
	var workletInitPromise = null;
	var chunkSize = 8192;
	var targetBufferSeconds = 1.00;
	var maxBufferSeconds = 3.00;
	var leftWork = new Float32Array( chunkSize );
	var rightWork = new Float32Array( chunkSize );
	var txPool = [];

	var ensureScriptProcessor = function() {
		if( scriptProcessor ) return;
		scriptProcessor = audioContext.createScriptProcessor( 0, 0, 2 );
		scriptProcessor.onaudioprocess = function( event ) {
			var leftBuf = event.outputBuffer.getChannelData( 0 );
			var rightBuf = event.outputBuffer.getChannelData( 1 );
			audioSource.getAudio( leftBuf, rightBuf, event.outputBuffer.length );
		};
	};

	var ensureWorklet = function() {
		if( workletInitPromise ) return workletInitPromise;
		workletInitPromise = ( async function() {
			if( !audioContext.audioWorklet || !audioContext.audioWorklet.addModule ) {
				throw "AudioWorklet not supported";
			}
			await audioContext.audioWorklet.addModule( "BufferedStereoWorklet.js" );
			workletNode = new AudioWorkletNode( audioContext, "buffered-stereo", {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [ 2 ]
			} );
			workletNode.port.onmessage = function( event ) {
				var msg = event.data;
				if( !msg || !msg.type ) return;
				switch( msg.type ) {
					case "level":
						bufferedFrames = msg.frames | 0;
						bufferCapacityFrames = msg.capacity | 0;
						underrunFrames = msg.underrunFrames | 0;
						break;
					case "recycle":
						if( msg.buffer ) {
							txPool.push( msg.buffer );
						}
						break;
				}
			};
			usingWorklet = true;
		} )();
		return workletInitPromise;
	};

	var stopPump = function() {
		if( pumpTimer ) {
			clearInterval( pumpTimer );
			pumpTimer = null;
		}
	};

	var pumpOnce = function( targetFrames, maxFrames ) {
		if( !workletNode ) return;
		// Only generate/push when there's room for a full chunk.
		// Also keep a local estimate so we don't overshoot if "level" messages lag.
		var capFrames = bufferCapacityFrames > 0 ? bufferCapacityFrames : Math.max( 8192, ( audioContext.sampleRate | 0 ) * 4 );
		var estBufferedFrames = bufferedFrames | 0;
		// Fill in chunks, but cap work per tick to avoid long stalls.
		for( var loops = 0; loops < 8; loops++ ) {
			if( estBufferedFrames >= targetFrames ) return;
			if( estBufferedFrames >= maxFrames ) return;
			if( capFrames > 0 ) {
				var freeFrames = capFrames - estBufferedFrames;
				if( freeFrames < chunkSize ) {
					return;
				}
			}
			if( leftWork.length !== chunkSize ) {
				leftWork = new Float32Array( chunkSize );
				rightWork = new Float32Array( chunkSize );
			}
			audioSource.getAudio( leftWork, rightWork, chunkSize );
			var buf = txPool.length > 0 ? txPool.pop() : new ArrayBuffer( chunkSize * 2 * 4 );
			var interleaved = new Float32Array( buf );
			for( var i = 0, j = 0; i < chunkSize; i++ ) {
				interleaved[ j++ ] = leftWork[ i ];
				interleaved[ j++ ] = rightWork[ i ];
			}
			workletNode.port.postMessage( { type: "push", buffer: buf }, [ buf ] );
			estBufferedFrames += chunkSize;
			// Keep the global estimate moving even if "level" messages are delayed.
			bufferedFrames = estBufferedFrames;
		}
	};

	var startPump = function() {
		stopPump();
		if( !workletNode ) return;
		var targetFrames = ( targetBufferSeconds * audioContext.sampleRate ) | 0;
		var maxFrames = ( maxBufferSeconds * audioContext.sampleRate ) | 0;
		if( bufferCapacityFrames > 0 && maxFrames > bufferCapacityFrames ) {
			maxFrames = bufferCapacityFrames;
		}
		pumpTimer = setInterval( function() {
			pumpOnce( targetFrames, maxFrames );
		}, 30 );
	};

	var prefillAndStart = function() {
		if( !workletNode ) return;
		var targetFrames = ( targetBufferSeconds * audioContext.sampleRate ) | 0;
		var maxFrames = ( maxBufferSeconds * audioContext.sampleRate ) | 0;
		if( bufferCapacityFrames > 0 && maxFrames > bufferCapacityFrames ) {
			maxFrames = bufferCapacityFrames;
		}
		// Prime buffer synchronously so playback doesn't start at 0.
		pumpOnce( targetFrames, maxFrames );
		startPump();
	};

	this.getSamplingRate = function() {
		return audioContext.sampleRate;
	}
	this.getBackend = function() {
		return usingWorklet ? "worklet" : "scriptprocessor";
	}
	this.getBufferedSeconds = function() {
		return bufferedFrames / audioContext.sampleRate;
	}
	this.getUnderrunFrames = function() {
		return underrunFrames;
	}
	this.setBuffering = function( targetSeconds, maxSeconds, chunkFrames ) {
		if( targetSeconds > 0 ) targetBufferSeconds = targetSeconds;
		if( maxSeconds > 0 ) maxBufferSeconds = maxSeconds;
		if( chunkFrames && chunkFrames >= 256 ) {
			chunkSize = chunkFrames | 0;
			leftWork = new Float32Array( chunkSize );
			rightWork = new Float32Array( chunkSize );
			txPool = [];
		}
	}
	this.setAudioSource = function( audioSrc ) {
		audioSource = audioSrc;
	}
	this.play = function() {
		if( isPlaying ) return;
		isPlaying = true;
		var token = ++playToken;
		audioContext.resume();
		ensureWorklet().then( function() {
			if( token !== playToken ) return;
			if( !workletNode ) throw "Worklet init failed";
			bufferedFrames = 0;
			underrunFrames = 0;
			workletNode.port.postMessage( { type: "reset" } );
			// Start filling before connecting, to avoid initial underruns.
			prefillAndStart();
			workletNode.connect( audioContext.destination );
		} ).catch( function() {
			if( token !== playToken ) return;
			// Common reasons: unsupported browser or loading TestPlayer.html from file://
			usingWorklet = false;
			ensureScriptProcessor();
			scriptProcessor.connect( audioContext.destination );
		} );
	}
	this.stop = function() {
		if( !isPlaying ) return;
		isPlaying = false;
		playToken++;
		stopPump();
		if( workletNode ) {
			try {
				workletNode.disconnect( audioContext.destination );
			} catch( e ) {
			}
		}
		if( scriptProcessor ) {
			try {
				scriptProcessor.disconnect( audioContext.destination );
			} catch( e ) {
			}
		}
	}
}

function SineSource( samplingRate ) {
	// Simple AudioSource for testing.
	var rate = samplingRate;
	var freq = 2 * Math.PI * 440 / rate;
	var phase = 0;
	this.getSamplingRate = function() {
		return rate;
	}
	this.getAudio = function( leftBuffer, rightBuffer, count ) {
		for( var idx = 0; idx < count; idx++, phase++ ) {
			leftBuffer[ idx ] = Math.sin( phase * freq );
			rightBuffer[ idx ] = Math.sin( phase * freq * 0.5 );
		}
	}
}
