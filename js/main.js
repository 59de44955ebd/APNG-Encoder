/**
 * APNG camera recorder
 * This demo uses canvas.toBlob(...) to record camera frames as PNG blobs.
 * @version 0.3
 */

'use strict';

// CONFIG ##############################
var VIDEO_FPS = 15;
var VIDEO_FRAME_COUNT = 45; // 3 sec.
var VIDEO_WIDTH = 480;
var VIDEO_HEIGHT = 360;
//######################################

var video = document.querySelector('video');
var canvas = window.canvas = document.querySelector('canvas');
canvas.width = VIDEO_WIDTH;
canvas.height = VIDEO_HEIGHT;
var ctx = canvas.getContext('2d');
var image = document.querySelector('#play-back');

var buttonRecord = document.querySelector('#btn-record');
var buttonSave = document.querySelector('#btn-save');
var buttonUpload = document.querySelector('#btn-upload');

var statusDisplay = document.querySelector('#status-display');
var urlCreator = window.URL || window.webkitURL;

var apng = new APNGEncoder(VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS);

function logStatus(msg) {
	//console.log(msg);
	statusDisplay.innerHTML = msg;
}

buttonRecord.addEventListener('click', function () {
	buttonRecord.disabled = true;
	buttonSave.disabled = true;
	buttonUpload.disabled = true;

	logStatus('Recording...');

	var frame_blobs = [];
	var rec = setInterval(function(){
		ctx.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
		if (frame_blobs.length>=VIDEO_FRAME_COUNT){
			clearInterval(rec); // stop recording
			logStatus('Recording done! Encoding APNG...');
			apng.createFromBlobs(frame_blobs, function(blob){
				logStatus('Encoding done!');

				// display animated PNG
				if (image.src.startsWith('blob:')) urlCreator.revokeObjectURL(image.src);
				image.src = urlCreator.createObjectURL(blob);

				buttonRecord.disabled = false;
				buttonSave.disabled = false;
				buttonUpload.disabled = false;
			});
		}else{
			canvas.toBlob(function(blob){
				frame_blobs.push(blob);
			});
		}
	}, 1000/VIDEO_FPS);
});

buttonSave.addEventListener('click', function () {
	apng.saveAsFile();
});

buttonUpload.addEventListener('click', function () {
	logStatus('Uploading clip...');
	buttonUpload.disabled = true;
	apng.upload(
		'echo.php',
		'clip',
		{foo: 'bar'},
		function(ok, e){
			if (ok)
				logStatus('The clip was uploaded successfully \\o/');
			else
				logStatus('Uploading the clip failed :-(');
			if (e.target.responseText) alert(e.target.responseText);
			buttonUpload.disabled = false;
		},
		function(prog){
			logStatus('Uploading clip ['+Math.ceil(100*prog)+'%]');
		}
	);
});

var constraints = {
	audio: false,
	video: true
};

function successCallback(stream) {
	video = attachMediaStream(video, stream);
	buttonRecord.disabled = false;
}

function errorCallback(error) {
	logStatus('navigator.getUserMedia error: ' + error);
}

if (typeof Promise === 'undefined') {
	navigator.getUserMedia(constraints, successCallback, errorCallback);
} else {
	navigator.mediaDevices.getUserMedia(constraints)
	.then(successCallback).catch(errorCallback);
}
