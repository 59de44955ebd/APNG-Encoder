/**
 * APNG Encoder
 *
 * @file Creates an APNG from an array of PNG blobs.
 * @author Valentin Schmidt
 * @version 0.3
 *
 * -- MIT License
 *
 * Copyright (c) 2020 Valentin Schmidt
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

'use strict';

(function(root) {

	var APNGEncoder = function(){
		this._crcTable = new Uint32Array(256);
		for (var n=0; n<256; n++) {
			var c = n;
			for (var k=0; k<8; k++) {
				if (c & 1) c = 0xedb88320 ^ (c >>> 1);
				else c = c >>> 1;
			}
			this._crcTable[n] = c;
		}
	}

	/**
	 * Creates APNG from array of PNG blobs
	 * @param {array} frames - Array of PNGs as blobs
	 * @param {function} cb - A callback that receives the final APNG blob
	 */
	APNGEncoder.prototype.createFromBlobs = function(frame_blobs, cb){
		if (console.time) console.time('Encoding APNG');
		var chunks = [];
		var sequence_number = 0;

		// PNG header
		var header = new Uint8Array([137,80,78,71, 13,10,26,10]); // 8 bytes
		chunks.push(header.buffer);

		var reader = new FileReader();
		var frame_num = 0;

		reader.onload = (e) => {
			var view = new DataView(reader.result); // reader.result: ArrayBuffer
			//console.log(view.getUint32(16)); // image width
			//console.log(view.getUint32(20)); // image height

			var pos = 8;

			if (frame_num==0){
				//######################################
				// add IHDR chunk
				//######################################
				var IHDR = new Uint8Array(8 + 13 + 4); // 25 bytes
				var IHDR_view = new DataView(IHDR.buffer);
				IHDR_view.setUint32(0, 13);
				this._writeStr(IHDR, 4, 'IHDR');
				IHDR_view.setUint32(8, VIDEO_WIDTH);
				IHDR_view.setUint32(12, VIDEO_HEIGHT);
				IHDR_view.setUint8(16, 8); // bit depth
				IHDR_view.setUint8(17, 6); // color_type, 2 = RGB, 6 = RGBA
				IHDR_view.setUint8(18, 0); // compression method
				IHDR_view.setUint8(19, 0); // filter method
				IHDR_view.setUint8(20, 0); // interlace method
				IHDR_view.setUint32(21, this._crc(IHDR, 4, 4 + 13));
				chunks.push(IHDR.buffer);

				//######################################
				// add acTL (animation control chunk) => updated later
				//######################################
				var acTL = new Uint8Array(8 + 8 + 4); // 20 bytes
				var acTL_view = new DataView(acTL.buffer);
				acTL_view.setUint32(0, 8);
				this._writeStr(acTL, 4, 'acTL');
				acTL_view.setUint32(8, frame_blobs.length);
				acTL_view.setUint32(12, 0); // num_plays, 0 = loop forever
				acTL_view.setUint32(16, this._crc(acTL, 4, 4 + 8));
				chunks.push(acTL.buffer);
			}

			//######################################
			// add fcTL (frame control chunk)
			//######################################
			var fcTL = new Uint8Array(8 + 26 + 4); // 38 bytes
			var fcTL_view = new DataView(fcTL.buffer);
			fcTL_view.setUint32(0, 26);
			this._writeStr(fcTL, 4, 'fcTL');
			fcTL_view.setUint32(8, sequence_number++);
			fcTL_view.setUint32(12, VIDEO_WIDTH);
			fcTL_view.setUint32(16, VIDEO_HEIGHT);
			fcTL_view.setUint32(20, 0);
			fcTL_view.setUint32(24, 0);
			//	The delay_num and delay_den parameters together specify a fraction
			//	indicating the time to display the current frame, in seconds. If the denominator
			//	is 0, it is to be treated as if it were 100 (that is, `delay_num` then specifies
			//	1/100ths of a second). If the the value of the numerator is 0 the decoder should
			//	render the next frame as quickly as possible, though viewers may impose a
			//	reasonable lower bound.
			fcTL_view.setUint16(28, 1000/VIDEO_FPS); // delay_num
			fcTL_view.setUint16(30, 1000); // delay_den
			fcTL_view.setUint8(32, 0); // dispose_op
			fcTL_view.setUint8(33, 0); // blend_op
			fcTL_view.setUint32(34, this._crc(fcTL, 4, 4 + 26));
			chunks.push(fcTL.buffer);

			// parse PNG chunks
			var len = reader.result.byteLength;
			while (true){
				var chunkLen = view.getUint32(pos);
				if (view.getUint32(pos+4)==0x49444154){ // 'IDAT'

					//add either as IDAT or fdAT chunk
					if (frame_num==0){
						//######################################
						// add IDAT chunk
						//######################################
						chunks.push(reader.result.slice(pos, pos+chunkLen+8+4));

					}else{
						//######################################
						// add fdAT chunk
						//######################################
						var fdAT = new Uint8Array(4);
						var fdAT_view = new DataView(fdAT.buffer);
						fdAT_view.setUint32(0, chunkLen + 4);
						chunks.push(fdAT.buffer);

						fdAT = new Uint8Array( reader.result.slice(pos, pos+chunkLen+8+4) );
						fdAT_view = new DataView(fdAT.buffer);
						this._writeStr(fdAT, 0, 'fdAT');
						fdAT_view.setUint32(4, sequence_number++);
						fdAT_view.setUint32(chunkLen+8, this._crc(fdAT, 0, chunkLen + 8)); // update crc32
						chunks.push(fdAT.buffer);
					}
				}

				pos += chunkLen + 12; // size (4 bytes) + name (4 bytes) + data + crc (4 bytes)
				if (pos >= len) break;
			}

			frame_num++;

			if (frame_num<frame_blobs.length){

				// handle next frame
				reader.readAsArrayBuffer(frame_blobs[frame_num]);

			}else{
				//######################################
				// add IEND chunk
				//######################################
				chunks.push(new Uint8Array([0,0,0,0, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82]).buffer); // 12 bytes

				if (console.timeEnd) console.timeEnd('Encoding APNG');
				this._blob = new Blob(chunks, {type: 'image/png'});
				cb(this._blob);
			}
		};

		// handle first frame
		reader.readAsArrayBuffer(frame_blobs[0]);
	};

	/**
	 * Utility, saves APNG blob as local file
	 * @param {string} [filename=animation.png]
	 */
	APNGEncoder.prototype.saveAsFile = function(filename){
		if (!filename) filename = 'animation.png';
		var a = document.createElement('a');
		document.body.appendChild(a);
		a.style = 'display: none';
		var url = window.URL.createObjectURL(this._blob);
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 100);
	};

	/**
	 * Utility, uploads APNG blob via ajax and HTTP POST
	 * @param {string} url
	 * @param {string} varName - POST var name for uploaded PNG
	 * @param {object} postVars - additional POST vars, {} for none
	 * @param {function} cbLoaded
	 * @param {function} [cbProgress]
	 */
	APNGEncoder.prototype.upload =  function (url, varName, postVars, cbLoaded, cbProgress) {
		var fd = new FormData();
		fd.append(varName, this._blob);
		if (postVars){
			for (var k in postVars) fd.append(k, postVars[k]);
		}
		var xhr = new XMLHttpRequest();
		xhr.addEventListener('load', function(e) {
			cbLoaded(true, e);
		}, false);
		xhr.addEventListener('error', function(e) {
			cbLoaded(false, e);
		}, false);
		if (xhr.upload && cbProgress) {
			xhr.upload.onprogress = function(e){
				if (e.lengthComputable) {
					cbProgress(e.loaded/e.total);
				}
			}
		}
		xhr.open('POST', url);
		xhr.send(fd);
	};

	/**
	 * @private
	 */
	APNGEncoder.prototype._writeStr = function(arr, pos, str){
		for (var i=0;i<str.length;i++){
			arr[pos+i] = str.charCodeAt(i);
		}
	};

	/**
	 * @private
	 */
	APNGEncoder.prototype._crcUpdate = function(c, buf, off, len) {
		for (var i=0; i<len; i++)  c = this._crcTable[(c ^ buf[off+i]) & 0xff] ^ (c >>> 8);
		return c;
	};

	/**
	 * @private
	 */
	APNGEncoder.prototype._crc = function(b,o,l){
		return this._crcUpdate(0xffffffff,b,o,l) ^ 0xffffffff;
	};

	// export
	root.APNGEncoder = APNGEncoder;

})(window);
